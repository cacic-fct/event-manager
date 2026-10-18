import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments, validateSourceTimezoneOffset } from './index.mjs';

test('requires the JSON export directory and accepts source input options', () => {
  assert.throws(() => parseArguments([]), /--export-json is required/);
  assert.deepEqual(
    parseArguments([
      '--source-sql',
      'evcomp.sql.gz',
      '--config',
      'config.json',
      '--source-namespace',
      'evcomp-2026',
      '--export-json',
      'output',
    ]),
    {
      sourceSqlPath: 'evcomp.sql.gz',
      configPath: 'config.json',
      sourceNamespace: 'evcomp-2026',
      exportDirectory: 'output',
      help: false,
    },
  );
});

test('rejects removed database import options and unknown flags', () => {
  assert.throws(() => parseArguments(['--apply']), /--apply has been removed/);
  assert.throws(() => parseArguments(['--report', 'report.json']), /--report has been removed/);
  assert.throws(() => parseArguments(['--target-sql', 'target.sql', '--export-json', 'output']), /Unknown option/);
  assert.throws(() => parseArguments(['--export-json']), /--export-json requires a value/);
  assert.throws(() => parseArguments(['--export-json', 'output', '--export-json', 'other']), /only be provided once/);
});

test('validates source time zone offsets', () => {
  assert.equal(validateSourceTimezoneOffset('-03:00'), '-03:00');
  assert.equal(validateSourceTimezoneOffset('+05:30'), '+05:30');
  assert.throws(() => validateSourceTimezoneOffset('UTC-3'), /EVCOMP_TIMEZONE_OFFSET/);
});
