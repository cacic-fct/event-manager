#!/usr/bin/env node

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import process from 'node:process';
import { CsvError, readCsvFile } from './lib/csv.mts';
import type { CsvDocument } from './lib/csv.mts';
import { isMain } from './lib/common.mts';
import { dedupeParticipationResources } from './lib/participation.mts';
import { writeTransferResources } from './lib/transfer.mts';
import type { TransferResource } from './lib/transfer.mts';
import { normalizeSpaces, normalizeTextKey } from './lib/text.mts';

const DEFAULT_NAME_COLUMN_KEYS = new Set(['full name', 'fullname', 'nome completo', 'name', 'nome']);
const PEOPLE_COLUMNS = ['fullName', 'email', 'enrollmentNumber', 'identityDocument'] as const;
const PERSON_IDENTIFIER_COLUMNS = ['email', 'enrollmentNumber', 'identityDocument'] as const;
const TARGET_FIELD_BY_KIND = {
  'event-subscription': 'eventId',
  'group-subscription': 'eventGroupId',
  'major-event-subscription': 'majorEventId',
} as const;

export type CrossParticipationKind = keyof typeof TARGET_FIELD_BY_KIND;

export interface CrossCsvArgs {
  peopleCsv: string;
  inputDir?: string;
  outputDir?: string;
  targetKind?: CrossParticipationKind;
  targetId: string;
  glob: string;
  recursive: boolean;
  nameColumn: string;
  help: boolean;
}

export interface PersonRecord {
  fullName: string;
  email: string;
  enrollmentNumber: string;
  identityDocument: string;
}

export interface PeopleLookupResult {
  lookup: Map<string, PersonRecord>;
  collisions: number;
  ambiguousNameKeys: ReadonlySet<string>;
}

export interface BuildParticipationResourcesOptions {
  inputCsvPath: string;
  inputDir: string;
  targetKind: CrossParticipationKind;
  targetId: string;
  peopleLookup: ReadonlyMap<string, PersonRecord>;
  explicitNameColumn?: string;
}

export interface CrossCsvBuildResult {
  resources: TransferResource[];
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
  rowsSkippedWithoutName: number;
}

export interface CrossCsvRunResult {
  processedFiles: number;
  resources: number;
  duplicateResourcesRemoved: number;
  sameNameReferenceGroups: number;
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
  rowsSkippedWithoutName: number;
  collisions: number;
  outputDirectory: string;
}

interface GlobOptions {
  cwd: string;
  nodir: boolean;
  dot: boolean;
}

type GlobSync = (pattern: string, options: GlobOptions) => string[];

function globSync(pattern: string, options: GlobOptions): string[] {
  const candidate = Reflect.get(fs, 'globSync');
  if (typeof candidate !== 'function') {
    throw new Error('This Node.js runtime does not provide fs.globSync.');
  }
  return (candidate as GlobSync)(pattern, options);
}

export class CrossCsvInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossCsvInputError';
  }
}

function isCrossParticipationKind(value: string): value is CrossParticipationKind {
  return Object.hasOwn(TARGET_FIELD_BY_KIND, value);
}

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): CrossCsvArgs {
  const args: CrossCsvArgs = {
    peopleCsv: '',
    outputDir: 'import/transfers/cross-csv',
    targetId: '',
    glob: '*.csv',
    recursive: false,
    nameColumn: '',
    help: false,
  };
  const valueFlags = new Set([
    '--people-csv',
    '--input-dir',
    '--output',
    '--glob',
    '--name-column',
    '--target-kind',
    '--target-id',
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--recursive') {
      args.recursive = true;
      continue;
    }
    const equalsIndex = token.indexOf('=');
    const flag = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
    if (!valueFlags.has(flag)) {
      throw new CrossCsvInputError(`Unknown argument: ${token}`);
    }
    const inlineValue = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined;
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new CrossCsvInputError(`Argument ${flag} requires a value.`);
    }
    switch (flag) {
      case '--people-csv':
        args.peopleCsv = value;
        break;
      case '--input-dir':
        args.inputDir = value;
        break;
      case '--output':
        args.outputDir = value;
        break;
      case '--glob':
        args.glob = value;
        break;
      case '--name-column':
        args.nameColumn = value;
        break;
      case '--target-kind':
        if (!isCrossParticipationKind(value)) {
          throw new CrossCsvInputError(`Unsupported target kind: ${value}`);
        }
        args.targetKind = value;
        break;
      case '--target-id':
        args.targetId = value;
        break;
    }
  }

  if (!args.help && !args.inputDir) {
    throw new CrossCsvInputError('Argument --input-dir is required.');
  }
  if (!args.help && !args.peopleCsv) {
    throw new CrossCsvInputError('Argument --people-csv is required.');
  }
  if (!args.help && !args.targetKind) {
    throw new CrossCsvInputError('Argument --target-kind is required.');
  }
  if (!args.help && !args.targetId) {
    throw new CrossCsvInputError('Argument --target-id is required.');
  }
  return args;
}

