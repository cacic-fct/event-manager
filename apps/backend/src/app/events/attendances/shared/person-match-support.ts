import { AttendanceImportMatchType } from '@cacic-fct/shared-data-types';
import { isValidCPF } from '@cacic-fct/shared-utils';
import { Prisma } from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../../../common/brazilian-phone';
import { EventAttendancesCsvSupport } from './csv-support';
import { ImportValueMatchResult, PersonMatch } from './types';

export abstract class EventAttendancesPersonMatchSupport extends EventAttendancesCsvSupport {
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

  protected looksLikeIdentityDocument(value: string): boolean {
    const compactValue = value.trim().replace(/[^A-Za-z0-9]/g, '');
    if (isValidCPF(compactValue)) {
      return true;
    }

    return /^[A-Za-z0-9]{5,20}$/.test(compactValue);
  }

  protected async findPeopleByImportValues(
    values: string[],
    matchType: AttendanceImportMatchType,
  ): Promise<ImportValueMatchResult> {
    const personByValue = new Map<string, PersonMatch>();
    const ambiguousPeopleByValue = new Map<string, PersonMatch[]>();
    const normalizedValues = Array.from(
      new Set(values.map((value) => this.normalizeImportValue(value, matchType)).filter((value) => value.length > 0)),
    );

    for (const chunk of this.chunk(normalizedValues, 500)) {
      const requestedKeys = new Set(chunk);
      const candidatesByKey = new Map<string, Map<string, PersonMatch>>();
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
        orderBy: [
          {
            name: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],
      });

      for (const person of people) {
        for (const key of this.getPersonMatchKeys(person, matchType)) {
          if (!requestedKeys.has(key)) {
            continue;
          }
          const candidates = candidatesByKey.get(key) ?? new Map<string, PersonMatch>();
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

  protected buildPeopleMatchFilters(values: string[], matchType: AttendanceImportMatchType): Prisma.PeopleWhereInput[] {
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
            filters.push({
              phone: {
                in: phoneCandidates,
              },
            });
          }
          return filters;
        });
      case AttendanceImportMatchType.FULL_NAME:
        return values.map((value) => ({
          name: { equals: value, mode: 'insensitive' },
        }));
    }
  }

  protected getPersonMatchKeys(person: PersonMatch, matchType: AttendanceImportMatchType): string[] {
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
        `${normalizedValue.slice(0, 3)}.${normalizedValue.slice(
          3,
          6,
        )}.${normalizedValue.slice(6, 9)}-${normalizedValue.slice(9)}`,
      );
    }

    return Array.from(lookupValues).filter((lookupValue) => lookupValue);
  }

  private getPersonIdentityOrPhoneMatchKeys(person: PersonMatch): string[] {
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

  protected chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
