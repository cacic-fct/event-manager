import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TransferResource {
  kind: string;
  id?: string;
  key?: string;
  data: Record<string, unknown>;
}

interface TransferDocument {
  format: 'cacic-event-data';
  version: 1;
  resources: TransferResource[];
}

interface TransferContract {
  TRANSFER_MAX_RESOURCES: number;
  TRANSFER_MAX_BYTES: number;
  TransferDocumentSchema: unknown;
  parseTransferJson(text: string): unknown;
}

let contract: TransferContract | undefined;

/** Find the owning contract from either the source or compiled CLI location. */
export function loadTransferContract(): TransferContract {
  if (contract) return contract;
  let root = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(root, 'libs/shared-data-transfer/src/lib/schema.ts'))) {
    const parent = dirname(root);
    if (parent === root) throw new Error('Cannot locate the shared JSON transfer schema.');
    root = parent;
  }
  const require = createRequire(import.meta.url);
  const loader = require(join(root, 'tools/evcomp-import/transfer-validation.mjs')) as {
    loadTransferContract(): TransferContract;
  };
  contract = loader.loadTransferContract();
  return contract;
}

function document(resources: TransferResource[]): TransferDocument {
  return { format: 'cacic-event-data', version: 1, resources };
}

/** Keep each price table with its tiers: the domain validates the complete table on apply. */
function resourceGroups(resources: readonly TransferResource[]): TransferResource[][] {
  const tiers = new Map<string, TransferResource[]>();
  const priceIds = new Set(resources.filter((row) => row.kind === 'major-event-price').map((row) => row.id ?? row.key));
  for (const row of resources) {
    if (row.kind !== 'price-tier' || !priceIds.has(String(row.data.priceId))) continue;
    const id = String(row.data.priceId);
    const group = tiers.get(id) ?? [];
    group.push(row);
    tiers.set(id, group);
  }
  return resources.flatMap((row) => {
    if (row.kind === 'price-tier' && priceIds.has(String(row.data.priceId))) return [];
    return [[row, ...(row.kind === 'major-event-price' ? (tiers.get(row.id ?? row.key ?? '') ?? []) : [])]];
  });
}

export function createTransferDocuments(resources: readonly TransferResource[]): TransferDocument[] {
  const {
    TRANSFER_MAX_RESOURCES: maxResources,
    TRANSFER_MAX_BYTES: maxBytes,
    parseTransferJson,
  } = loadTransferContract();
  const identities = new Set<string>();
  const keys = new Set<string>();
  for (const row of resources) {
    if (row.id) {
      const identity = `${row.kind}:${row.id}`;
      if (identities.has(identity)) throw new Error(`Duplicate resource: ${identity}`);
      identities.add(identity);
    }
    if (row.key) {
      if (keys.has(row.key)) throw new Error(`Duplicate resource key: ${row.key}`);
      keys.add(row.key);
    }
  }
  const documents: TransferDocument[] = [];
  let current: TransferResource[] = [];
  const fits = (rows: TransferResource[]) =>
    rows.length <= maxResources && Buffer.byteLength(`${JSON.stringify(document(rows), null, 2)}\n`) <= maxBytes;
  const participationKinds = new Set([
    'major-event-subscription',
    'group-subscription',
    'event-subscription',
    'event-attendance',
  ]);
  let phase = 'catalog';
  for (const group of resourceGroups(resources)) {
    const nextPhase = participationKinds.has(group[0]?.kind ?? '') ? (group[0]?.kind ?? phase) : phase;
    // A parent subscription can create child subscriptions implicitly. A later preview
    // must observe those rows before an explicit child subscription can safely apply.
    if (nextPhase !== phase && current.length) {
      documents.push(document(current));
      current = [];
    }
    phase = nextPhase;
    if (!fits(group)) throw new Error('A resource or complete price table exceeds the JSON import limits.');
    if (!fits([...current, ...group])) {
      documents.push(document(current));
      current = [];
    }
    current.push(...group);
  }
  if (current.length) documents.push(document(current));
  // Local keys cannot cross file boundaries. Catalog converters use stable IDs for this reason.
  const keyFiles = new Map<string, number>();
  documents.forEach((file, index) =>
    file.resources.forEach((row) => {
      if (row.key) keyFiles.set(row.key, index);
    }),
  );
  function checkReference(value: unknown, index: number): void {
    if (typeof value === 'string' && keyFiles.has(value) && keyFiles.get(value) !== index) {
      throw new Error(`Local key ${value} crosses JSON files; use a stable catalog ID.`);
    }
    if (Array.isArray(value)) value.forEach((item) => checkReference(item, index));
  }
  documents.forEach((file, index) => {
    file.resources.forEach((row) => {
      for (const [field, value] of Object.entries(row.data)) {
        if (field.endsWith('Id') || field.endsWith('Ids')) checkReference(value, index);
      }
    });
    parseTransferJson(`${JSON.stringify(file, null, 2)}\n`);
  });
  return documents;
}

/** Validate everything before publishing a private directory, without overwriting an earlier export. */
export async function writeTransferResources(
  outputDirectory: string,
  resources: readonly TransferResource[],
  report: Record<string, unknown> = {},
): Promise<{ directory: string; files: Array<{ name: string; resources: number; bytes: number }> }> {
  const documents = createTransferDocuments(resources);
  const destination = resolve(outputDirectory);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(join(parent, `.${basename(destination)}-`));
  try {
    const files = [];
    for (const [index, file] of documents.entries()) {
      const name = `${String(index + 1).padStart(3, '0')}-event-data.json`;
      const text = `${JSON.stringify(file, null, 2)}\n`;
      await writeFile(join(staging, name), text, { mode: 0o600 });
      files.push({ name, resources: file.resources.length, bytes: Buffer.byteLength(text) });
    }
    await writeFile(
      join(staging, 'event-data.schema.json'),
      `${JSON.stringify(loadTransferContract().TransferDocumentSchema, null, 2)}\n`,
      { mode: 0o600 },
    );
    await writeFile(
      join(staging, 'manifest.json'),
      `${JSON.stringify(
        {
          ...report,
          files,
          instructions: [
            'Import numbered files in order using Dados JSON; review each preview before applying.',
            'Resolve participant create/merge/skip prompts in the administrative interface.',
            'Keep generated catalog IDs unchanged across exports. Save the normalized result after applying.',
            'The manifest and schema are reference files, not import files.',
          ],
        },
        null,
        2,
      )}\n`,
      { mode: 0o600 },
    );
    await mkdir(destination, { mode: 0o700 });
    try {
      await rename(staging, destination);
    } catch (error) {
      await rmdir(destination).catch(() => undefined);
      throw error;
    }
    return { directory: destination, files };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
