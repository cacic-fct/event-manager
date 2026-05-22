import { AttendanceImportMatchType } from '@cacic-fct/shared-data-types';
import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { EventAttendancesCsvSupport } from './csv-support';
import { PersonMatch } from './types';

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
    const compactValue = value.trim().replace(/[.\-/\s]/g, '');
    if (this.isValidCpf(compactValue)) {
      return true;
    }

    return /^[A-Za-z0-9]{5,20}$/.test(compactValue);
  }

  protected async findPeopleByImportValues(
    values: string[],
    matchType: AttendanceImportMatchType,
  ): Promise<Map<string, PersonMatch>> {
    const result = new Map<string, PersonMatch>();
    const normalizedValues = Array.from(
      new Set(values.map((value) => this.normalizeImportValue(value, matchType)).filter((value) => value.length > 0)),
    );

    for (const chunk of this.chunk(normalizedValues, 500)) {
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
          identityDocument: true,
          academicId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      for (const person of people) {
        for (const key of this.getPersonMatchKeys(person, matchType)) {
          const existingPerson = result.get(key);
          if (!existingPerson) {
            result.set(key, person);
            continue;
          }

          if (existingPerson.id !== person.id) {
            throw new ConflictException(
              `Valor de importação ambíguo para ${key}. Existem múltiplas pessoas ativas com o mesmo dado.`,
            );
          }
        }
      }
    }

    return result;
  }

  protected buildPeopleMatchFilters(values: string[], matchType: AttendanceImportMatchType): Prisma.PeopleWhereInput[] {
    switch (matchType) {
      case AttendanceImportMatchType.EMAIL:
        return values.map((value) => ({
          OR: [{ email: { equals: value, mode: 'insensitive' } }, { secondaryEmails: { has: value } }],
        }));
      case AttendanceImportMatchType.IDENTITY_DOCUMENT:
        return values.flatMap((value) =>
          this.identityDocumentLookupValues(value).map((identityDocument) => ({
            identityDocument,
          })),
        );
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
        return person.identityDocument ? [this.normalizeImportValue(person.identityDocument, matchType)] : [];
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
        return trimmedValue.replace(/[.\-/\s]/g, '').toUpperCase();
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

  protected isValidCpf(value: string): boolean {
    const cpf = value.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
      return false;
    }

    const firstDigit = this.calculateCpfDigit(cpf.slice(0, 9), 10);
    const secondDigit = this.calculateCpfDigit(`${cpf.slice(0, 9)}${firstDigit}`, 11);

    return cpf === `${cpf.slice(0, 9)}${firstDigit}${secondDigit}`;
  }

  protected calculateCpfDigit(base: string, factor: number): number {
    const total = base.split('').reduce((sum, digit, index) => sum + Number(digit) * (factor - index), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  }

  protected chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
