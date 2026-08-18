#!/usr/bin/env node

import * as fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';
import {
  CsvError,
  readCsvFile,
  writeCsvAtomic,
} from './lib/csv.mts';
import type { CsvDocument, CsvRow } from './lib/csv.mts';
import { isMain } from './lib/common.mts';
import { normalizeSpaces, normalizeTextKey } from './lib/text.mts';

const DEFAULT_NAME_COLUMN_KEYS = new Set([
  'full name',
  'fullname',
  'nome completo',
  'name',
  'nome',
]);
const PEOPLE_COLUMNS = ['fullName', 'email', 'enrollmentNumber', 'identityDocument'] as const;
const CROSS_COLUMNS = [
  'crossMatchedFullName',
  'crossEmail',
  'crossEnrollmentNumber',
  'crossIdentityDocument',
  'crossMatchFound',
] as const;

export interface CrossPeopleArgs {
  peopleDb: string;
  inputDir?: string;
  outputDir?: string;
  glob: string;
  recursive: boolean;
  nameColumn: string;
  outputSuffix: string;
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
}

export interface EnrichCsvOptions {
  inputCsvPath: string;
  outputCsvPath: string;
  peopleLookup: ReadonlyMap<string, PersonRecord>;
  explicitNameColumn?: string;
}

export interface EnrichCsvStats {
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
}

export interface CrossPeopleRunResult {
  processedFiles: number;
  rowsTotal: number;
  rowsMatched: number;
  rowsUnmatched: number;
  collisions: number;
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

export class CrossPeopleInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossPeopleInputError';
  }
}

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): CrossPeopleArgs {
  const args: CrossPeopleArgs = {
    peopleDb: 'import/secompp25_subscriptions.csv',
    glob: '*.csv',
    recursive: false,
    nameColumn: '',
    outputSuffix: '_crossed',
    help: false,
  };
  const valueFlags = new Set([
    '--people-db',
    '--input-dir',
    '--output-dir',
    '--glob',
    '--name-column',
    '--output-suffix',
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
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
      throw new CrossPeopleInputError(`Unknown argument: ${token}`);
    }
    const inlineValue = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined;
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new CrossPeopleInputError(`Argument ${flag} requires a value.`);
    }
    switch (flag) {
      case '--people-db':
        args.peopleDb = value;
        break;
      case '--input-dir':
        args.inputDir = value;
        break;
      case '--output-dir':
        args.outputDir = value;
        break;
      case '--glob':
        args.glob = value;
        break;
      case '--name-column':
        args.nameColumn = value;
        break;
      case '--output-suffix':
        args.outputSuffix = value;
        break;
    }
  }

  if (!args.help && !args.inputDir) {
    throw new CrossPeopleInputError('Argument --input-dir is required.');
  }
  return args;
}

export function usage() {
  return [
    'Usage: bun run data-import -- cross-csv-people-info --input-dir <directory> [options]',
    '',
    'Options:',
    '  --people-db <path>       People database CSV (default: import/secompp25_subscriptions.csv)',
    '  --input-dir <directory>  Directory containing CSV files (required)',
    '  --output-dir <directory> Output directory (default: <input-dir>/crossed)',
    '  --glob <pattern>         Input glob (default: *.csv)',
    '  --recursive              Search input directory recursively',
    '  --name-column <name>     Explicit name column (case/accent-insensitive)',
    '  --output-suffix <value>  Output filename suffix (default: _crossed)',
  ].join('\n');
}

export function findNameColumn(fieldnames: readonly string[], explicitColumn = ''): string {
  if (explicitColumn) {
    const explicitKey = normalizeTextKey(explicitColumn);
    const match = fieldnames.find((fieldname) => normalizeTextKey(fieldname) === explicitKey);
    if (match) return match;
    throw new CrossPeopleInputError(`Name column '${explicitColumn}' not found in input CSV.`);
  }
  const match = fieldnames.find((fieldname) => DEFAULT_NAME_COLUMN_KEYS.has(normalizeTextKey(fieldname)));
  if (match) return match;
  throw new CrossPeopleInputError(
    'Could not detect full-name column. Use --name-column to set it explicitly.',
  );
}

export async function readPeopleLookup(peopleDbPath: string): Promise<PeopleLookupResult> {
  let parsed: CsvDocument;
  try {
    parsed = await readCsvFile(peopleDbPath);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`People database CSV not found: ${peopleDbPath}`);
    }
    throw error;
  }
  const missingColumns = PEOPLE_COLUMNS.filter((column) => !parsed.headers.includes(column));
  if (missingColumns.length > 0) {
    throw new CrossPeopleInputError(
      `People database CSV missing required columns: ${missingColumns.sort().join(', ')}`,
    );
  }

  const lookup = new Map<string, PersonRecord>();
  let collisions = 0;
  for (const row of parsed.rows) {
    const fullName = normalizeSpaces(row.fullName);
    if (!fullName) continue;
    const nameKey = normalizeTextKey(fullName);
    if (!nameKey) continue;

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
    if (PEOPLE_COLUMNS.some((column) => existing[column] !== candidate[column])) {
      collisions += 1;
    }
    lookup.set(nameKey, {
      fullName: existing.fullName || candidate.fullName,
      email: existing.email || candidate.email,
      enrollmentNumber: existing.enrollmentNumber || candidate.enrollmentNumber,
      identityDocument: existing.identityDocument || candidate.identityDocument,
    });
  }
  return { lookup, collisions };
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

