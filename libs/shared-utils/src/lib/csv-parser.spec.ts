import { detectCsvDelimiter, parseCsv } from './csv-parser';

describe('CSV parser', () => {
  it('detects semicolon, comma, and tab delimiters from the header line', () => {
    expect(detectCsvDelimiter('nome;email\nAna;ana@example.com')).toBe(';');
    expect(detectCsvDelimiter('nome,email\nAna,ana@example.com')).toBe(',');
    expect(detectCsvDelimiter('nome\temail\nAna\tana@example.com')).toBe('\t');
  });

  it('parses quoted fields, escaped quotes, BOM headers, and CRLF records', () => {
    const result = parseCsv('\uFEFFnome;observação;email\r\n"Ana";"Disse ""oi""";ana@example.com\r\n"Bruno";;');

    expect(result.headers).toEqual(['nome', 'observação', 'email']);
    expect(result.rows).toEqual([
      {
        nome: 'Ana',
        observação: 'Disse "oi"',
        email: 'ana@example.com',
      },
      {
        nome: 'Bruno',
        observação: '',
        email: '',
      },
    ]);
  });

  it('keeps line breaks inside quoted fields', () => {
    const result = parseCsv('nome,observação\nAna,"linha 1\nlinha 2"');

    expect(result.rows[0]).toEqual({
      nome: 'Ana',
      observação: 'linha 1\nlinha 2',
    });
  });

  it('rejects empty content without a header row', () => {
    expect(() => parseCsv('')).toThrow('O CSV precisa incluir uma linha de cabeçalho.');
  });
});
