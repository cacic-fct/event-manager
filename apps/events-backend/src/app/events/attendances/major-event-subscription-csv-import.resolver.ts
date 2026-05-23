import {
  EventAttendance,
  MajorEventSubscriptionCsvImportInput,
  MajorEventSubscriptionCsvImportResult,
} from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { RequireScopes } from '../../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, GraphqlContext, PersonMatch } from './event-attendances.shared';

@Resolver(() => EventAttendance)
export class MajorEventSubscriptionCsvImportResolver extends EventAttendancesResolverBase {
  constructor(prisma: PrismaService, attendanceCategories: AttendanceCategoryService) {
    super(prisma, attendanceCategories);
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
    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    let createdSubscriptionCount = 0;
    let updatedSubscriptionCount = 0;
    let duplicateCount = 0;
    const now = new Date();

    const createdPeople = await this.prisma.$transaction(async (tx) => {
      const transactionCreatedPeople: PersonMatch[] = [];
      const personEventIds = new Map<string, Set<string>>();

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

        let person = await this.findPersonForSubscriptionImport(parsedRow.personData, tx);
        if (!person) {
          person = await this.createPersonForSubscriptionImport(parsedRow.personData, createdById, tx);
          transactionCreatedPeople.push(person);
        }

        if (!personEventIds.has(person.id)) {
          personEventIds.set(person.id, new Set());
        }
        for (const eventId of parsedRow.eventIds) {
          personEventIds.get(person.id)?.add(eventId);
        }
      }

      for (const [personId, selectedEventIdSet] of personEventIds.entries()) {
        const selectedEventIds = Array.from(selectedEventIdSet);
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
      }

      return transactionCreatedPeople;
    });

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
}
