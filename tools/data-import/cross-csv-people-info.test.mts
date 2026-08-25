import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  buildOutputPath,
  enrichCsvFile,
  findNameColumn,
  iterInputCsvPaths,
  readPeopleLookup,
} from './cross-csv-people-info.mts';
import { parseCsvText } from './lib/csv.mts';

test('finds explicit and default name columns after normalization', () => {
  assert.equal(findNameColumn(['Data', 'Nome completo'], ''), 'Nome completo');
  assert.equal(findNameColumn(['Data', 'FULL NAME'], 'full name'), 'FULL NAME');
  assert.throws(() => findNameColumn(['Data'], ''), /Could not detect/);
});

test('merges colliding normalized people rows with first non-empty values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const path = join(directory, 'people.csv');
    await writeFile(
      path,
      'fullName,email,enrollmentNumber,identityDocument\r\nJoão da Silva,,123,CPF-1\r\nJOAO DA SILVA,joao@example.com,,CPF-2\r\n',
    );
    const result = await readPeopleLookup(path);
    assert.equal(result.collisions, 1);
    assert.deepEqual(result.lookup.get('joao da silva'), {
      fullName: 'João da Silva',
      email: 'joao@example.com',
      enrollmentNumber: '123',
      identityDocument: 'CPF-1',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('enriches matched rows and writes an atomic, quoted CSV', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const peoplePath = join(directory, 'people.csv');
    const inputPath = join(directory, 'input.csv');
    const outputPath = join(directory, 'out', 'input_crossed.csv');
    await writeFile(peoplePath, 'fullName,email,enrollmentNumber,identityDocument\nAna,ana@example.com,RA-1,CPF-1\n');
    await writeFile(inputPath, 'Nome completo,Observação\n  ANA  ,"a, note"\nOutra,\n');
    const { lookup } = await readPeopleLookup(peoplePath);
    const stats = await enrichCsvFile({
      inputCsvPath: inputPath,
      outputCsvPath: outputPath,
      peopleLookup: lookup,
    });
    assert.deepEqual(stats, { rowsTotal: 2, rowsMatched: 1, rowsUnmatched: 1 });
    const output = parseCsvText(await readFile(outputPath, 'utf8'));
    const firstRow = output.rows[0];
    const secondRow = output.rows[1];
    assert.ok(firstRow);
    assert.ok(secondRow);
    assert.deepEqual(output.headers, [
      'Nome completo',
      'Observação',
      'crossMatchedFullName',
      'crossEmail',
      'crossEnrollmentNumber',
      'crossIdentityDocument',
      'crossMatchFound',
    ]);
    assert.equal(firstRow.crossEmail, 'ana@example.com');
    assert.equal(firstRow.Observação, 'a, note');
    assert.equal(secondRow.crossMatchFound, 'false');
    assert.match(await readFile(outputPath, 'utf8'), /\r\n/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('excludes the recursive output directory and keeps relative output names', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const nested = join(directory, 'nested');
    const output = join(directory, 'crossed');
    await writeFile(join(directory, 'one.csv'), 'name\nAna\n');
    await (await import('node:fs/promises')).mkdir(nested, { recursive: true });
    await (await import('node:fs/promises')).mkdir(output, { recursive: true });
    await writeFile(join(nested, 'two.csv'), 'name\nAna\n');
    await writeFile(join(output, 'one_crossed.csv'), 'name\nAna\n');
    const files = iterInputCsvPaths(directory, '*.csv', true, output);
    assert.deepEqual(files, [resolve(directory, 'nested/two.csv'), resolve(directory, 'one.csv')].sort());
    assert.equal(
      buildOutputPath(
        resolve(directory, 'nested/two.csv'),
        resolve(directory),
        resolve(directory, 'crossed'),
        '_crossed',
      ),
      resolve(directory, 'crossed/nested/two_crossed.csv'),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
