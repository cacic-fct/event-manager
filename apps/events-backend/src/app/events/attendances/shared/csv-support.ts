import { BadRequestException } from '@nestjs/common';
import { EventAttendancesCoreSupport } from './core-support';
import { CsvRow } from './types';

export abstract class EventAttendancesCsvSupport extends EventAttendancesCoreSupport {
  protected parseCsv(csvContent: string): { headers: string[]; rows: CsvRow[] } {
    const records: string[][] = [];
    const delimiter = this.detectCsvDelimiter(csvContent);
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

    if (inQuotes) {
      throw new BadRequestException('CSV file has an unclosed quoted field.');
    }

    currentRecord.push(currentField);
    if (currentRecord.some((field) => field.trim().length > 0)) {
      records.push(currentRecord);
    }

    const [headerRecord, ...dataRecords] = records;
    const headers = (headerRecord ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
    if (headers.length === 0) {
      throw new BadRequestException('CSV file must include a header row.');
    }

    const duplicateHeaders = new Set<string>();
    const seenHeaders = new Set<string>();
    for (const header of headers) {
      if (seenHeaders.has(header)) {
        duplicateHeaders.add(header);
      }
      seenHeaders.add(header);
    }
    if (duplicateHeaders.size > 0) {
      throw new BadRequestException(`CSV file has duplicate headers: ${[...duplicateHeaders].join(', ')}.`);
    }

    return {
      headers,
      rows: dataRecords.map((record, index) => {
        if (record.length !== headers.length) {
          throw new BadRequestException(`CSV row ${index + 2} has ${record.length} columns; expected ${headers.length}.`);
        }

        return headers.reduce<CsvRow>((row, header, headerIndex) => {
          row[header] = record[headerIndex]?.trim() ?? '';
          return row;
        }, {});
      }),
    };
  }

  protected detectCsvDelimiter(csvContent: string): string {
    const firstLine = csvContent.split(/\r?\n/, 1)[0] ?? '';
    const candidates = [',', ';', '\t'];
    return candidates.reduce((bestDelimiter, delimiter) => {
      const bestCount = firstLine.split(bestDelimiter).length;
      const candidateCount = firstLine.split(delimiter).length;
      return candidateCount > bestCount ? delimiter : bestDelimiter;
    }, ',');
  }
}
