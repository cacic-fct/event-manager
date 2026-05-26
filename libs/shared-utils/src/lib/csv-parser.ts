export type CsvParseResult = {
  headers: string[];
  rows: Record<string, string>[];
};

export function parseCsv(csvContent: string): CsvParseResult {
  const records: string[][] = [];
  const delimiter = detectCsvDelimiter(csvContent);
  let currentField = '';
  let currentRecord: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csvContent.length; index += 1) {
    const char = csvContent[index];
    const nextChar = csvContent[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      currentRecord.push(currentField);
      currentField = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRecord.push(currentField);
      if (currentRecord.some((field) => field.trim().length > 0)) {
        records.push(currentRecord);
      }
      currentRecord = [];
      currentField = '';
      continue;
    }

    currentField += char;
  }

  currentRecord.push(currentField);
  if (currentRecord.some((field) => field.trim().length > 0)) {
    records.push(currentRecord);
  }

  const [headerRecord, ...dataRecords] = records;
  const headers = (headerRecord ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
  if (headers.length === 0) {
    throw new Error('O CSV precisa incluir uma linha de cabeçalho.');
  }

  return {
    headers,
    rows: dataRecords.map((record) =>
      headers.reduce<Record<string, string>>((row, header, index) => {
        row[header] = record[index]?.trim() ?? '';
        return row;
      }, {}),
    ),
  };
}

export function detectCsvDelimiter(csvContent: string): string {
  const firstLine = csvContent.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'];
  return candidates.reduce((bestDelimiter, delimiter) => {
    const bestCount = firstLine.split(bestDelimiter).length;
    const candidateCount = firstLine.split(delimiter).length;
    return candidateCount > bestCount ? delimiter : bestDelimiter;
  }, ',');
}
