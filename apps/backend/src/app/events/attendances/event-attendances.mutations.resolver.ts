import {
  DeletionResult,
  EventAttendance,
  EventAttendanceCreateInput,
  EventAttendanceManualInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceUpdateInput,
  OfflineEventAttendanceSubmission,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, EVENT_RELATION_SELECT, GraphqlContext } from './event-attendances.shared';

const EVENT_ATTENDANCE_AUDIT_SELECT = {
  personId: true,
  eventId: true,
  attendedAt: true,
  createdAt: true,
  createdById: true,
  committedById: true,
  createdByMethod: true,
  category: true,
  collectedLatitude: true,
  collectedLongitude: true,
  collectedAccuracyMeters: true,
} satisfies Prisma.EventAttendanceSelect;

const MAX_OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE = 100;

@Resolver(() => EventAttendance)
export class EventAttendancesMutationsResolver extends EventAttendancesResolverBase {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
      buildCompositeEntityId: (parts: readonly string[]) => parts.join(':'),
    } as unknown as AuditLogService,
    private readonly frozenResources: FrozenResourceService = {
      assertEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
    private readonly dashboardInsights: DashboardInsightsService = {
      invalidateCachedInsights: async () => undefined,
    } as unknown as DashboardInsightsService,
  ) {
    super(prisma, attendanceCategories);
  }

  @Mutation(() => EventAttendance, { name: 'createEventAttendance' })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendance(
    @Args('input', { type: () => EventAttendanceCreateInput })
    input: EventAttendanceCreateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const createdById = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;

    try {
      const attendance = await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            personId: input.personId,
            eventId: input.eventId,
            attendedAt: input.attendedAt,
            createdById,
            committedById: createdById,
            createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
          },
        });
        await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
        const attendance = await tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: input.personId,
              eventId: input.eventId,
            },
          },
          select: EVENT_ATTENDANCE_AUDIT_SELECT,
        });
        await this.recordAttendanceCreate(
          attendance,
          context,
          'Presença registrada manualmente pelo painel administrativo.',
          tx,
        );
        return attendance;
      });
      return attendance;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromAztecCode',
  })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendanceFromAztecCode(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('code', { type: () => String }) code: string,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'edit');
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
      const attendance = await this.prisma.$transaction(async (tx) => {
        await tx.eventAttendance.create({
          data: {
            eventId,
            personId: person.id,
            createdById,
            committedById: createdById,
            createdByMethod: AttendanceCreationMethod.SCANNER,
          },
        });
        await this.attendanceCategories.refreshForAttendance(person.id, eventId, tx);
        const attendance = await tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId: person.id,
              eventId,
            },
          },
          select: EVENT_ATTENDANCE_AUDIT_SELECT,
        });
        await this.recordAttendanceCreate(
          attendance,
          context,
          'Presença registrada por leitura de código no painel administrativo.',
          tx,
        );
        return attendance;
      });
      return attendance;
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
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendanceFromScannerCode(
    @Args('input', { type: () => EventAttendanceScannerCodeInput })
    input: EventAttendanceScannerCodeInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
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

    return this.createAttendanceWithMetadata(
      {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: this.getActorId(context),
        committedById: this.getActorId(context),
        location: input.location,
      },
      (attendance, tx) => this.recordAttendanceCreate(attendance, context, 'Presença registrada pelo scanner.', tx),
    );
  }

  @Mutation(() => EventAttendance, {
    name: 'createEventAttendanceFromManualInput',
  })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createEventAttendanceFromManualInput(
    @Args('input', { type: () => EventAttendanceManualInput })
    input: EventAttendanceManualInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const person = await this.findSinglePersonForManualInput(input.value);
    return this.createAttendanceWithMetadata(
      {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        createdById: this.getActorId(context),
        committedById: this.getActorId(context),
        location: input.location,
      },
      (attendance, tx) => this.recordAttendanceCreate(attendance, context, 'Presença registrada por entrada manual.', tx),
    );
  }

  @Mutation(() => OfflineEventAttendanceSubmission, { name: 'approveOfflineEventAttendanceSubmission' })
  @RequirePermissions(Permission.EventAttendance.Update)
  async approveOfflineEventAttendanceSubmission(
    @Args('submissionId', { type: () => String }) submissionId: string,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission> {
    return this.approveOfflineEventAttendanceSubmissionById(submissionId, context);
  }

  @Mutation(() => [OfflineEventAttendanceSubmission], { name: 'approveOfflineEventAttendanceSubmissions' })
  @RequirePermissions(Permission.EventAttendance.Update)
  async approveOfflineEventAttendanceSubmissions(
    @Args('submissionIds', { type: () => [String] }) submissionIds: string[],
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission[]> {
    const normalizedIds = this.normalizeSubmissionBatch(submissionIds);
    const results: OfflineEventAttendanceSubmission[] = [];
    for (const submissionId of normalizedIds) {
      results.push(await this.approveOfflineEventAttendanceSubmissionById(submissionId, context));
    }

    return results;
  }

  private async approveOfflineEventAttendanceSubmissionById(
    submissionId: string,
    context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission> {
    const submission = await this.prisma.offlineEventAttendanceSubmission.findUnique({
      where: {
        id: submissionId,
      },
      include: {
        event: true,
        person: true,
      },
    });
    if (!submission) {
      throw new NotFoundException(`Offline attendance submission ${submissionId} was not found.`);
    }
    if (submission.status !== 'PENDING') {
      throw new ConflictException('Esta presença off-line já foi revisada.');
    }

    await this.frozenResources.assertEventMutable(submission.eventId, this.getUser(context), 'edit');
    const personId = submission.personId ?? (await this.resolveOfflineSubmissionPerson(submission));
    const committedById = this.getActorId(context);

    try {
      await this.prisma.$transaction(async (tx) => {
        const existingAttendance = await tx.eventAttendance.findUnique({
          where: {
            personId_eventId: {
              personId,
              eventId: submission.eventId,
            },
          },
          select: EVENT_ATTENDANCE_AUDIT_SELECT,
        });
        if (existingAttendance) {
          await tx.offlineEventAttendanceSubmission.update({
            where: {
              id: submission.id,
            },
            data: {
              status: 'COMMITTED',
              personId,
              committedAt: new Date(),
              committedById,
              resolutionError: null,
            },
          });
          await this.auditLog.record(
            {
              entityType: AuditLogEntityType.EVENT_ATTENDANCE,
              entityId: this.auditLog.buildCompositeEntityId([personId, submission.eventId]),
              entityLabel: personId,
              operation: AuditLogOperation.UPDATE,
              actor: this.getUser(context),
              before: existingAttendance,
              after: existingAttendance,
              scope: {
                permission: Permission.EventAttendance.Update,
                eventId: submission.eventId,
              },
              summary: 'Presença off-line aprovada, mas a presença já estava registrada.',
            },
            tx,
          );
          return;
        }

        await tx.eventAttendance.create({
          data: {
            eventId: submission.eventId,
            personId,
            attendedAt: submission.collectedAt,
            createdById: submission.authorUserId ?? submission.submittedById,
            committedById,
            createdByMethod: submission.createdByMethod,
            collectedLatitude: submission.collectedLatitude,
            collectedLongitude: submission.collectedLongitude,
            collectedAccuracyMeters: submission.collectedAccuracyMeters,
          },
        });
        await this.attendanceCategories.refreshForAttendance(personId, submission.eventId, tx);
        const attendance = await tx.eventAttendance.findUniqueOrThrow({
          where: {
            personId_eventId: {
              personId,
              eventId: submission.eventId,
            },
          },
          select: EVENT_ATTENDANCE_AUDIT_SELECT,
        });
        await tx.offlineEventAttendanceSubmission.update({
          where: {
            id: submission.id,
          },
          data: {
            status: 'COMMITTED',
            personId,
            committedAt: new Date(),
            committedById,
            resolutionError: null,
          },
        });
        await this.recordAttendanceCreate(
          attendance,
          context,
          'Presença off-line aprovada e registrada pelo painel administrativo.',
          tx,
        );
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Presença já registrada para este evento.');
      }

      throw error;
    }

    await this.dashboardInsights.invalidateCachedInsights();
    return this.getOfflineSubmissionForResponse(submission.id);
  }

  @Mutation(() => OfflineEventAttendanceSubmission, { name: 'rejectOfflineEventAttendanceSubmission' })
  @RequirePermissions(Permission.EventAttendance.Update)
  async rejectOfflineEventAttendanceSubmission(
    @Args('submissionId', { type: () => String }) submissionId: string,
    @Args('reason', { type: () => String, nullable: true }) reason: string | null | undefined,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission> {
    return this.rejectOfflineEventAttendanceSubmissionById(submissionId, reason, context);
  }

  @Mutation(() => [OfflineEventAttendanceSubmission], { name: 'rejectOfflineEventAttendanceSubmissions' })
  @RequirePermissions(Permission.EventAttendance.Update)
  async rejectOfflineEventAttendanceSubmissions(
    @Args('submissionIds', { type: () => [String] }) submissionIds: string[],
    @Args('reason', { type: () => String, nullable: true }) reason: string | null | undefined,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission[]> {
    const normalizedIds = this.normalizeSubmissionBatch(submissionIds);
    const results: OfflineEventAttendanceSubmission[] = [];
    for (const submissionId of normalizedIds) {
      results.push(await this.rejectOfflineEventAttendanceSubmissionById(submissionId, reason, context));
    }

    return results;
  }

  private async rejectOfflineEventAttendanceSubmissionById(
    submissionId: string,
    reason: string | null | undefined,
    context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission> {
    const submission = await this.prisma.offlineEventAttendanceSubmission.findUnique({
      where: {
        id: submissionId,
      },
      select: {
        id: true,
        eventId: true,
        status: true,
      },
    });
    if (!submission) {
      throw new NotFoundException(`Offline attendance submission ${submissionId} was not found.`);
    }
    if (submission.status !== 'PENDING') {
      throw new ConflictException('Esta presença off-line já foi revisada.');
    }

    await this.frozenResources.assertEventMutable(submission.eventId, this.getUser(context), 'edit');
    await this.prisma.offlineEventAttendanceSubmission.update({
      where: {
        id: submission.id,
      },
      data: {
        status: 'REJECTED',
        rejectedAt: new Date(),
        rejectedById: this.getActorId(context),
        rejectionReason: reason?.trim() || undefined,
      },
    });

    await this.auditLog.record({
      entityType: AuditLogEntityType.EVENT_ATTENDANCE,
      entityId: `offline:${submission.id}`,
      entityLabel: submission.id,
      operation: AuditLogOperation.UPDATE,
      actor: this.getUser(context),
      after: {
        status: 'REJECTED',
        rejectionReason: reason?.trim() || null,
      },
      scope: {
        permission: Permission.EventAttendance.Update,
        eventId: submission.eventId,
      },
      summary: 'Presença off-line rejeitada pelo painel administrativo.',
    });

    await this.dashboardInsights.invalidateCachedInsights();
    return this.getOfflineSubmissionForResponse(submission.id);
  }

  private normalizeSubmissionBatch(submissionIds: readonly string[]): string[] {
    const normalizedIds = [...new Set(submissionIds.map((id) => id.trim()).filter(Boolean))];
    if (normalizedIds.length === 0) {
      throw new BadRequestException('Selecione ao menos uma presença off-line para revisar.');
    }

    if (normalizedIds.length > MAX_OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE) {
      throw new BadRequestException(
        `Revise no máximo ${MAX_OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE} presenças off-line por lote.`,
      );
    }

    return normalizedIds;
  }


  @Mutation(() => EventAttendance, { name: 'updateEventAttendance' })
  @RequirePermissions(Permission.EventAttendance.Update)
  async updateEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('input', { type: () => EventAttendanceUpdateInput })
    input: EventAttendanceUpdateInput,
    @Context() context?: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'edit');
    return this.prisma.$transaction(async (tx) => {
      const previousAttendance = await tx.eventAttendance.findUnique({
        where: { personId_eventId: { personId, eventId } },
        select: EVENT_ATTENDANCE_AUDIT_SELECT,
      });
      if (!previousAttendance) throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
      await tx.eventAttendance.update({
        where: { personId_eventId: { personId, eventId } },
        data: this.buildEventAttendanceUpdateData(input),
      });
      await this.attendanceCategories.refreshForAttendance(personId, eventId, tx);
      const auditAttendance = await tx.eventAttendance.findUniqueOrThrow({
        where: { personId_eventId: { personId, eventId } },
        select: EVENT_ATTENDANCE_AUDIT_SELECT,
      });
      const attendance = await tx.eventAttendance.findUniqueOrThrow({
        where: { personId_eventId: { personId, eventId } },
        select: {
          personId: true,
          eventId: true,
          attendedAt: true,
          createdAt: true,
          createdById: true,
          createdByMethod: true,
          category: true,
          person: true,
          event: { select: EVENT_RELATION_SELECT },
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: this.auditLog.buildCompositeEntityId([personId, eventId]),
          entityLabel: attendance.person?.name ?? personId,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: previousAttendance,
          after: auditAttendance,
          scope: { permission: Permission.EventAttendance.Update, eventId },
          summary: 'Presença atualizada.',
        },
        tx,
      );
      return attendance;
    });
  }

  private buildEventAttendanceUpdateData(
    input: EventAttendanceUpdateInput,
  ): Prisma.EventAttendanceUncheckedUpdateManyInput {
    const data: Prisma.EventAttendanceUncheckedUpdateManyInput = {};

    if (input.attendedAt !== undefined) data.attendedAt = input.attendedAt;

    return data;
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventAttendance' })
  @RequirePermissions(Permission.EventAttendance.Delete)
  async deleteEventAttendance(
    @Args('personId', { type: () => String }) personId: string,
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context?: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'delete');
    await this.prisma.$transaction(async (tx) => {
      const previousAttendance = await tx.eventAttendance.findUnique({
        where: { personId_eventId: { personId, eventId } },
      });
      if (!previousAttendance) throw new NotFoundException(`Attendance ${personId}/${eventId} was not found.`);
      await tx.eventAttendance.delete({ where: { personId_eventId: { personId, eventId } } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: this.auditLog.buildCompositeEntityId([personId, eventId]),
          entityLabel: personId,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: previousAttendance,
          after: {},
          scope: { permission: Permission.EventAttendance.Delete, eventId },
          summary: 'Presença removida.',
          force: true,
        },
        tx,
      );
    });

    return {
      deleted: true,
      personId,
      eventId,
    };
  }

  private async resolveOfflineSubmissionPerson(submission: {
    createdByMethod: AttendanceCreationMethod;
    scannerCode: string | null;
    manualValue: string | null;
  }): Promise<string> {
    switch (submission.createdByMethod) {
      case AttendanceCreationMethod.SCANNER: {
        const userId = submission.scannerCode ? this.parseUserAztecCode(submission.scannerCode) : null;
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

        return person.id;
      }
      case AttendanceCreationMethod.MANUAL_INPUT:
        return (await this.findSinglePersonForManualInput(submission.manualValue ?? '')).id;
      default:
        throw new BadRequestException('Origem da presença off-line incompatível.');
    }
  }

  private async getOfflineSubmissionForResponse(submissionId: string): Promise<OfflineEventAttendanceSubmission> {
    const submission = await this.prisma.offlineEventAttendanceSubmission.findUniqueOrThrow({
      where: {
        id: submissionId,
      },
      include: {
        event: true,
        person: true,
      },
    });

    const actorIds = [
      submission.submittedById,
      submission.committedById,
      submission.rejectedById,
    ].filter((id): id is string => Boolean(id));
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: {
            id: {
              in: actorIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : [];
    const actorNameById = new Map(actors.map((actor) => [actor.id, actor.name]));

    return {
      ...submission,
      event: submission.event ?? undefined,
      personId: submission.personId ?? undefined,
      person: submission.person ?? undefined,
      scannerCode: submission.scannerCode ?? undefined,
      manualValue: submission.manualValue ?? undefined,
      authorUserId: submission.authorUserId ?? undefined,
      authorName: submission.authorName ?? undefined,
      authorEmail: submission.authorEmail ?? undefined,
      submittedByFullName: actorNameById.get(submission.submittedById),
      stagedReason: submission.stagedReason ?? undefined,
      resolutionError: submission.resolutionError ?? undefined,
      collectedLatitude: submission.collectedLatitude ?? undefined,
      collectedLongitude: submission.collectedLongitude ?? undefined,
      collectedAccuracyMeters: submission.collectedAccuracyMeters ?? undefined,
      committedAt: submission.committedAt ?? undefined,
      committedById: submission.committedById ?? undefined,
      committedByFullName: submission.committedById ? actorNameById.get(submission.committedById) : undefined,
      rejectedAt: submission.rejectedAt ?? undefined,
      rejectedById: submission.rejectedById ?? undefined,
      rejectedByFullName: submission.rejectedById ? actorNameById.get(submission.rejectedById) : undefined,
      rejectionReason: submission.rejectionReason ?? undefined,
    };
  }

  private getUser(context: GraphqlContext | undefined) {
    return context?.req?.user ?? context?.request?.user;
  }

  private async recordAttendanceCreate(
    attendance: {
      personId: string;
      eventId: string;
      person?: { name?: string | null } | null;
    },
    context: GraphqlContext,
    summary: string,
    prisma: PrismaService | Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await this.auditLog.record({
      entityType: AuditLogEntityType.EVENT_ATTENDANCE,
      entityId: this.auditLog.buildCompositeEntityId([attendance.personId, attendance.eventId]),
      entityLabel: attendance.person?.name ?? attendance.personId,
      operation: AuditLogOperation.CREATE,
      actor: this.getUser(context),
      after: attendance,
      scope: {
        permission: Permission.EventAttendance.Collect,
        eventId: attendance.eventId,
      },
      summary,
    }, prisma);
  }
}