export function usage() {
  return [
    'Usage: bun run data-import -- cross-csv-to-json --input-dir <directory> --people-csv <path> --target-kind <kind> --target-id <id> [options]',
    '',
    'Options:',
    '  --people-csv <path>      CSV with fullName, email, enrollmentNumber, and identityDocument columns',
    '  --input-dir <directory>  Directory containing CSV files (required)',
    '  --target-kind <kind>     event-subscription, group-subscription, or major-event-subscription',
    '  --target-id <id>         Existing target ID used for each matching row',
    '  --output <directory>     JSON transfer output directory (default: import/transfers/cross-csv)',
    '  --glob <pattern>         Input glob (default: *.csv)',
    '  --recursive              Search input directory recursively',
    '  --name-column <name>     Explicit name column (case/accent-insensitive)',
  ].join('\n');
}

export function findNameColumn(fieldnames: readonly string[], explicitColumn = ''): string {
  if (explicitColumn) {
    const explicitKey = normalizeTextKey(explicitColumn);
    const match = fieldnames.find((fieldname) => normalizeTextKey(fieldname) === explicitKey);
    if (match) {
      return match;
    }
    throw new CrossCsvInputError(`Name column '${explicitColumn}' not found in input CSV.`);
  }
  const match = fieldnames.find((fieldname) => DEFAULT_NAME_COLUMN_KEYS.has(normalizeTextKey(fieldname)));
  if (match) {
    return match;
  }
  throw new CrossCsvInputError('Could not detect full-name column. Use --name-column to set it explicitly.');
}

export async function readPeopleLookup(peopleCsvPath: string): Promise<PeopleLookupResult> {
  let parsed: CsvDocument;
  try {
    parsed = await readCsvFile(peopleCsvPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`People CSV not found: ${peopleCsvPath}`);
    }
    throw error;
  }
  const missingColumns = PEOPLE_COLUMNS.filter((column) => !parsed.headers.includes(column));
  if (missingColumns.length > 0) {
    throw new CrossCsvInputError(`People CSV missing required columns: ${missingColumns.sort().join(', ')}`);
  }

  const lookup = new Map<string, PersonRecord>();
  const ambiguousNames = new Set<string>();
  for (const row of parsed.rows) {
    const fullName = normalizeSpaces(row.fullName);
    if (!fullName) {
      continue;
    }
    const nameKey = normalizeTextKey(fullName);
    if (!nameKey) {
      continue;
    }
    if (ambiguousNames.has(nameKey)) {
      continue;
    }

    const candidate: PersonRecord = {
      fullName,
      email: normalizeSpaces(row.email),
      enrollmentNumber: normalizeSpaces(row.enrollmentNumber),
      identityDocument: normalizeSpaces(row.identityDocument),
    };
    const existing = lookup.get(nameKey);
    if (!existing) {
      lookup.set(nameKey, candidate);
      continue;
    }
    const hasConflictingIdentifier = PERSON_IDENTIFIER_COLUMNS.some(
      (column) => existing[column] && candidate[column] && existing[column] !== candidate[column],
    );
    if (hasConflictingIdentifier) {
      ambiguousNames.add(nameKey);
      lookup.delete(nameKey);
      continue;
    }
    lookup.set(nameKey, {
      fullName: existing.fullName || candidate.fullName,
      email: existing.email || candidate.email,
      enrollmentNumber: existing.enrollmentNumber || candidate.enrollmentNumber,
      identityDocument: existing.identityDocument || candidate.identityDocument,
    });
  }
  return { lookup, collisions: ambiguousNames.size, ambiguousNameKeys: ambiguousNames };
}

