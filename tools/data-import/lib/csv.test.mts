import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parseCsvText, readCsvFile } from './csv.mts';

test('parses BOM headers, CRLF records, escaped quotes, and multiline fields', () => {
  const result = parseCsvText(
    '\uFEFFnome,observacao,email\r\n"Ana","Disse ""oi""",ana@example.com\r\nBruno,"linha 1\nlinha 2",\r\n',
  );
  assert.deepEqual(result.headers, ['nome', 'observacao', 'email']);
  assert.deepEqual(result.rows, [
    { nome: 'Ana', observacao: 'Disse "oi"', email: 'ana@example.com' },
    { nome: 'Bruno', observacao: 'linha 1\nlinha 2', email: '' },
  ]);
});

test('skips empty physical lines but retains empty CSV rows', () => {
  const result = parseCsvText('a,b\n\n,\n');
  assert.deepEqual(result.rows, [{ a: '', b: '' }]);
});

test('reads CSV source files as UTF-8 documents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-csv-'));
  try {
    const path = join(directory, 'source.csv');
    await writeFile(path, '\uFEFFnome,email\r\nAna,ana@example.com\r\n');
    assert.deepEqual(await readCsvFile(path), {
      headers: ['nome', 'email'],
      rows: [{ nome: 'Ana', email: 'ana@example.com' }],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects unclosed fields and oversized fields', () => {
  assert.throws(() => parseCsvText('name\n"Ana'), /unclosed quoted field/);
  assert.throws(() => parseCsvText('name\n12345', { maxFieldSize: 4 }), /exceeds/);
});

test('rejects duplicate headers and rows wider than their header', () => {
  assert.throws(() => parseCsvText('name,name\nA,B\n'), /duplicate headers: name/);
  assert.throws(() => parseCsvText('name,email\nA,a@example.test,extra\n'), /row 2 has 3 fields/);
});
