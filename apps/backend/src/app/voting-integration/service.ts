import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  EventManagerVotingAttendanceCheckResponse,
  EventManagerVotingEvent,
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

  private normalizeEnrollmentNumber(value?: string | null): string | null {
    const normalized = value?.replace(/^\uFEFF/, '').trim();
    return normalized || null;
  }

  private toKeycloakExternalRef(userId: string): string {
    return `kc:${userId}`;
  }
}