function isWithinDirectory(parentPath: string, candidatePath: string): boolean {
  const child = relative(parentPath, candidatePath);
  return child === '' || (!child.startsWith('..') && !child.startsWith('/'));
}

export function iterInputCsvPaths(
  inputDir: string,
  pattern = '*.csv',
  recursive = false,
  outputDir?: string,
): string[] {
  const globPattern = recursive && !pattern.startsWith('**/') ? `**/${pattern}` : pattern;
  const outputRoot = outputDir ? resolve(outputDir) : undefined;
  return globSync(globPattern, { cwd: inputDir, nodir: true, dot: true })
    .map((path) => resolve(inputDir, path))
    .filter((path) => !outputRoot || !isWithinDirectory(outputRoot, path))
    .sort();
}

export async function buildParticipationResourcesForCsv({
  inputCsvPath,
  inputDir,
  targetKind,
  targetId,
  peopleLookup,
  explicitNameColumn = '',
}: BuildParticipationResourcesOptions): Promise<CrossCsvBuildResult> {
  let parsed: CsvDocument;
  try {
    parsed = await readCsvFile(inputCsvPath);
  } catch (error) {
    if (error instanceof CsvError) {
      throw new CrossCsvInputError(error.message);
    }
    throw error;
  }
  const fieldnames = [...parsed.headers];
  const nameColumn = findNameColumn(fieldnames, explicitNameColumn);
  const targetField = TARGET_FIELD_BY_KIND[targetKind];
  const fileKey = createHash('sha256').update(relative(inputDir, inputCsvPath)).digest('hex');
  const resources: TransferResource[] = [];
  let rowsMatched = 0;
  let rowsUnmatched = 0;
  let rowsSkippedWithoutName = 0;

  parsed.rows.forEach((row, rowIndex) => {
    const fullName = normalizeSpaces(row[nameColumn]);
    if (!fullName) {
      rowsSkippedWithoutName += 1;
      return;
    }
    const person = peopleLookup.get(normalizeTextKey(fullName));
    if (person) rowsMatched += 1;
    else rowsUnmatched += 1;

    resources.push({
      kind: targetKind,
      key: `CROSS-${fileKey}-${rowIndex + 1}`,
      data: {
        [targetField]: targetId,
        person: {
          name: person?.fullName || fullName,
          ...(person?.email ? { email: person.email } : {}),
          ...(person?.enrollmentNumber ? { academicId: person.enrollmentNumber } : {}),
          ...(person?.identityDocument ? { identityDocument: person.identityDocument } : {}),
        },
      },
    });
  });

  return {
    resources,
    rowsTotal: parsed.rows.length,
    rowsMatched,
    rowsUnmatched,
    rowsSkippedWithoutName,
  };
}

