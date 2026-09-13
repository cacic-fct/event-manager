import {
  EventAttendance,
  MajorEventSubscriptionCsvImportInput,
  MajorEventSubscriptionCsvImportResult,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, GraphqlContext, PersonMatch } from './event-attendances.shared';

@Resolver(() => EventAttendance)
export class MajorEventSubscriptionCsvImportResolver extends EventAttendancesResolverBase {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    private readonly frozenResources: FrozenResourceService = {
      assertMajorEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
    private readonly auditLog: AuditLogService = { record: async () => undefined } as unknown as AuditLogService,
  ) {
    super(prisma, attendanceCategories);
  }

  @Mutation(() => MajorEventSubscriptionCsvImportResult, {
    name: 'importMajorEventSubscriptionsFromCsv',
  })
  @RequirePermissions(Permission.Subscription.Import)
  async importMajorEventSubscriptionsFromCsv(
    @Args('input', { type: () => MajorEventSubscriptionCsvImportInput })
    input: MajorEventSubscriptionCsvImportInput,
    @Context() context: GraphqlContext,
  ): Promise<MajorEventSubscriptionCsvImportResult> {
    await this.frozenResources.assertMajorEventMutable(
      input.majorEventId,
      context.req?.user ?? context.request?.user,
      'edit',
    );
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
    let changedSubscriptionCount = 0;
    let duplicateCount = 0;
    const now = new Date();

    const createdPeople = await this.prisma.$transaction(async (tx) => {
      const transactionCreatedPeople: PersonMatch[] = [];
      const personEventIds = new Map<string, Set<string>>();
      let archivedEventSubscriptionCount = 0;
      let createdEventSubscriptionCount = 0;

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
          const updated = await tx.majorEventSubscription.updateMany({
            where: {
              id: existingSubscription.id,
              subscriptionStatus: { not: importStatus },
            },
            data: {
              subscriptionStatus: importStatus,
            },
          });
          if (updated.count > 0) {
            changedSubscriptionCount += updated.count;
          }
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
          const archived = await tx.eventSubscription.updateMany({
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
          archivedEventSubscriptionCount += archived.count;
        }

        if (eventIdsToCreate.length > 0) {
          const created = await tx.eventSubscription.createMany({
            data: eventIdsToCreate.map((eventId) => ({
              eventId,
              personId,
              createdById,
              createdByMethod: 'ADMIN_DASHBOARD',
            })),
          });
          createdEventSubscriptionCount += created.count;
        }

        await this.attendanceCategories.refreshForMajorEventPerson(input.majorEventId, personId, tx);
      }

      const mutationCount =
        transactionCreatedPeople.length +
        createdSubscriptionCount +
        changedSubscriptionCount +
        archivedEventSubscriptionCount +
        createdEventSubscriptionCount;
      if (mutationCount > 0) {
        await this.auditLog.record(
          {
            entityType: AuditLogEntityType.SYSTEM,
            entityId: `major-event-subscription-import:${input.majorEventId}`,
            entityLabel: 'Importação de inscrições',
            operation: AuditLogOperation.IMPORT,
            actor: context.req?.user ?? context.request?.user,
            summary: 'Inscrições importadas por CSV.',
            scope: {
              permission: Permission.Subscription.Import,
              majorEventId: input.majorEventId,
            },
            metadata: {
              resourceType: 'MAJOR_EVENT_SUBSCRIPTION_CSV_IMPORT',
              importedRows: parsedRows.length,
              createdPeopleCount: transactionCreatedPeople.length,
              createdSubscriptionCount,
              updatedSubscriptionCount,
              changedSubscriptionCount,
              createdEventSubscriptionCount,
              archivedEventSubscriptionCount,
              duplicateCount,
              failedCount: failedRows.length,
            },
            force: true,
            squashWindowMs: 0,
          },
          tx,
        );
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
