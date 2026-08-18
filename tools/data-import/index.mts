#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const commands = [
  'cross-csv-people-info',
  'firestore-to-postgres',
  'reevaluate-attendance-categories',
  'reevaluate-secompp-attendance-categories',
  'secompp25-csv-events-to-subscriptions',
  'secompp-to-postgres',
  'secompp2-to-postgres',
] as const;
type DataImportCommand = (typeof commands)[number];

const commandSet: ReadonlySet<string> = new Set(commands);

function isDataImportCommand(value: string): value is DataImportCommand {
  return commandSet.has(value);
}

function usage() {
  return [
    'Usage: bun run data-import -- <command> [options]',
    '',
    'Commands:',
    ...commands.map((command) => `  ${command}`),
    '',
    'Run a command with --help to see its options.',
  ].join('\n');
}

const [command, ...args] = process.argv.slice(2);
if (!command || command === '--help' || command === '-h') {
  process.stdout.write(`${usage()}\n`);
  process.exitCode = command ? 0 : 1;
} else {
  if (!isDataImportCommand(command)) {
    process.stderr.write(`Unknown data-import command: ${command}\n\n${usage()}\n`);
    process.exitCode = 1;
  } else {
    const sourceExtension = fileURLToPath(import.meta.url).endsWith('.mts') ? '.mts' : '.mjs';
    const entryPoint = `${command}${sourceExtension}`;
    const result = spawnSync(process.execPath, [fileURLToPath(new URL(entryPoint, import.meta.url)), ...args], {
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
}
