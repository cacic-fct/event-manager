#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import mysql from 'mysql2/promise';
import { assertConfig } from './core.mjs';
import { readEvcompSnapshot } from './source-adapter.mjs';
import { readEvcompSqlDump } from './sql-dump-adapter.mjs';
import { writeTransferFiles } from './transfer-files.mjs';

const VALUE_FLAGS = new Map([
  ['--config', 'configPath'],
  ['--source-sql', 'sourceSqlPath'],
  ['--source-namespace', 'sourceNamespace'],
  ['--export-json', 'exportDirectory'],
]);

const REMOVED_FLAGS = new Map([
  ['--apply', '--apply has been removed; this tool only exports JSON transfer files.'],
  ['--report', '--report has been removed; export details are written to manifest.json.'],
]);

const USAGE =
  'Usage: node tools/evcomp-import/index.mjs [--config <file>] [--source-sql <dump.sql>] ' +
  '[--source-namespace <name>] --export-json <directory>\n' +
  'Read an EvComp MySQL database or SQL dump and export validated JSON transfer files.\n';

export function parseArguments(argv) {
  const options = {};
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help') {
      help = true;
      continue;
    }
    if (REMOVED_FLAGS.has(argument)) {
      throw new Error(REMOVED_FLAGS.get(argument));
    }
    const optionName = VALUE_FLAGS.get(argument);
    if (!optionName) {
      throw new Error(`Unknown option: ${argument}. Use --help to see supported options.`);
    }
    if (options[optionName] !== undefined) {
      throw new Error(`${argument} may only be provided once.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }
    options[optionName] = value;
    index += 1;
  }

  if (!help && !options.exportDirectory) {
    throw new Error('--export-json is required and must name a new output directory.');
  }
  return { ...options, help };
}

export function validateSourceTimezoneOffset(value) {
  if (!/^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error('EVCOMP_TIMEZONE_OFFSET must use an offset such as -03:00.');
  }
  return value;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArguments(argv);
  if (args.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (!args.sourceSqlPath && !env.EVCOMP_DATABASE_URL) {
    throw new Error('EVCOMP_DATABASE_URL or --source-sql is required.');
  }

  let config = args.configPath ? JSON.parse(await readFile(resolve(args.configPath), 'utf8')) : {};
  assertConfig(config);
  if (args.sourceNamespace !== undefined) {
    config = { ...config, sourceNamespace: args.sourceNamespace };
  }
  assertConfig(config);

  const sourceTimezone = validateSourceTimezoneOffset(env.EVCOMP_TIMEZONE_OFFSET ?? '-03:00');
  const snapshot = args.sourceSqlPath
    ? await readEvcompSqlDump(resolve(args.sourceSqlPath), config.sourceSchema, sourceTimezone)
    : undefined;
  const source = snapshot
    ? undefined
    : await mysql.createConnection({
        uri: env.EVCOMP_DATABASE_URL,
        timezone: sourceTimezone,
      });

  try {
    const sourceSnapshot = snapshot ?? (await readEvcompSnapshot(source, config.sourceSchema, sourceTimezone));
    const { exportTransferDocuments } = await import('./transfer-export.mjs');
    const result = exportTransferDocuments(sourceSnapshot, config);
    const output = await writeTransferFiles(args.exportDirectory, result);
    process.stdout.write(`Exported ${output.files.length} JSON data files to ${output.directory}\n`);
    process.stdout.write('See manifest.json for import order, counts, and records requiring manual handling.\n');
  } finally {
    await source?.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch((error) => {
    process.stderr.write(`EvComp JSON export failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
