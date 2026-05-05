import {
  AttendanceImportMatchType,
  DeletionResult,
  EventAttendance,
  EventAttendanceCreateInput,
  EventAttendanceCsvImportInput,
  EventAttendanceCsvImportResult,
  EventAttendanceUpdateInput,
  MajorEventSubscriptionCsvImportInput,
  MajorEventSubscriptionCsvImportResult,
  MajorEventUserAttendance,
} from '@cacic-eventos/shared-data-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AttendanceCreationMethod,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [EventAttendance], { name: 'eventAttendances' })
  @RequireScopes('event-attendance#read')
  eventAttendances(
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

    return this.prisma.eventAttendance.findMany({
      where,
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdAt: true,
        createdById: true,
        createdByMethod: true,
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

    if (subscriptions.length === 0) {
      return [];
    }

    const personIds = subscriptions.map(
      (subscription) => subscription.personId,
    );
    const eventSubscriptions = await this.prisma.eventSubscription.findMany({
      where: {
        personId: { in: personIds },
        deletedAt: null,
        event: {
          majorEventId,
          deletedAt: null,
        },
      },
      select: {
        personId: true,
        eventId: true,
        event: {
          select: {
            id: true,
            name: true,
            startDate: true,
          },
        },
      },
      orderBy: {
        event: {
          startDate: 'asc',
        },
      },
    });

    const subscribedEventIds = Array.from(
      new Set(eventSubscriptions.map((subscription) => subscription.eventId)),
    );
    if (subscribedEventIds.length === 0) {
      return subscriptions.map((subscription) => ({
        majorEventId: subscription.majorEventId,
        subscriptionId: subscription.id,
        personId: subscription.personId,
        person: subscription.person,
        subscriptionStatus: subscription.subscriptionStatus,
        amountPaid: subscription.amountPaid,
        paymentDate: subscription.paymentDate,
        paymentTier: subscription.paymentTier,
        attendances: [],
      }));
    }

    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        personId: {
          in: personIds,
        },
        eventId: {
          in: subscribedEventIds,
        },
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
      },
    });

    const attendanceByKey = new Map(
      attendances.map((attendance) => [
        `${attendance.personId}:${attendance.eventId}`,
        attendance,
      ]),
    );

    const subscriptionsByPerson = new Map(
      personIds.map((id) => [
        id,
        eventSubscriptions.filter(
          (subscription) => subscription.personId === id,
        ),
      ]),
    );

    return subscriptions.map((subscription) => ({
      majorEventId: subscription.majorEventId,
      subscriptionId: subscription.id,
      personId: subscription.personId,
      person: subscription.person,
      subscriptionStatus: subscription.subscriptionStatus,
      amountPaid: subscription.amountPaid,
      paymentDate: subscription.paymentDate,
      paymentTier: subscription.paymentTier,
      attendances: (subscriptionsByPerson.get(subscription.personId) ?? []).map(
        (eventSubscription) => {
          const event = eventSubscription.event;
          const attendance = attendanceByKey.get(
            `${subscription.personId}:${event.id}`,
          );
          return {
            eventId: event.id,
            eventName: event.name,
            eventStartDate: event.startDate,
            attended: attendance != null,
            attendedAt: attendance?.attendedAt,
          };
        },
      ),
    }));
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
        person: true,
        event: {
          select: EVENT_RELATION_SELECT,
        },
      },
    });

    if (!attendance) {
      throw new NotFoundException(
        `Attendance ${personId}/${eventId} was not found.`,
      );
    }

    return attendance;
  }

  @Mutation(() => EventAttendance, { name: 'createEventAttendance' })
  @RequireScopes('event-attendance#edit')
  createEventAttendance(
    @Args('input', { type: () => EventAttendanceCreateInput })
    input: EventAttendanceCreateInput,
  ) {
    return this.prisma.eventAttendance.create({
      data: {
        ...input,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      },
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
      throw new BadRequestException(
        `CSV header "${input.selectedHeader}" was not found.`,
      );
    }

    const rawValues = rows
      .map((row) => row[input.selectedHeader]?.trim() ?? '')
      .filter((value) => value.length > 0);
    const uniqueRawValues = Array.from(new Set(rawValues));
    const inferredMatchType = this.inferMatchType(uniqueRawValues);
    const personByValue = await this.findPeopleByImportValues(
      uniqueRawValues,
      inferredMatchType,
    );

    const existingAttendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId: input.eventId,
      },
      select: {
        personId: true,
      },
    });
    const existingPersonIds = new Set(
      existingAttendances.map((attendance) => attendance.personId),
    );

    const failedValues: string[] = [];
    let duplicateCount = 0;
    const personIdsToCreate = new Set<string>();

    for (const rawValue of rawValues) {
      const normalizedValue = this.normalizeImportValue(
        rawValue,
        inferredMatchType,
      );
      const person = personByValue.get(normalizedValue);
      if (!person) {
        if (!failedValues.includes(rawValue)) {
          failedValues.push(rawValue);
        }
        continue;
      }

      if (
        existingPersonIds.has(person.id) ||
        personIdsToCreate.has(person.id)
      ) {
        duplicateCount += 1;
        continue;
      }

      personIdsToCreate.add(person.id);
    }

    const createdById =
      context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
    const createResult =
      personIdsToCreate.size > 0
        ? await this.prisma.eventAttendance.createMany({
            data: Array.from(personIdsToCreate).map((personId) => ({
              personId,
              eventId: input.eventId,
              createdById,
              createdByMethod: AttendanceCreationMethod.CSV_IMPORT,
            })),
            skipDuplicates: true,
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
      throw new NotFoundException(
        `Major event ${input.majorEventId} was not found.`,
      );
    }

    const { headers, rows } = this.parseCsv(input.csvContent);
    this.ensureSubscriptionImportHeaders(headers, input);

    const parsedRows = rows.map((row, index) => ({
      row,
      rowNumber: index + 2,
      personData: this.readSubscriptionImportPersonData(row, input),
      eventIds: this.readSubscribedEventIds(
        row[input.columnMapping.subscribedEventIdsHeader] ?? '',
      ),
    }));

    const allEventIds = Array.from(
      new Set(parsedRows.flatMap((row) => row.eventIds)),
    );
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
    const createdById =
      context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    for (const parsedRow of parsedRows) {
      if (!this.hasAnySubscriptionImportPersonData(parsedRow.personData)) {
        failedRows.push(
          `Linha ${parsedRow.rowNumber}: informe ao menos um dado da pessoa.`,
        );
        continue;
      }

      if (parsedRow.eventIds.length === 0) {
        failedRows.push(
          `Linha ${parsedRow.rowNumber}: informe ao menos um ID de evento.`,
        );
        continue;
      }

      const invalidEventIds = parsedRow.eventIds.filter(
        (eventId) => !validEventIds.has(eventId),
      );
      if (invalidEventIds.length > 0) {
        failedRows.push(
          `Linha ${parsedRow.rowNumber}: eventos inválidos para este grande evento: ${invalidEventIds.join(', ')}.`,
        );
        continue;
      }

      let person = await this.findPersonForSubscriptionImport(
        parsedRow.personData,
      );
      if (!person) {
        person = await this.createPersonForSubscriptionImport(
          parsedRow.personData,
          createdById,
        );
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
        const activeEventIdSet = new Set(
          activeEventSubscriptions.map((subscription) => subscription.eventId),
        );
        const eventIdsToArchive = [...activeEventIdSet].filter(
          (eventId) => !selectedEventIdSet.has(eventId),
        );
        const eventIdsToCreate = selectedEventIds.filter(
          (eventId) => !activeEventIdSet.has(eventId),
        );

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
            })),
          });
        }
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
    const { count } = await this.prisma.eventAttendance.updateMany({
      where: {
        personId,
        eventId,
      },
      data: input,
    });

    if (count === 0) {
      throw new NotFoundException(
        `Attendance ${personId}/${eventId} was not found.`,
      );
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
      throw new NotFoundException(
        `Attendance ${personId}/${eventId} was not found.`,
      );
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
    const headers = (headerRecord ?? []).map((header) =>
      header.replace(/^\uFEFF/, '').trim(),
    );
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
    if (
      Object.values(SubscriptionStatus).includes(status as SubscriptionStatus)
    ) {
      return status as SubscriptionStatus;
    }

    throw new BadRequestException(`Invalid subscription status "${status}".`);
  }

  private ensureSubscriptionImportHeaders(
    headers: string[],
    input: MajorEventSubscriptionCsvImportInput,
  ): void {
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
      throw new BadRequestException(
        'A subscribed events column must be selected.',
      );
    }

    if (
      ![
        mapping.emailHeader,
        mapping.fullNameHeader,
        mapping.enrollmentNumberHeader,
        mapping.identityDocumentHeader,
      ].some((header) => Boolean(header))
    ) {
      throw new BadRequestException(
        'At least one person information column must be selected.',
      );
    }
  }

  private readSubscriptionImportPersonData(
    row: CsvRow,
    input: MajorEventSubscriptionCsvImportInput,
  ): SubscriptionImportPersonData {
    const mapping = input.columnMapping;
    return {
      email: this.readMappedCell(row, mapping.emailHeader).toLowerCase(),
      fullName: this.readMappedCell(row, mapping.fullNameHeader).replace(
        /\s+/g,
        ' ',
      ),
      enrollmentNumber: this.readMappedCell(
        row,
        mapping.enrollmentNumberHeader,
      ),
      identityDocument: this.readMappedCell(
        row,
        mapping.identityDocumentHeader,
      ),
    };
  }

  private readMappedCell(row: CsvRow, header?: string | null): string {
    return header ? (row[header]?.trim() ?? '') : '';
  }

  private hasAnySubscriptionImportPersonData(
    personData: SubscriptionImportPersonData,
  ): boolean {
    return [
      personData.email,
      personData.fullName,
      personData.enrollmentNumber,
      personData.identityDocument,
    ].some((value) => Boolean(value));
  }

  private readSubscribedEventIds(value: string): string[] {
    const trimmedValue = value.trim();
    if (trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) {
      try {
        const parsedValue: unknown = JSON.parse(trimmedValue);
        if (Array.isArray(parsedValue)) {
          return this.uniqueEventIds(
            parsedValue.filter(
              (eventId): eventId is string => typeof eventId === 'string',
            ),
          );
        }
      } catch {
        return [];
      }
    }

    return this.uniqueEventIds(value.split(/[\s,;]+/));
  }

  private uniqueEventIds(eventIds: string[]): string[] {
    return Array.from(
      new Set(
        eventIds.map((eventId) => eventId.trim()).filter((eventId) => eventId),
      ),
    );
  }

  private async findPersonForSubscriptionImport(
    personData: SubscriptionImportPersonData,
  ): Promise<PersonMatch | null> {
    const matchFilters =
      this.buildSubscriptionImportPersonMatchFilters(personData);

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
        OR: this.identityDocumentLookupValues(personData.identityDocument).map(
          (identityDocument) => ({ identityDocument }),
        ),
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

    const emailCount = nonEmptyValues.filter((value) =>
      value.includes('@'),
    ).length;
    if (emailCount > 0) {
      return AttendanceImportMatchType.EMAIL;
    }

    const identityDocumentCount = nonEmptyValues.filter((value) =>
      this.looksLikeIdentityDocument(value),
    ).length;
    if (identityDocumentCount / nonEmptyValues.length >= 0.5) {
      return AttendanceImportMatchType.IDENTITY_DOCUMENT;
    }

    return AttendanceImportMatchType.FULL_NAME;
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
      new Set(
        values
          .map((value) => this.normalizeImportValue(value, matchType))
          .filter((value) => value.length > 0),
      ),
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

  private buildPeopleMatchFilters(
    values: string[],
    matchType: AttendanceImportMatchType,
  ): Prisma.PeopleWhereInput[] {
    switch (matchType) {
      case AttendanceImportMatchType.EMAIL:
        return values.map((value) => ({
          OR: [
            { email: { equals: value, mode: 'insensitive' } },
            { secondaryEmails: { has: value } },
          ],
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

  private getPersonMatchKeys(
    person: PersonMatch,
    matchType: AttendanceImportMatchType,
  ): string[] {
    switch (matchType) {
      case AttendanceImportMatchType.EMAIL:
        return [person.email, ...person.secondaryEmails]
          .filter((value): value is string => Boolean(value))
          .map((value) => this.normalizeImportValue(value, matchType));
      case AttendanceImportMatchType.IDENTITY_DOCUMENT:
        return person.identityDocument
          ? [this.normalizeImportValue(person.identityDocument, matchType)]
          : [];
      case AttendanceImportMatchType.FULL_NAME:
        return [this.normalizeImportValue(person.name, matchType)];
    }
  }

  private normalizeImportValue(
    value: string,
    matchType: AttendanceImportMatchType,
  ): string {
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
    const normalizedValue = this.normalizeImportValue(
      value,
      AttendanceImportMatchType.IDENTITY_DOCUMENT,
    );
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
    const secondDigit = this.calculateCpfDigit(
      `${cpf.slice(0, 9)}${firstDigit}`,
      11,
    );

    return cpf === `${cpf.slice(0, 9)}${firstDigit}${secondDigit}`;
  }

  private calculateCpfDigit(base: string, factor: number): number {
    const total = base
      .split('')
      .reduce((sum, digit, index) => sum + Number(digit) * (factor - index), 0);
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
