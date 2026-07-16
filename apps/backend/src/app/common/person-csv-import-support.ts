import { AttendanceImportMatchType } from '@cacic-fct/shared-data-types';
import { isValidCPF } from '@cacic-fct/shared-utils';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getBrazilianPhoneCandidates } from './brazilian-phone';

export type CsvRow = Record<string, string>;

export type PersonCsvImportMatch = {
  id: string;
  name: string;
  email: string | null;
  secondaryEmails: string[];
  phone?: string | null;
  identityDocument: string | null;
  academicId: string | null;
  userId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PersonCsvImportMatchResult = {
  personByValue: Map<string, PersonCsvImportMatch>;
  ambiguousPeopleByValue: Map<string, PersonCsvImportMatch[]>;
};

/**
 * Shared parsing and person-resolution support for imports that identify people
 * from one CSV column. Domain resolvers remain responsible for their writes.
 */
export abstract class PersonCsvImportSupport {
  constructor(protected readonly prisma: PrismaService) {}

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

  protected inferMatchType(values: string[]): AttendanceImportMatchType {
    const nonEmptyValues = values.filter((value) => value.trim().length > 0);
    if (nonEmptyValues.length === 0) {
      return AttendanceImportMatchType.FULL_NAME;
    }

    const emailCount = nonEmptyValues.filter((value) => value.includes('@')).length;
    if (emailCount > 0) {
      return AttendanceImportMatchType.EMAIL;
    }

    const identityDocumentCount = nonEmptyValues.filter((value) => this.looksLikeIdentityDocument(value)).length;
    if (identityDocumentCount / nonEmptyValues.length >= 0.5) {
      return AttendanceImportMatchType.IDENTITY_DOCUMENT;
    }

    return AttendanceImportMatchType.FULL_NAME;
  }

  protected async findPeopleByImportValues(
    values: string[],
    matchType: AttendanceImportMatchType,
  ): Promise<PersonCsvImportMatchResult> {
    const personByValue = new Map<string, PersonCsvImportMatch>();
    const ambiguousPeopleByValue = new Map<string, PersonCsvImportMatch[]>();
    const normalizedValues = Array.from(
      new Set(values.map((value) => this.normalizeImportValue(value, matchType)).filter((value) => value.length > 0)),
    );

    for (const chunk of this.chunk(normalizedValues, 500)) {
      const requestedKeys = new Set(chunk);
      const candidatesByKey = new Map<string, Map<string, PersonCsvImportMatch>>();
      const people = await this.prisma.people.findMany({
        where: {
          deletedAt: null,
          mergedIntoId: null,
          OR: this.buildPeopleMatchFilters(chunk, matchType),
        },
        select: {
          id: true,
          name: true,
          email: true,
          secondaryEmails: true,
          phone: true,
          identityDocument: true,
          academicId: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      });

      for (const person of people) {
        for (const key of this.getPersonMatchKeys(person, matchType)) {
          if (!requestedKeys.has(key)) {
            continue;
          }
          const candidates = candidatesByKey.get(key) ?? new Map<string, PersonCsvImportMatch>();
          candidates.set(person.id, person);
          candidatesByKey.set(key, candidates);
        }
      }

      for (const [key, candidates] of candidatesByKey.entries()) {
        const peopleForKey = [...candidates.values()];
        if (peopleForKey.length === 1) {
          personByValue.set(key, peopleForKey[0]);
        } else if (peopleForKey.length > 1) {
          ambiguousPeopleByValue.set(key, peopleForKey);
        }
      }
    }

    return { personByValue, ambiguousPeopleByValue };
  }

  protected normalizeImportValue(value: string, matchType: AttendanceImportMatchType): string {
    const trimmedValue = value.trim();
    switch (matchType) {
      case AttendanceImportMatchType.EMAIL:
        return trimmedValue.toLowerCase();
      case AttendanceImportMatchType.IDENTITY_DOCUMENT:
        return trimmedValue.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      case AttendanceImportMatchType.FULL_NAME:
        return trimmedValue.replace(/\s+/g, ' ').toLowerCase();
    }
  }

  protected identityDocumentLookupValues(value: string): string[] {
    const normalizedValue = this.normalizeImportValue(value, AttendanceImportMatchType.IDENTITY_DOCUMENT);
    const lookupValues = new Set([value.trim(), normalizedValue]);

    if (/^\d{11}$/.test(normalizedValue)) {
      lookupValues.add(
        `${normalizedValue.slice(0, 3)}.${normalizedValue.slice(3, 6)}.${normalizedValue.slice(6, 9)}-${normalizedValue.slice(9)}`,
      );
    }

    return Array.from(lookupValues).filter((lookupValue) => lookupValue);
  }

  protected chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }

  private looksLikeIdentityDocument(value: string): boolean {
    const compactValue = value.trim().replace(/[^A-Za-z0-9]/g, '');
    return isValidCPF(compactValue) || /^[A-Za-z0-9]{5,20}$/.test(compactValue);
  }

  private buildPeopleMatchFilters(values: string[], matchType: AttendanceImportMatchType): Prisma.PeopleWhereInput[] {
    switch (matchType) {
      case AttendanceImportMatchType.EMAIL:
        return values.map((value) => ({
          OR: [{ email: { equals: value, mode: 'insensitive' } }, { secondaryEmails: { has: value } }],
        }));
      case AttendanceImportMatchType.IDENTITY_DOCUMENT:
        return values.flatMap((value) => {
          const filters: Prisma.PeopleWhereInput[] = this.identityDocumentLookupValues(value).map((identityDocument) => ({
            identityDocument,
          }));
          const phoneCandidates = getBrazilianPhoneCandidates(value);
          if (phoneCandidates.length > 0) {
            filters.push({ phone: { in: phoneCandidates } });
          }
          return filters;
        });
      case AttendanceImportMatchType.FULL_NAME:
        return values.map((value) => ({ name: { equals: value, mode: 'insensitive' } }));
    }
  }

  private getPersonMatchKeys(person: PersonCsvImportMatch, matchType: AttendanceImportMatchType): string[] {
    switch (matchType) {
      case AttendanceImportMatchType.EMAIL:
        return [person.email, ...person.secondaryEmails]
          .filter((value): value is string => Boolean(value))
          .map((value) => this.normalizeImportValue(value, matchType));
      case AttendanceImportMatchType.IDENTITY_DOCUMENT:
        return this.getPersonIdentityOrPhoneMatchKeys(person);
      case AttendanceImportMatchType.FULL_NAME:
        return [this.normalizeImportValue(person.name, matchType)];
    }
  }

  private getPersonIdentityOrPhoneMatchKeys(person: PersonCsvImportMatch): string[] {
    const keys = new Set<string>();
    if (person.identityDocument) {
      keys.add(this.normalizeImportValue(person.identityDocument, AttendanceImportMatchType.IDENTITY_DOCUMENT));
    }
    if (person.phone) {
      for (const phoneCandidate of getBrazilianPhoneCandidates(person.phone)) {
        keys.add(this.normalizeImportValue(phoneCandidate, AttendanceImportMatchType.IDENTITY_DOCUMENT));
      }
    }
    return [...keys].filter((key) => key);
  }
}
