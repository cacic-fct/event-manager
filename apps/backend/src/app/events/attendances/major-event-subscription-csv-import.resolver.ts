import { loadWorkspaceTierSubscriptionPolicy } from '../tier-subscription-policy';
import { TicketSubscriptionSyncService } from '../ticket-subscription-sync.service';
import {
  EventAttendance,
  MajorEventSubscriptionCsvImportInput,
  MajorEventSubscriptionCsvImportResult,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException, Optional } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
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
    @Optional() private readonly ticketSubscriptions?: TicketSubscriptionSyncService,
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
        OR: [
          { majorEventId: input.majorEventId },
          { eventGroup: { majorEventId: input.majorEventId, deletedAt: null } },
        ],
        deletedAt: null,
        sportsMatch: { is: null },
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

    const createdPeople = await this.prisma.$transaction(
      async (tx) => {
        const tierPolicy = await loadWorkspaceTierSubscriptionPolicy(tx, input.majorEventId);
        const transactionCreatedPeople: PersonMatch[] = [];
        const personEventIds = new Map<string, Set<string>>();
        const personRowNumbers = new Map<string, number[]>();
        let archivedEventSubscriptionCount = 0;
        let createdEventSubscriptionCount = 0;
        let changedSelectionCount = 0;

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

          personRowNumbers.set(person.id, [...(personRowNumbers.get(person.id) ?? []), parsedRow.rowNumber]);
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
              paymentTier: true,
            },
          });

          try {
            tierPolicy.validate(input.paymentTier ?? existingSubscription?.paymentTier, selectedEventIds);
          } catch (error: unknown) {
            if (!(error instanceof BadRequestException)) {
              throw error;
            }
            const createdPersonIndex = transactionCreatedPeople.findIndex((person) => person.id === personId);
            if (createdPersonIndex !== -1) {
              // This person was created only in this import and has no subscription writes yet.
              await tx.people.delete({ where: { id: personId } });
              transactionCreatedPeople.splice(createdPersonIndex, 1);
            }
            for (const rowNumber of personRowNumbers.get(personId) ?? []) {
              failedRows.push(`Linha ${rowNumber}: ${error.message}`);
            }
            continue;
          }

          const paymentTier = tierPolicy.canonicalPaymentTier(input.paymentTier ?? existingSubscription?.paymentTier);
          let subscriptionId: string;
          if (existingSubscription) {
            subscriptionId = existingSubscription.id;
            const updated = await tx.majorEventSubscription.updateMany({
              where: {
                id: existingSubscription.id,
                ...(paymentTier != null
                  ? {
                      OR: [
                        { subscriptionStatus: { not: importStatus } },
                        { paymentTier: { not: paymentTier.trim() } },
                        { paymentTier: null },
                      ],
                    }
                  : { subscriptionStatus: { not: importStatus } }),
              },
              data: {
                subscriptionStatus: importStatus,
                ...(paymentTier != null ? { paymentTier: paymentTier.trim() } : {}),
              },
            });
            if (updated.count > 0) {
              changedSubscriptionCount += updated.count;
            }
            updatedSubscriptionCount += 1;
          } else {
            const createdSubscription = await tx.majorEventSubscription.create({
              data: {
                majorEventId: input.majorEventId,
                personId,
                subscriptionStatus: importStatus,
                ...(paymentTier != null ? { paymentTier: paymentTier.trim() } : {}),
                createdById,
                createdByMethod: 'ADMIN_DASHBOARD',
              },
              select: { id: true },
            });
            subscriptionId = createdSubscription.id;
            createdSubscriptionCount += 1;
          }

          const activeSelections = await tx.majorEventSubscriptionEventSelection.findMany({
            where: { subscriptionId, deletedAt: null },
            select: { eventId: true },
          });
          const activeSelectionIds = new Set(activeSelections.map((selection) => selection.eventId));
          const removedSelectionIds = [...activeSelectionIds].filter((eventId) => !selectedEventIdSet.has(eventId));
          if (removedSelectionIds.length > 0) {
            const archived = await tx.majorEventSubscriptionEventSelection.updateMany({
              where: { subscriptionId, eventId: { in: removedSelectionIds }, deletedAt: null },
              data: { deletedAt: now },
            });
            changedSelectionCount += archived.count;
          }
          const newSelectionIds = selectedEventIds.filter((eventId) => !activeSelectionIds.has(eventId));
          if (newSelectionIds.length > 0) {
            const created = await tx.majorEventSubscriptionEventSelection.createMany({
              data: newSelectionIds.map((eventId) => ({ subscriptionId, eventId, createdById })),
            });
            changedSelectionCount += created.count;
          }

          const activeEventSubscriptions = await tx.eventSubscription.findMany({
            where: {
              personId,
              deletedAt: null,
              event: {
                OR: [
                  { majorEventId: input.majorEventId },
                  { eventGroup: { majorEventId: input.majorEventId, deletedAt: null } },
                ],
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

          await this.ticketSubscriptions?.forMajorEvent(tx, input.majorEventId, personId);
          await this.attendanceCategories.refreshForMajorEventPerson(input.majorEventId, personId, tx);
        }

        const mutationCount =
          transactionCreatedPeople.length +
          createdSubscriptionCount +
          changedSubscriptionCount +
          archivedEventSubscriptionCount +
          createdEventSubscriptionCount +
          changedSelectionCount;
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
                changedSelectionCount,
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

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
