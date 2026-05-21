import {
  AttendanceImportMatchType,
  DeletionResult,
  EventAttendance,
  EventAttendanceCreateInput,
  EventAttendanceCsvImportInput,
  EventAttendanceCsvImportResult,
  EventAttendanceManualInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceScannerFeedItem,
  EventAttendanceUpdateInput,
  MajorEventSubscriptionCsvImportInput,
  MajorEventSubscriptionCsvImportResult,
  MajorEventUserAttendance,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, Prisma, SubscriptionStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceCategoryService } from './attendance-category.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

type CsvRow = Record<string, string>;

type PersonMatch = {
  id: string;
  name: string;
  email: string | null;
  secondaryEmails: string[];
  identityDocument: string | null;
  academicId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SubscriptionImportPersonData = {
  email?: string;
  fullName?: string;
  enrollmentNumber?: string;
  identityDocument?: string;
};

const MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  description: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  maxCoursesPerAttendee: true,
  maxLecturesPerAttendee: true,
  buttonText: true,
  buttonLink: true,
  contactInfo: true,
  contactType: true,
  isPaymentRequired: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  additionalPaymentInfo: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.MajorEventSelect;

const EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  emoji: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventGroupSelect;

const EVENT_RELATION_SELECT = {
  id: true,
  name: true,
  creditMinutes: true,
  startDate: true,
  endDate: true,
  type: true,
  emoji: true,
  description: true,
  shortDescription: true,
  latitude: true,
  longitude: true,
  locationDescription: true,
  majorEventId: true,
  majorEvent: {
    select: MAJOR_EVENT_SELECT,
  },
  eventGroupId: true,
  eventGroup: {
    select: EVENT_GROUP_SELECT,
  },
  allowSubscription: true,
  subscriptionStartDate: true,
  subscriptionEndDate: true,
  slots: true,
  autoSubscribe: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  shouldCollectAttendance: true,
  isOnlineAttendanceAllowed: true,
  onlineAttendanceCode: true,
  onlineAttendanceStartDate: true,
  onlineAttendanceEndDate: true,
  publiclyVisible: true,
  youtubeCode: true,
  buttonText: true,
  buttonLink: true,
  deletedAt: true,
  createdAt: true,
  createdById: true,
  updatedAt: true,
  updatedById: true,
} satisfies Prisma.EventSelect;

@Resolver(() => EventAttendance)
export class EventAttendancesResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceCategories: AttendanceCategoryService,
  ) {}

  @Query(() => [EventAttendance], { name: 'eventAttendances' })
  @RequireScopes('event-attendance#read')
  async eventAttendances(
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('eventId', { type: () => String, nullable: true }) eventId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const where: Prisma.EventAttendanceWhereInput = {};

    if (personId) {
      where.personId = personId;
    }

    if (eventId) {
      where.eventId = eventId;
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where,
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdAt: true,
        createdById: true,
        createdByMethod: true,
        collectedLatitude: true,
        collectedLongitude: true,
        collectedAccuracyMeters: true,
        category: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
      orderBy: {
        attendedAt: 'desc',
      },
      skip,
      take,
    });

    const collectorIds = [
      ...new Set(attendances.map((attendance) => attendance.createdById).filter((id): id is string => Boolean(id))),
    ];
    const collectors = collectorIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: collectorIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];
    const collectorNameById = new Map(collectors.map((collector) => [collector.id, collector.name]));

    return attendances.map((attendance) => ({
      ...attendance,
      collectedByFullName: attendance.createdById ? (collectorNameById.get(attendance.createdById) ?? undefined) : undefined,
    }));
  }

  @Query(() => [EventAttendanceScannerFeedItem], { name: 'eventAttendanceScannerFeed' })
  @RequireScopes('event-attendance#read')
  eventAttendanceScannerFeed(@Args('eventId', { type: () => String }) eventId: string) {
    return this.getScannerFeed(eventId);
  }

  @Query(() => [MajorEventUserAttendance], {
    name: 'majorEventUserAttendances',
  })
  @RequireScopes('event-attendance#read')
  async majorEventUserAttendances(
    @Args('majorEventId', { type: () => String }) majorEventId: string,
    @Args('personId', { type: () => String, nullable: true }) personId?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }

    const events = await this.prisma.event.findMany({
      where: {
        majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        startDate: true,
      },
      orderBy: {
        startDate: 'asc',
      },
    });

    if (events.length === 0) {
      return [];
    }

    const eventIds = events.map((event) => event.id);
    const subscriptions = await this.prisma.majorEventSubscription.findMany({
      where: {
        majorEventId,
        deletedAt: null,
        ...(personId ? { personId } : {}),
      },
      include: {
        person: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take,
    });

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: {
          in: eventIds,
        },
        ...(personId ? { personId } : {}),
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        category: true,
        person: {
          include: {
            user: true,
          },
        },
      },
    });

    const personIds = Array.from(
      new Set([
        ...subscriptions.map((subscription) => subscription.personId),
        ...attendances.map((attendance) => attendance.personId),
      ]),
    );
    const attendanceByKey = new Map(
      attendances.map((attendance) => [`${attendance.personId}:${attendance.eventId}`, attendance]),
    );

    const majorSubscriptionByPerson = new Map(
      subscriptions.map((subscription) => [subscription.personId, subscription]),
    );

    return personIds.map((resolvedPersonId) => {
      const subscription = majorSubscriptionByPerson.get(resolvedPersonId);
      const person =
        subscription?.person ?? attendances.find((attendance) => attendance.personId === resolvedPersonId)?.person;

      return {
        majorEventId,
        subscriptionId: subscription?.id,
        personId: resolvedPersonId,
        person,
        subscriptionStatus: subscription?.subscriptionStatus ?? 'UNKNOWN',
        amountPaid: subscription?.amountPaid,
        paymentDate: subscription?.paymentDate,
        paymentTier: subscription?.paymentTier,
        attendances: events.map((event) => {
          const attendance = attendanceByKey.get(`${resolvedPersonId}:${event.id}`);
          return {
            eventId: event.id,
            eventName: event.name,
            eventStartDate: event.startDate,
            attended: attendance != null,
            attendedAt: attendance?.attendedAt,
            category: attendance?.category ?? 'UNKNOWN',
          };
        }),
      };
    });
  }

  @Query(() => EventAttendance, { name: 'eventAttendance' })
  @RequireScopes('event-attendance#read')
  async eventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
  ) {
    const attendance = await this.prisma.eventAttendance.findUnique({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdAt: true,
        createdById: true,
        createdByMethod: true,
        category: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
    }

    return attendance;
  }

  @Mutation(() => EventAttendance, { name: 'createEventAttendance' })
  @RequireScopes('event-attendance#edit')
  async createEventAttendance(
    @Args('input', { type: () => EventAttendanceCreateInput })
    input: EventAttendanceCreateInput,
    @Context() context: GraphqlContext,
  ) {
    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    return this.prisma.$transaction(async (tx) => {
      await tx.eventAttendance.create({
        data: {
          ...input,
          createdById,
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        },
      });
      await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
      return tx.eventAttendance.findUniqueOrThrow({
        where: {
          personId_eventId: {
            personId: input.personId,
            eventId: input.eventId,
          },
        },
        select: {
          personId: true,
          eventId: true,
          attendedAt: true,
          createdAt: true,
          createdById: true,
          createdByMethod: true,
          category: true,
        },
      });
    });
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromAztecCode',
  })
  @RequireScopes('event-attendance#edit')
  async createEventAttendanceFromAztecCode(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('code', { type: () => String }) code: string,
    @Context() context: GraphqlContext,
  ) {
    const userId = this.parseUserAztecCode(code);
    if (!userId) {
      throw new BadRequestException('Código Aztec incompatível.');
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    const person = await this.prisma.people.findFirst({
      where: {
        userId,
        deletedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person for user ${userId} was not found.`);
    }

    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId,
            personId: person.id,
            createdById,
            createdByMethod: AttendanceCreationMethod.SCANNER,
          },
        });
        await this.attendanceCategories.refreshForAttendance(person.id, eventId, tx);
        return tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: person.id,
              eventId,
            },
          },
          select: {
            personId: true,
            eventId: true,
            attendedAt: true,
            createdAt: true,
            createdById: true,
            createdByMethod: true,
            category: true,
          },
        });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromScannerCode',
  })
  @RequireScopes('event-attendance#edit')
  async createEventAttendanceFromScannerCode(
    @Args('input', { type: () => EventAttendanceScannerCodeInput })
    input: EventAttendanceScannerCodeInput,
    @Context() context: GraphqlContext,
  ) {
    const userId = this.parseUserAztecCode(input.code);
    if (!userId) {
      throw new BadRequestException('Código Aztec incompatível.');
    }

    const person = await this.prisma.people.findFirst({
      where: {
        userId,
        deletedAt: null,
        mergedIntoId: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person for user ${userId} was not found.`);
    }

    return this.createAttendanceWithMetadata({
      eventId: input.eventId,
      personId: person.id,
      createdByMethod: AttendanceCreationMethod.SCANNER,
      createdById: this.getActorId(context),
      location: input.location,
    });
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromManualInput',
  })
  @RequireScopes('event-attendance#edit')
  async createEventAttendanceFromManualInput(
    @Args('input', { type: () => EventAttendanceManualInput })
    input: EventAttendanceManualInput,
    @Context() context: GraphqlContext,
  ) {
    const person = await this.findSinglePersonForManualInput(input.value);
    return this.createAttendanceWithMetadata({
      eventId: input.eventId,
      personId: person.id,
      createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      createdById: this.getActorId(context),
      location: input.location,
    });
  }

  @Mutation(() => EventAttendanceCsvImportResult, {
    name: 'importEventAttendancesFromCsv',
  })
  @RequireScopes('event-attendance#edit')
  async importEventAttendancesFromCsv(
    @Args('input', { type: () => EventAttendanceCsvImportInput })
    input: EventAttendanceCsvImportInput,
    @Context() context: GraphqlContext,
  ): Promise<EventAttendanceCsvImportResult> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: input.eventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${input.eventId} was not found.`);
    }

    const { headers, rows } = this.parseCsv(input.csvContent);
    if (!headers.includes(input.selectedHeader)) {
      throw new BadRequestException(`CSV header "${input.selectedHeader}" was not found.`);
    }

    const rawValues = rows.map((row) => row[input.selectedHeader]?.trim() ?? '').filter((value) => value.length > 0);
    const uniqueRawValues = Array.from(new Set(rawValues));
    const inferredMatchType = this.inferMatchType(uniqueRawValues);
    const personByValue = await this.findPeopleByImportValues(uniqueRawValues, inferredMatchType);

    const existingAttendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: input.eventId,
      },
      select: {
        personId: true,
      },
    });
    const existingPersonIds = new Set(existingAttendances.map((attendance) => attendance.personId));

    const failedValues: string[] = [];
    let duplicateCount = 0;
    const personIdsToCreate = new Set<string>();

    for (const rawValue of rawValues) {
      const normalizedValue = this.normalizeImportValue(rawValue, inferredMatchType);
      const person = personByValue.get(normalizedValue);
      if (!person) {
        if (!failedValues.includes(rawValue)) {
          failedValues.push(rawValue);
        }
        continue;
      }

      if (existingPersonIds.has(person.id) || personIdsToCreate.has(person.id)) {
        duplicateCount += 1;
        continue;
      }

      personIdsToCreate.add(person.id);
    }

    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
    const createdPersonIds = Array.from(personIdsToCreate);
    const createResult =
      createdPersonIds.length > 0
        ? await this.prisma.$transaction(async (tx) => {
            const result = await tx.eventAttendance.createMany({
              data: createdPersonIds.map((personId) => ({
                personId,
                eventId: input.eventId,
                createdById,
                createdByMethod: AttendanceCreationMethod.CSV_IMPORT,
              })),
              skipDuplicates: true,
            });
            await this.attendanceCategories.refreshForEventPersons([input.eventId], createdPersonIds, tx);
            return result;
          })
        : { count: 0 };

    return {
      createdCount: createResult.count,
      duplicateCount,
      failedCount: failedValues.length,
      failedValues,
      inferredMatchType,
    };
  }

  @Mutation(() => MajorEventSubscriptionCsvImportResult, {
    name: 'importMajorEventSubscriptionsFromCsv',
  })
  @RequireScopes('event-attendance#edit')
  async importMajorEventSubscriptionsFromCsv(
    @Args('input', { type: () => MajorEventSubscriptionCsvImportInput })
    input: MajorEventSubscriptionCsvImportInput,
    @Context() context: GraphqlContext,
  ): Promise<MajorEventSubscriptionCsvImportResult> {
    const importStatus = this.parseSubscriptionStatus(input.subscriptionStatus);
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: input.majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${input.majorEventId} was not found.`);
    }

    const { headers, rows } = this.parseCsv(input.csvContent);
    this.ensureSubscriptionImportHeaders(headers, input);

    const parsedRows = rows.map((row, index) => ({
      row,
      rowNumber: index + 2,
      personData: this.readSubscriptionImportPersonData(row, input),
      eventIds: this.readSubscribedEventIds(row[input.columnMapping.subscribedEventIdsHeader] ?? ''),
    }));

    const allEventIds = Array.from(new Set(parsedRows.flatMap((row) => row.eventIds)));
    const validEvents = await this.prisma.event.findMany({
      where: {
        id: {
          in: allEventIds,
        },
        majorEventId: input.majorEventId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    const validEventIds = new Set(validEvents.map((event) => event.id));

    const failedRows: string[] = [];
    const createdPeople: PersonMatch[] = [];
    const personEventIds = new Map<string, Set<string>>();
    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    for (const parsedRow of parsedRows) {
      if (!this.hasAnySubscriptionImportPersonData(parsedRow.personData)) {
        failedRows.push(`Linha ${parsedRow.rowNumber}: informe ao menos um dado da pessoa.`);
        continue;
      }

      if (parsedRow.eventIds.length === 0) {
        failedRows.push(`Linha ${parsedRow.rowNumber}: informe ao menos um ID de evento.`);
        continue;
      }

      const invalidEventIds = parsedRow.eventIds.filter((eventId) => !validEventIds.has(eventId));
      if (invalidEventIds.length > 0) {
        failedRows.push(
          `Linha ${parsedRow.rowNumber}: eventos inválidos para este grande evento: ${invalidEventIds.join(', ')}.`,
        );
        continue;
      }

      let person = await this.findPersonForSubscriptionImport(parsedRow.personData);
      if (!person) {
        person = await this.createPersonForSubscriptionImport(parsedRow.personData, createdById);
        createdPeople.push(person);
      }

      if (!personEventIds.has(person.id)) {
        personEventIds.set(person.id, new Set());
      }
      for (const eventId of parsedRow.eventIds) {
        personEventIds.get(person.id)?.add(eventId);
      }
    }

    let createdSubscriptionCount = 0;
    let updatedSubscriptionCount = 0;
    let duplicateCount = 0;
    const now = new Date();

    for (const [personId, selectedEventIdSet] of personEventIds.entries()) {
      const selectedEventIds = Array.from(selectedEventIdSet);
      await this.prisma.$transaction(async (tx) => {
        const existingSubscription = await tx.majorEventSubscription.findFirst({
          where: {
            majorEventId: input.majorEventId,
            personId,
            deletedAt: null,
          },
          select: {
            id: true,
            subscriptionStatus: true,
          },
        });

        if (existingSubscription) {
          await tx.majorEventSubscription.update({
            where: {
              id: existingSubscription.id,
            },
            data: {
              subscriptionStatus: importStatus,
            },
          });
          updatedSubscriptionCount += 1;
        } else {
          await tx.majorEventSubscription.create({
            data: {
              majorEventId: input.majorEventId,
              personId,
              subscriptionStatus: importStatus,
              createdById,
              createdByMethod: 'ADMIN_DASHBOARD',
            },
          });
          createdSubscriptionCount += 1;
        }

        const activeEventSubscriptions = await tx.eventSubscription.findMany({
          where: {
            personId,
            deletedAt: null,
            event: {
              majorEventId: input.majorEventId,
              deletedAt: null,
            },
          },
          select: {
            eventId: true,
          },
        });
        const activeEventIdSet = new Set(activeEventSubscriptions.map((subscription) => subscription.eventId));
        const eventIdsToArchive = [...activeEventIdSet].filter((eventId) => !selectedEventIdSet.has(eventId));
        const eventIdsToCreate = selectedEventIds.filter((eventId) => !activeEventIdSet.has(eventId));

        duplicateCount += selectedEventIds.length - eventIdsToCreate.length;

        if (eventIdsToArchive.length > 0) {
          await tx.eventSubscription.updateMany({
            where: {
              personId,
              eventId: {
                in: eventIdsToArchive,
              },
              deletedAt: null,
            },
            data: {
              deletedAt: now,
            },
          });
        }

        if (eventIdsToCreate.length > 0) {
          await tx.eventSubscription.createMany({
            data: eventIdsToCreate.map((eventId) => ({
              eventId,
              personId,
              createdById,
              createdByMethod: 'ADMIN_DASHBOARD',
            })),
          });
        }

        await this.attendanceCategories.refreshForMajorEventPerson(input.majorEventId, personId, tx);
      });
    }

    return {
      createdSubscriptionCount,
      updatedSubscriptionCount,
      duplicateCount,
      createdPeopleCount: createdPeople.length,
      failedCount: failedRows.length,
      createdPeople,
      failedRows,
    };
  }

  @Mutation(() => EventAttendance, { name: 'updateEventAttendance' })
  @RequireScopes('event-attendance#edit')
  async updateEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('input', { type: () => EventAttendanceUpdateInput })
    input: EventAttendanceUpdateInput,
  ) {
    const { count } = await this.prisma.$transaction(async (tx) => {
      const result = await tx.eventAttendance.updateMany({
        where: {
          personId,
          eventId,
        },
        data: input,
      });

      await this.attendanceCategories.refreshForAttendance(personId, eventId, tx);

      return result;
    });

    if (count === 0) {
      throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
    }

    return this.prisma.eventAttendance.findUnique({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdAt: true,
        createdById: true,
        createdByMethod: true,
        category: true,
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventAttendance' })
  @RequireScopes('event-attendance#delete')
  async deleteEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
  ) {
    const { count } = await this.prisma.eventAttendance.deleteMany({
      where: {
        personId,
        eventId,
      },
    });

    if (count === 0) {
      throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
    }

    return {
      deleted: true,
      personId,
      eventId,
    };
  }

  private parseCsv(csvContent: string): { headers: string[]; rows: CsvRow[] } {
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

    currentRecord.push(currentField);
    if (currentRecord.some((field) => field.trim().length > 0)) {
      records.push(currentRecord);
    }

    const [headerRecord, ...dataRecords] = records;
    const headers = (headerRecord ?? []).map((header) => header.replace(/^\uFEFF/, '').trim());
    if (headers.length === 0) {
      throw new BadRequestException('CSV file must include a header row.');
    }

    return {
      headers,
      rows: dataRecords.map((record) =>
        headers.reduce<CsvRow>((row, header, index) => {
          row[header] = record[index]?.trim() ?? '';
          return row;
        }, {}),
      ),
    };
  }

  private detectCsvDelimiter(csvContent: string): string {
    const firstLine = csvContent.split(/\r?\n/, 1)[0] ?? '';
    const candidates = [',', ';', '\t'];
    return candidates.reduce((bestDelimiter, delimiter) => {
      const bestCount = firstLine.split(bestDelimiter).length;
      const candidateCount = firstLine.split(delimiter).length;
      return candidateCount > bestCount ? delimiter : bestDelimiter;
    }, ',');
  }

  private parseSubscriptionStatus(status: string): SubscriptionStatus {
    if (Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)) {
      return status as SubscriptionStatus;
    }

    throw new BadRequestException(`Invalid subscription status "${status}".`);
  }

  private ensureSubscriptionImportHeaders(headers: string[], input: MajorEventSubscriptionCsvImportInput): void {
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

  private readSubscriptionImportPersonData(
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

  private readMappedCell(row: CsvRow, header?: string | null): string {
    return header ? (row[header]?.trim() ?? '') : '';
  }

  private hasAnySubscriptionImportPersonData(personData: SubscriptionImportPersonData): boolean {
    return [personData.email, personData.fullName, personData.enrollmentNumber, personData.identityDocument].some(
      (value) => Boolean(value),
    );
  }

  private readSubscribedEventIds(value: string): string[] {
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
      try {
        const parsedValue: unknown = JSON.parse(trimmedValue);
        if (Array.isArray(parsedValue)) {
          return this.uniqueEventIds(parsedValue.filter((eventId): eventId is string => typeof eventId === 'string'));
        }
      } catch {
        return [];
      }
    }

    return this.uniqueEventIds(value.split(/[\s,;]+/));
  }

  private uniqueEventIds(eventIds: string[]): string[] {
    return Array.from(new Set(eventIds.map((eventId) => eventId.trim()).filter((eventId) => eventId)));
  }

  private async findPersonForSubscriptionImport(personData: SubscriptionImportPersonData): Promise<PersonMatch | null> {
    const matchFilters = this.buildSubscriptionImportPersonMatchFilters(personData);

    for (const where of matchFilters) {
      const person = await this.prisma.people.findFirst({
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

  private buildSubscriptionImportPersonMatchFilters(
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

  private async createPersonForSubscriptionImport(
    personData: SubscriptionImportPersonData,
    createdById?: string,
  ): Promise<PersonMatch> {
    const name =
      personData.fullName ||
      personData.email ||
      personData.enrollmentNumber ||
      personData.identityDocument ||
      'Pessoa importada';

    return this.prisma.people.create({
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

  private inferMatchType(values: string[]): AttendanceImportMatchType {
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

  private async getScannerFeed(eventId: string): Promise<EventAttendanceScannerFeedItem[]> {
    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId,
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdById: true,
        createdByMethod: true,
        person: {
          select: {
            name: true,
            user: {
              select: {
                role: true,
              },
            },
          },
        },
        event: {
          select: {
            allowSubscription: true,
            majorEventId: true,
          },
        },
      },
      orderBy: {
        attendedAt: 'desc',
      },
      take: 80,
    });

    const majorEventId = attendances.find((attendance) => attendance.event.majorEventId)?.event.majorEventId;
    const personIds = attendances.map((attendance) => attendance.personId);
    const collectorIds = [
      ...new Set(attendances.map((attendance) => attendance.createdById).filter((id): id is string => Boolean(id))),
    ];

    const standaloneEventIds = [
      ...new Set(
        attendances
          .filter((attendance) => attendance.event.allowSubscription && !attendance.event.majorEventId)
          .map((attendance) => attendance.eventId),
      ),
    ];

    const [majorEventSubscriptions, standaloneEventSubscriptions, collectors] = await Promise.all([
      majorEventId
        ? this.prisma.majorEventSubscription.findMany({
            where: {
              majorEventId,
              personId: {
                in: personIds,
              },
              deletedAt: null,
            },
            select: {
              personId: true,
              subscriptionStatus: true,
            },
          })
        : Promise.resolve([]),
      standaloneEventIds.length
        ? this.prisma.eventSubscription.findMany({
            where: {
              eventId: {
                in: standaloneEventIds,
              },
              personId: {
                in: personIds,
              },
              deletedAt: null,
            },
            select: {
              eventId: true,
              personId: true,
            },
          })
        : Promise.resolve([]),
      collectorIds.length
        ? this.prisma.user.findMany({
            where: {
              id: {
                in: collectorIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const majorEventSubscriptionStatusByPersonId = new Map(
      majorEventSubscriptions.map((subscription) => [subscription.personId, subscription.subscriptionStatus]),
    );
    const standaloneEventSubscriptionKeys = new Set(
      standaloneEventSubscriptions.map((subscription) => `${subscription.personId}:${subscription.eventId}`),
    );
    const collectorFirstNameById = new Map(
      collectors.map((collector) => [collector.id, this.getFirstName(collector.name)]),
    );

    return attendances.map((attendance) => ({
      personId: attendance.personId,
      eventId: attendance.eventId,
      fullName: attendance.person?.name ?? undefined,
      unespRole: attendance.person?.user?.role ?? undefined,
      subscriptionStatus:
        majorEventSubscriptionStatusByPersonId.get(attendance.personId) ??
        (standaloneEventSubscriptionKeys.has(`${attendance.personId}:${attendance.eventId}`) ? 'CONFIRMED' : undefined),
      attendedAt: attendance.attendedAt,
      createdByMethod: attendance.createdByMethod,
      collectedByFirstName: attendance.createdById ? (collectorFirstNameById.get(attendance.createdById) ?? undefined) : undefined,
    }));
  }

  private async createAttendanceWithMetadata(input: {
    eventId: string;
    personId: string;
    createdByMethod: AttendanceCreationMethod;
    createdById?: string;
    location?: { latitude: number; longitude: number; accuracyMeters: number };
  }) {
    const locationData = input.location
      ? {
          collectedLatitude: input.location.latitude,
          collectedLongitude: input.location.longitude,
          collectedAccuracyMeters: input.location.accuracyMeters,
        }
      : {};

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId: input.eventId,
            personId: input.personId,
            createdById: input.createdById,
            createdByMethod: input.createdByMethod,
            ...locationData,
          },
        });
        await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
        return tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: input.personId,
              eventId: input.eventId,
            },
          },
          select: {
            personId: true,
            eventId: true,
            attendedAt: true,
            createdAt: true,
            createdById: true,
            createdByMethod: true,
            category: true,
            collectedLatitude: true,
            collectedLongitude: true,
            collectedAccuracyMeters: true,
          },
        });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  private async findSinglePersonForManualInput(rawValue: string): Promise<{ id: string }> {
    const value = rawValue.trim();
    if (!value) {
      throw new BadRequestException('Informe e-mail, telefone ou documento.');
    }

    const digits = value.replace(/\D/g, '');
    const phoneCandidates = this.getBrazilianPhoneCandidates(digits);
    const where: Prisma.PeopleWhereInput[] = [
      {
        email: {
          equals: value,
          mode: 'insensitive',
        },
      },
      {
        secondaryEmails: {
          has: value.toLowerCase(),
        },
      },
    ];

    if (digits) {
      where.push({
        identityDocument: {
          in: [value, digits],
        },
      });
    }

    if (phoneCandidates.length > 0) {
      where.push({
        phone: {
          in: phoneCandidates,
        },
      });
    }

    const people = await this.prisma.people.findMany({
      where: {
        deletedAt: null,
        OR: where,
      },
      select: {
        id: true,
        mergedIntoId: true,
      },
      take: 3,
    });

    const activePeople = people.filter((person) => !person.mergedIntoId);
    if (activePeople.length > 1) {
      throw new ConflictException(
        `Pessoa tem registros duplicados no banco de dados com o dado ${value}. Tire uma captura dessa tela e envie para o administrador do sistema, para correção.`,
      );
    }

    const person = activePeople[0] ?? people[0];
    if (!person) {
      throw new NotFoundException('Nenhuma pessoa encontrada para o dado informado.');
    }

    return { id: person.mergedIntoId ?? person.id };
  }

  private getBrazilianPhoneCandidates(digits: string): string[] {
    if (!digits) {
      return [];
    }

    const withoutCountry = digits.startsWith('55') && digits.length > 11 ? digits.slice(2) : digits;
    const withCountry = withoutCountry.length >= 10 ? `55${withoutCountry}` : digits;
    return [...new Set([digits, withoutCountry, withCountry, `+${withCountry}`])];
  }

  private getActorId(context: GraphqlContext): string | undefined {
    return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
  }

  private getFirstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }

  private parseUserAztecCode(code: string): string | null {
    const trimmedCode = code.trim();
    if (!trimmedCode.startsWith('user:')) {
      return null;
    }

    const userId = trimmedCode.slice('user:'.length).trim();
    return userId.length > 0 ? userId : null;
  }

  private looksLikeIdentityDocument(value: string): boolean {
    const compactValue = value.trim().replace(/[.\-/\s]/g, '');
    if (this.isValidCpf(compactValue)) {
      return true;
    }

    return /^[A-Za-z0-9]{5,20}$/.test(compactValue);
  }

  private async findPeopleByImportValues(
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
          if (!result.has(key)) {
            result.set(key, person);
          }
        }
      }
    }

    return result;
  }

  private buildPeopleMatchFilters(values: string[], matchType: AttendanceImportMatchType): Prisma.PeopleWhereInput[] {
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

  private getPersonMatchKeys(person: PersonMatch, matchType: AttendanceImportMatchType): string[] {
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

  private normalizeImportValue(value: string, matchType: AttendanceImportMatchType): string {
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

  private identityDocumentLookupValues(value: string): string[] {
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

  private isValidCpf(value: string): boolean {
    const cpf = value.replace(/\D/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
      return false;
    }

    const firstDigit = this.calculateCpfDigit(cpf.slice(0, 9), 10);
    const secondDigit = this.calculateCpfDigit(`${cpf.slice(0, 9)}${firstDigit}`, 11);

    return cpf === `${cpf.slice(0, 9)}${firstDigit}${secondDigit}`;
  }

  private calculateCpfDigit(base: string, factor: number): number {
    const total = base.split('').reduce((sum, digit, index) => sum + Number(digit) * (factor - index), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  }

  private chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
      chunks.push(items.slice(index, index + size));
    }
    return chunks;
  }
}
