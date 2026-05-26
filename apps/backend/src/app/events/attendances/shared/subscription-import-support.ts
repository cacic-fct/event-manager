import { MajorEventSubscriptionCsvImportInput } from '@cacic-fct/shared-data-types';
import { BadRequestException } from '@nestjs/common';
import { Prisma, SubscriptionStatus } from '@prisma/client';
import { EventAttendancesPersonMatchSupport } from './person-match-support';
import { CsvRow, PersonMatch, SubscriptionImportPersonData } from './types';

export abstract class EventAttendancesSubscriptionImportSupport extends EventAttendancesPersonMatchSupport {
  protected parseSubscriptionStatus(status: string): SubscriptionStatus {
    if (Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)) {
      return status as SubscriptionStatus;
    }

    throw new BadRequestException(`Invalid subscription status "${status}".`);
  }

  protected ensureSubscriptionImportHeaders(headers: string[], input: MajorEventSubscriptionCsvImportInput): void {
    const mapping = input.columnMapping;
    const selectedHeaders = [
      mapping.emailHeader,
      mapping.fullNameHeader,
      mapping.enrollmentNumberHeader,
      mapping.identityDocumentHeader,
      mapping.subscribedEventIdsHeader,
    ].filter((header): header is string => Boolean(header));

    for (const header of selectedHeaders) {
      if (!headers.includes(header)) {
        throw new BadRequestException(`CSV header "${header}" was not found.`);
      }
    }

    if (!mapping.subscribedEventIdsHeader) {
      throw new BadRequestException('A subscribed events column must be selected.');
    }

    if (
      ![
        mapping.emailHeader,
        mapping.fullNameHeader,
        mapping.enrollmentNumberHeader,
        mapping.identityDocumentHeader,
      ].some((header) => Boolean(header))
    ) {
      throw new BadRequestException('At least one person information column must be selected.');
    }
  }

  protected readSubscriptionImportPersonData(
    row: CsvRow,
    input: MajorEventSubscriptionCsvImportInput,
  ): SubscriptionImportPersonData {
    const mapping = input.columnMapping;
    return {
      email: this.readMappedCell(row, mapping.emailHeader).toLowerCase(),
      fullName: this.readMappedCell(row, mapping.fullNameHeader).replace(/\s+/g, ' '),
      enrollmentNumber: this.readMappedCell(row, mapping.enrollmentNumberHeader),
      identityDocument: this.readMappedCell(row, mapping.identityDocumentHeader),
    };
  }

  protected readMappedCell(row: CsvRow, header?: string | null): string {
    return header ? (row[header]?.trim() ?? '') : '';
  }

  protected hasAnySubscriptionImportPersonData(personData: SubscriptionImportPersonData): boolean {
    return [personData.email, personData.fullName, personData.enrollmentNumber, personData.identityDocument].some(
      (value) => Boolean(value),
    );
  }

  protected readSubscribedEventIds(value: string): string[] {
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
      try {
        const parsedValue: unknown = JSON.parse(trimmedValue);
        if (Array.isArray(parsedValue)) {
          return this.uniqueEventIds(parsedValue.filter((eventId): eventId is string => typeof eventId === 'string'));
        }
      } catch {
        return this.uniqueEventIds(trimmedValue.slice(1, -1).split(','));
      }
    }

    return this.uniqueEventIds(value.split(/[\s,;]+/));
  }

  protected uniqueEventIds(eventIds: string[]): string[] {
    return Array.from(new Set(eventIds.map((eventId) => eventId.trim()).filter((eventId) => eventId)));
  }

  protected async findPersonForSubscriptionImport(
    personData: SubscriptionImportPersonData,
    prisma: Prisma.TransactionClient | typeof this.prisma = this.prisma,
  ): Promise<PersonMatch | null> {
    const matchFilters = this.buildSubscriptionImportPersonMatchFilters(personData);

    for (const where of matchFilters) {
      const person = await prisma.people.findFirst({
        where: {
          deletedAt: null,
          mergedIntoId: null,
          ...where,
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
        orderBy: {
          createdAt: 'asc',
        },
      });

      if (person) {
        return person;
      }
    }

    return null;
  }

  protected buildSubscriptionImportPersonMatchFilters(
    personData: SubscriptionImportPersonData,
  ): Prisma.PeopleWhereInput[] {
    const filters: Prisma.PeopleWhereInput[] = [];

    if (personData.identityDocument) {
      filters.push({
        OR: this.identityDocumentLookupValues(personData.identityDocument).map((identityDocument) => ({
          identityDocument,
        })),
      });
    }

    if (personData.email) {
      filters.push({
        OR: [
          { email: { equals: personData.email, mode: 'insensitive' } },
          { secondaryEmails: { has: personData.email } },
        ],
      });
    }

    if (personData.enrollmentNumber) {
      filters.push({
        academicId: {
          equals: personData.enrollmentNumber,
          mode: 'insensitive',
        },
      });
    }

    if (personData.fullName) {
      filters.push({
        name: {
          equals: personData.fullName,
          mode: 'insensitive',
        },
      });
    }

    return filters;
  }

  protected async createPersonForSubscriptionImport(
    personData: SubscriptionImportPersonData,
    createdById?: string,
    prisma: Prisma.TransactionClient | typeof this.prisma = this.prisma,
  ): Promise<PersonMatch> {
    const name =
      personData.fullName ||
      personData.email ||
      personData.enrollmentNumber ||
      personData.identityDocument ||
      'Pessoa importada';

    return prisma.people.create({
      data: {
        name,
        email: personData.email || undefined,
        academicId: personData.enrollmentNumber || undefined,
        identityDocument: personData.identityDocument || undefined,
        createdById,
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
  }
}
