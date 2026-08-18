import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const DEFAULT_CSV_FIELD_SIZE_LIMIT = 10_000_000;

export interface CsvRow {
  [fieldname: string]: string;
}

export interface CsvDocument {
  headers: string[];
  rows: CsvRow[];
}

export interface ParseCsvOptions {
  delimiter?: string;
  maxFieldSize?: number;
}

export class CsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvError';
  }
}

/**
 * Parse a CSV string without changing cell whitespace. The legacy Python
 * importers use comma-delimited UTF-8 CSV and skip genuinely blank records;
 * callers normalize only the fields that belong to their domain.
 */
export function parseCsvText(
  input: string,
  { delimiter = ',', maxFieldSize = DEFAULT_CSV_FIELD_SIZE_LIMIT }: ParseCsvOptions = {},
): CsvDocument {
  if (typeof input !== 'string') {
    throw new TypeError('CSV input must be a string.');
  }
  if (typeof delimiter !== 'string' || delimiter.length !== 1) {
    throw new TypeError('CSV delimiter must be one character.');
  }

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;

  const append = (value: string): void => {
    field += value;
    if (field.length > maxFieldSize) {
      throw new CsvError(`CSV field exceeds the ${maxFieldSize}-character limit.`);
    }
  };

  const finishField = (): void => {
    record.push(field);
    field = '';
    fieldStarted = false;
  };

  const finishRecord = (): void => {
    finishField();
    // Python's csv.DictReader ignores an entirely empty physical line but
    // retains rows such as `,` and rows containing whitespace.
    if (!(record.length === 1 && record[0] === '')) {
      records.push(record);
    }
    record = [];
  };

  for (let index = 0; index < input.length; index += 1) {
    const char = input.charAt(index);
    const next = input.charAt(index + 1);

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          append('"');
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        append(char);
      }
      continue;
    }

    // A quote is special only at the beginning of a field, matching the
    // default Python csv reader's treatment of unquoted quote characters.
    if (char === '"' && !fieldStarted && field.length === 0) {
      inQuotes = true;
      fieldStarted = true;
      continue;
    }
    if (char === delimiter) {
      finishField();
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      finishRecord();
      continue;
    }

    fieldStarted = true;
    append(char);
  }

  if (inQuotes) {
    throw new CsvError('CSV has an unclosed quoted field.');
  }
  if (field.length > 0 || fieldStarted || record.length > 0) {
    finishRecord();
  }

  const [headerRecord, ...dataRecords] = records;
  if (!headerRecord || headerRecord.length === 0) {
    throw new CsvError('CSV has no header row.');
  }
  const headers = headerRecord.map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header));
  if (headers.length === 0 || headers.every((header) => header.length === 0)) {
    throw new CsvError('CSV has no header row.');
  }

  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    throw new CsvError(`CSV has duplicate headers: ${[...new Set(duplicateHeaders)].join(', ')}`);
  }

  const rows: CsvRow[] = dataRecords.map((values, index) => {
    if (values.length > headers.length) {
      throw new CsvError(
        `CSV row ${index + 2} has ${values.length} fields but the header has ${headers.length}.`,
      );
    }
    const row: CsvRow = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

export async function readCsvFile(filePath: string, options: ParseCsvOptions = {}): Promise<CsvDocument> {
  const contents = await readFile(filePath, 'utf8');
  return parseCsvText(contents, options);
}

export function escapeCsvCell(value: unknown): string {
  const cell = value == null ? '' : String(value);
  if (!/[",\r\n]/u.test(cell)) return cell;
  return `"${cell.replaceAll('"', '""')}"`;
}

export function serializeCsv(fieldnames: readonly string[], rows: readonly CsvRow[]): string {
  const lines = [fieldnames.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(fieldnames.map((fieldname) => escapeCsvCell(row?.[fieldname])).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export async function writeCsvAtomic(
  filePath: string,
  fieldnames: readonly string[],
  rows: readonly CsvRow[],
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporaryPath, serializeCsv(fieldnames, rows), { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}