export async function runCrossCsv(args: CrossCsvArgs): Promise<CrossCsvRunResult> {
  if (!args.inputDir) {
    throw new CrossCsvInputError('Argument --input-dir is required.');
  }
  if (!args.peopleCsv) {
    throw new CrossCsvInputError('Argument --people-csv is required.');
  }
  if (!args.targetKind) {
    throw new CrossCsvInputError('Argument --target-kind is required.');
  }
  if (!args.targetId) {
    throw new CrossCsvInputError('Argument --target-id is required.');
  }
  const inputDir = resolve(args.inputDir);
  const peopleCsvPath = resolve(args.peopleCsv);
  const outputDir = resolve(args.outputDir ?? 'import/transfers/cross-csv');
  const inputStats = await stat(inputDir).catch(() => undefined);
  if (!inputStats?.isDirectory()) {
    throw new Error(`Input directory does not exist or is not a directory: ${inputDir}`);
  }
  const { lookup: peopleLookup, collisions, ambiguousNameKeys } = await readPeopleLookup(peopleCsvPath);
  const inputPaths = iterInputCsvPaths(inputDir, args.glob, args.recursive, outputDir).filter(
    (path) => resolve(path) !== peopleCsvPath,
  );
  if (inputPaths.length === 0) {
    throw new Error(`No CSV files found in ${inputDir} for pattern '${args.glob}'.`);
  }

  let processedFiles = 0;
  let rowsTotal = 0;
  let rowsMatched = 0;
  let rowsUnmatched = 0;
  let rowsSkippedWithoutName = 0;
  let resources: TransferResource[] = [];
  const skippedFiles: Array<{ file: string; reason: string }> = [];
  for (const inputCsvPath of inputPaths) {
    try {
      const result = await buildParticipationResourcesForCsv({
        inputCsvPath,
        inputDir,
        targetKind: args.targetKind,
        targetId: args.targetId,
        peopleLookup,
        explicitNameColumn: args.nameColumn,
      });
      processedFiles += 1;
      resources = resources.concat(result.resources);
      rowsTotal += result.rowsTotal;
      rowsMatched += result.rowsMatched;
      rowsUnmatched += result.rowsUnmatched;
      rowsSkippedWithoutName += result.rowsSkippedWithoutName;
      process.stdout.write(
        `Processed ${inputCsvPath} (rows=${result.rowsTotal}, participation_refs=${result.resources.length}, matched=${result.rowsMatched}, unmatched=${result.rowsUnmatched}, skipped_without_name=${result.rowsSkippedWithoutName})\n`,
      );
    } catch (error) {
      if (!(error instanceof CrossCsvInputError || error instanceof CsvError)) {
        throw error;
      }
      process.stderr.write(`WARNING: Skipped ${inputCsvPath} -> ${error.message}\n`);
      skippedFiles.push({ file: relative(inputDir, inputCsvPath), reason: error.message });
    }
  }
  if (processedFiles === 0) {
    throw new Error('No CSV file could be processed. Check name column settings.');
  }
  const deduplicated = dedupeParticipationResources(resources, ambiguousNameKeys);
  resources = deduplicated.resources;
  const written = await writeTransferResources(outputDir, resources, {
    source: 'cross-csv',
    targetKind: args.targetKind,
    targetId: args.targetId,
    peopleCsv: peopleCsvPath,
    processedFiles,
    skippedFiles,
    rows: rowsTotal,
    rowsMatched,
    rowsUnmatched,
    rowsSkippedWithoutName,
    resources: resources.length,
    duplicateResourcesRemoved: deduplicated.duplicateResourcesRemoved,
    sameNameReferenceGroups: deduplicated.sameNameReferenceGroups,
    lookupCollisions: collisions,
  });
  process.stdout.write(
    `Done. files=${processedFiles}, rows=${rowsTotal}, participation_refs=${resources.length}, duplicates_removed=${deduplicated.duplicateResourcesRemoved}, same_name_groups=${deduplicated.sameNameReferenceGroups}, matched=${rowsMatched}, unmatched=${rowsUnmatched}, skipped_without_name=${rowsSkippedWithoutName}, lookup_collisions=${collisions}, output=${written.directory}\n`,
  );
  return {
    processedFiles,
    resources: resources.length,
    duplicateResourcesRemoved: deduplicated.duplicateResourcesRemoved,
    sameNameReferenceGroups: deduplicated.sameNameReferenceGroups,
    rowsTotal,
    rowsMatched,
    rowsUnmatched,
    rowsSkippedWithoutName,
    collisions,
    outputDirectory: written.directory,
  };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      await runCrossCsv(args);
    }
  } catch (error) {
    process.stderr.write(`Cross-CSV JSON export failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
