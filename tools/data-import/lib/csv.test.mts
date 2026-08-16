import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsvText, serializeCsv } from './csv.mts';

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

test('serializes cells with commas, quotes, and line breaks using CRLF', () => {
  const output = serializeCsv(['name', 'note'], [{ name: 'Ana', note: 'a,"b"\nnext' }]);
  assert.equal(output, 'name,note\r\nAna,"a,""b""\nnext"\r\n');
});

test('rejects unclosed fields and oversized fields', () => {
  assert.throws(() => parseCsvText('name\n"Ana'), /unclosed quoted field/);
  assert.throws(() => parseCsvText('name\n12345', { maxFieldSize: 4 }), /exceeds/);
});

test('rejects duplicate headers and rows wider than their header', () => {
  assert.throws(() => parseCsvText('name,name\nA,B\n'), /duplicate headers: name/);
  assert.throws(() => parseCsvText('name,email\nA,a@example.test,extra\n'), /row 2 has 3 fields/);
});
