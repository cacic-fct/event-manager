import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  EventManagerVotingAttendanceCheckResponse,
  EventManagerVotingEvent,
  EventManagerVotingPersonIdentifierLookupItem,
  EventManagerVotingPersonIdentifierLookupResponse,
  EventManagerVotingPeopleLookupResponse,
  EventManagerVotingPerson,
} from '@cacic-fct/event-manager-m2m-contracts';
import { startOfDay } from 'date-fns';
import { AccountMergeService } from '../account-merge/account-merge.service';
import { PrismaService } from '../prisma/prisma.service';

const VOTING_EVENT_SELECT = {
  id: true,
  name: true,
  startDate: true,
  endDate: true,
  locationDescription: true,
  shouldCollectAttendance: true,
} satisfies Prisma.EventSelect;

type VotingEventRecord = Prisma.EventGetPayload<{
  select: typeof VOTING_EVENT_SELECT;
}>;

const VOTING_PERSON_SELECT = {
  academicId: true,
  name: true,
  email: true,
  phone: true,
  identityDocument: true,
} satisfies Prisma.PeopleSelect;

type VotingPersonRecord = Prisma.PeopleGetPayload<{
  select: typeof VOTING_PERSON_SELECT;
}>;

@Injectable()
export class VotingIntegrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountMergeService: AccountMergeService,
  ) {}

  async listLinkableEvents(referenceDate = new Date()): Promise<EventManagerVotingEvent[]> {
    const todayStart = startOfDay(referenceDate);
    const events = await this.prisma.event.findMany({
      where: {
        deletedAt: null,
        endDate: {
          gte: todayStart,
        },
      },
      select: VOTING_EVENT_SELECT,
      orderBy: [
        {
          startDate: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });

    return events.map((event) => this.toDto(event));
  }

  async checkAttendance(eventId: string, userId: string): Promise<EventManagerVotingAttendanceCheckResponse> {
    const normalizedEventId = eventId.trim();
    const normalizedUserId = userId.trim();
    if (!normalizedEventId) {
      throw new BadRequestException('eventId must be a non-empty string.');
    }
    if (!normalizedUserId) {
      throw new BadRequestException('userId must be a non-empty string.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: normalizedEventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!event) {
      throw new NotFoundException(`Event ${normalizedEventId} was not found.`);
    }

    const userIds = await this.resolveUserIds(normalizedUserId);
    const externalRefs = userIds.map((id) => this.toKeycloakExternalRef(id));
    const attendance = await this.prisma.eventAttendance.findFirst({
      where: {
        eventId: normalizedEventId,
        person: {
          deletedAt: null,
          OR: [
            {
              userId: {
                in: userIds,
              },
            },
            {
              externalRef: {
                in: externalRefs,
              },
            },
          ],
        },
      },
      select: {
        attendedAt: true,
      },
    });

    return {
      eventId: normalizedEventId,
      userId: normalizedUserId,
      attended: attendance != null,
      attendedAt: attendance?.attendedAt.toISOString() ?? null,
    };
  }

  async lookupPeopleByEnrollmentNumbers(
    enrollmentNumbers: readonly string[],
  ): Promise<EventManagerVotingPeopleLookupResponse> {
    const normalizedEnrollmentNumbers = this.normalizeEnrollmentNumbers(enrollmentNumbers);
    if (normalizedEnrollmentNumbers.length === 0) {
      return { people: [] };
    }

    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        academicId: {
          in: normalizedEnrollmentNumbers,
        },
      },
      select: VOTING_PERSON_SELECT,
      orderBy: [
        {
          name: 'asc',
        },
      ],
    });

    return {
      people: people.flatMap((person) => this.toPersonDto(person)),
    };
  }

  async lookupPeopleByIdentifiers(
    identifiers: readonly EventManagerVotingPersonIdentifierLookupItem[],
  ): Promise<EventManagerVotingPersonIdentifierLookupResponse> {
    const normalized = this.normalizeIdentifierLookupItems(identifiers);
    if (normalized.length === 0) {
      return { people: [] };
    }

    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        OR: this.identifierLookupWhere(normalized),
      },
      select: VOTING_PERSON_SELECT,
      orderBy: [
        {
          name: 'asc',
        },
      ],
    });

    return {
      people: normalized.flatMap((item) =>
        people
          .filter((person) => this.personMatchesIdentifier(person, item))
          .flatMap((person) =>
            this.toPersonDto(person).map((match) => ({
              ...match,
              requestId: item.requestId,
            })),
          ),
      ),
    };
  }

  private async resolveUserIds(userId: string): Promise<string[]> {
    const finalUserId = await this.accountMergeService.resolveFinalUserId(userId);
    return [...new Set([userId, finalUserId].filter((value): value is string => Boolean(value)))];
  }

  private toDto(event: VotingEventRecord): EventManagerVotingEvent {
    return {
      id: event.id,
      name: event.name,
      startDate: event.startDate.toISOString(),
      endDate: event.endDate.toISOString(),
      locationDescription: event.locationDescription,
      shouldCollectAttendance: event.shouldCollectAttendance,
    };
  }

  private toPersonDto(person: VotingPersonRecord): EventManagerVotingPerson[] {
    const enrollmentNumber = this.normalizeEnrollmentNumber(person.academicId);
    if (!enrollmentNumber) {
      return [];
    }

    return [
      {
        enrollmentNumber,
        name: person.name,
        email: person.email,
      },
    ];
  }

  private normalizeEnrollmentNumbers(enrollmentNumbers: readonly string[]): string[] {
    const normalized = new Set<string>();
    for (const enrollmentNumber of enrollmentNumbers) {
      const value = this.normalizeEnrollmentNumber(enrollmentNumber);
      if (value) {
        normalized.add(value);
      }
    }

    return [...normalized];
  }

  private normalizeIdentifierLookupItems(
    identifiers: readonly EventManagerVotingPersonIdentifierLookupItem[],
  ): EventManagerVotingPersonIdentifierLookupItem[] {
    const normalized: EventManagerVotingPersonIdentifierLookupItem[] = [];
    const seen = new Set<string>();

    for (const identifier of identifiers) {
      const requestId = identifier.requestId.trim();
      const identifierValue = this.normalizeIdentifierValue(
        identifier.identifierType,
        identifier.identifierValue,
      );
      if (!requestId || !identifierValue) {
        continue;
      }

      const key = `${requestId}:${identifier.identifierType}:${identifierValue}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      normalized.push({
        requestId,
        identifierType: identifier.identifierType,
        identifierValue,
      });
    }

    return normalized;
  }

  private identifierLookupWhere(
    identifiers: readonly EventManagerVotingPersonIdentifierLookupItem[],
  ): Prisma.PeopleWhereInput[] {
    return identifiers.map((identifier) => {
      switch (identifier.identifierType) {
        case 'cpf':
          return {
            identityDocument: {
              in: this.identifierValueVariants(identifier.identifierValue),
            },
          };
        case 'phone':
          return {
            phone: {
              in: this.identifierValueVariants(identifier.identifierValue),
            },
          };
        case 'email':
          return {
            email: {
              equals: identifier.identifierValue,
              mode: 'insensitive',
            },
          };
      }
    });
  }

  private personMatchesIdentifier(
    person: VotingPersonRecord,
    identifier: EventManagerVotingPersonIdentifierLookupItem,
  ): boolean {
    switch (identifier.identifierType) {
      case 'cpf':
        return this.onlyDigits(person.identityDocument) === this.onlyDigits(identifier.identifierValue);
      case 'phone':
        return this.onlyDigits(person.phone) === this.onlyDigits(identifier.identifierValue);
      case 'email':
        return this.normalizeEmail(person.email) === this.normalizeEmail(identifier.identifierValue);
    }
  }

  private normalizeIdentifierValue(
    type: EventManagerVotingPersonIdentifierLookupItem['identifierType'],
    value: string,
  ): string | null {
    switch (type) {
      case 'cpf': {
        const digits = this.onlyDigits(value);
        return digits.length === 11 ? digits : null;
      }
      case 'phone': {
        const digits = this.onlyDigits(value);
        return digits.length >= 10 && digits.length <= 13 ? digits : null;
      }
      case 'email':
        return this.normalizeEmail(value);
    }
  }

  private identifierValueVariants(value: string): string[] {
    return [...new Set([value, this.onlyDigits(value)].filter(Boolean))];
  }

  private normalizeEnrollmentNumber(value?: string | null): string | null {
    const normalized = value?.replace(/^\uFEFF/, '').trim();
    return normalized || null;
  }

  private normalizeEmail(value?: string | null): string | null {
    const normalized = value?.trim().toLowerCase();
    return normalized || null;
  }

  private onlyDigits(value?: string | null): string {
    return value?.replace(/\D/g, '') ?? '';
  }

  private toKeycloakExternalRef(userId: string): string {
    return `kc:${userId}`;
  }
}