export function buildOutputPath(
  inputCsvPath: string,
  inputDir: string,
  outputDir: string,
  outputSuffix: string,
): string {
  const relativePath = relative(inputDir, inputCsvPath);
  const extension = extname(relativePath);
  const stem = basename(relativePath, extension);
  const outputName = `${stem}${outputSuffix}${extension}`;
  return resolve(outputDir, dirname(relativePath), outputName);
}

export async function enrichCsvFile({
  inputCsvPath,
  outputCsvPath,
  peopleLookup,
  explicitNameColumn = '',
}: EnrichCsvOptions): Promise<EnrichCsvStats> {
  let parsed: CsvDocument;
  try {
    parsed = await readCsvFile(inputCsvPath);
  } catch (error) {
    if (error instanceof CsvError) {
      throw new CrossPeopleInputError(error.message);
    }
    throw error;
  }
  const fieldnames = [...parsed.headers];
  const nameColumn = findNameColumn(fieldnames, explicitNameColumn);
  const outputFieldnames = [...fieldnames, ...CROSS_COLUMNS];
  let rowsMatched = 0;
  let rowsUnmatched = 0;
  const outputRows: CsvRow[] = parsed.rows.map((row) => {
    const fullName = normalizeSpaces(row[nameColumn]);
    const person = peopleLookup.get(normalizeTextKey(fullName));
    if (!person) {
      rowsUnmatched += 1;
      return {
        ...row,
        crossMatchedFullName: '',
        crossEmail: '',
        crossEnrollmentNumber: '',
        crossIdentityDocument: '',
        crossMatchFound: 'false',
      };
    }
    rowsMatched += 1;
    return {
      ...row,
      crossMatchedFullName: person.fullName,
      crossEmail: person.email,
      crossEnrollmentNumber: person.enrollmentNumber,
      crossIdentityDocument: person.identityDocument,
      crossMatchFound: 'true',
    };
  });
  await writeCsvAtomic(outputCsvPath, outputFieldnames, outputRows);
  return {
    rowsTotal: outputRows.length,
    rowsMatched,
    rowsUnmatched,
  };
}

export async function runCrossPeople(args: CrossPeopleArgs): Promise<CrossPeopleRunResult> {
  if (!args.inputDir) {
    throw new CrossPeopleInputError('Argument --input-dir is required.');
  }
  const inputDir = resolve(args.inputDir);
  const peopleDbPath = resolve(args.peopleDb);
  const outputDir = resolve(args.outputDir ?? `${inputDir}/crossed`);
  const inputStats = await stat(inputDir).catch(() => undefined);
  if (!inputStats?.isDirectory()) {
    throw new Error(`Input directory does not exist or is not a directory: ${inputDir}`);
  }
  const { lookup: peopleLookup, collisions } = await readPeopleLookup(peopleDbPath);
  const inputPaths = iterInputCsvPaths(inputDir, args.glob, args.recursive, outputDir)
    .filter((path) => resolve(path) !== peopleDbPath);
  if (inputPaths.length === 0) {
    throw new Error(`No CSV files found in ${inputDir} for pattern '${args.glob}'.`);
  }

  let processedFiles = 0;
  let rowsTotal = 0;
  let rowsMatched = 0;
  let rowsUnmatched = 0;
  for (const inputCsvPath of inputPaths) {
    const outputCsvPath = buildOutputPath(inputCsvPath, inputDir, outputDir, args.outputSuffix);
    try {
      const stats = await enrichCsvFile({
        inputCsvPath,
        outputCsvPath,
        peopleLookup,
        explicitNameColumn: args.nameColumn,
      });
      processedFiles += 1;
      rowsTotal += stats.rowsTotal;
      rowsMatched += stats.rowsMatched;
      rowsUnmatched += stats.rowsUnmatched;
      process.stdout.write(
        `Processed ${inputCsvPath} -> ${outputCsvPath} (rows=${stats.rowsTotal}, matched=${stats.rowsMatched}, unmatched=${stats.rowsUnmatched})\n`,
      );
    } catch (error) {
      if (!(error instanceof CrossPeopleInputError || error instanceof CsvError)) throw error;
      process.stderr.write(`WARNING: Skipped ${inputCsvPath} -> ${error.message}\n`);
    }
  }
  if (processedFiles === 0) {
    throw new Error('No CSV file could be processed. Check name column settings.');
  }
  process.stdout.write(
    `Done. files=${processedFiles}, rows=${rowsTotal}, matched=${rowsMatched}, unmatched=${rowsUnmatched}, lookup_collisions=${collisions}\n`,
  );
  return { processedFiles, rowsTotal, rowsMatched, rowsUnmatched, collisions };
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      await runCrossPeople(args);
    }
  } catch (error) {
    process.stderr.write(`Cross CSV import failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
