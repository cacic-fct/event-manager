import { mkdir, mkdtemp, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { loadTransferContract } from './transfer-validation.mjs';

/** Publish a complete private export directory; never overwrite an earlier export. */
export async function writeTransferFiles(outputDirectory, result) {
  const destination = resolve(outputDirectory);
  const parent = dirname(destination);
  const { parseTransferJson, TransferDocumentSchema } = loadTransferContract();
  const filenames = new Set(['manifest.json', 'event-data.schema.json']);
  const files = result.documents.map(({ name, document }) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/.test(name) || filenames.has(name)) {
      throw new Error('Export filenames must be unique JSON basenames.');
    }
    filenames.add(name);
    const text = `${JSON.stringify(document, null, 2)}\n`;
    parseTransferJson(text);
    return { name, text, resources: document.resources.length, bytes: Buffer.byteLength(text) };
  });
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(join(parent, `.${basename(destination)}-`));
  try {
    for (const file of files) await writeFile(join(staging, file.name), file.text, { mode: 0o600 });
    await writeFile(join(staging, 'event-data.schema.json'), `${JSON.stringify(TransferDocumentSchema, null, 2)}\n`, {
      mode: 0o600,
    });
    const manifest = {
      ...result.report,
      files: files.map(({ name, resources, bytes }) => ({ name, resources, bytes })),
      instructions: [
        'Import the numbered files in order using Dados JSON and review every preview before applying.',
        'Participant names and identifiers are embedded in registrations and attendance. Review the prompts to create missing people, merge matching candidates, or skip their records.',
        'Creating people requires global Person.Read and Person.Create permissions; merging requires Person.Read and Person.Update. Resolve every person prompt before applying.',
        'Keep the source namespace unchanged across exports to retain stable catalog IDs.',
        'The schema and this manifest are reference files, not data files to import.',
        ...(result.report.rules?.after
          ? [
              'SECOMPP26 registrations retain their original tiers and are in earlier files than standalone After purchases. Apply those files before reviewing the purchase file.',
              'After purchases issue their own tickets. Do not add After event subscriptions or issue duplicate tickets separately. Buyers without a main registration receive only the purchased ticket.',
              'Unapproved After registrations are listed in the issues for manual review; no approved purchase or ticket was exported for them.',
            ]
          : []),
      ],
      limitations: [
        'The current format cannot transfer receipt attachments, issued certificate documents, lecturer assignments, or attendance collector permissions.',
        'EvComp accounting mode, Pix keys, activity prerequisites, modality descriptions/visibility, and lecturer-specific workload are not mapped.',
        'Registration creation dates and payment upload/review history have no matching transfer fields.',
      ],
    };
    await writeFile(join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    // mkdir reserves the destination atomically, including when another exporter races this one.
    await mkdir(destination, { mode: 0o700 });
    try {
      await rename(staging, destination);
    } catch (error) {
      // Remove only our empty reservation if publication fails.
      await rmdir(destination).catch(() => undefined);
      throw error;
    }
    return { directory: destination, files: manifest.files };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
