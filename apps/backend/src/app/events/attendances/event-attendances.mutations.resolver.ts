import {
  DeletionResult,
  EventAttendance,
  EventAttendanceCreateInput,
  EventAttendanceManualInput,
  AdminEventOralAttendanceInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceUpdateInput,
  OfflineEventAttendanceSubmission,
  OfflineEventAttendanceReviewResult,
  OfflineEventAttendanceSubmissionUpdateInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, ConflictException, HttpException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserContextService } from '../../current-user/context.service';
import { recordAttendanceSet as recordSharedAttendanceSet } from '../../current-user/events/attendance-collection-audit';
import { normalizeOptionalString } from '../../current-user/events/attendance-collection-context';
import { AttendanceCategoryService } from '../attendance-category.service';
import { EventAttendancesResolverBase, EVENT_RELATION_SELECT, GraphqlContext } from './event-attendances.shared';
import {
  mapOfflineSubmissionForResponse,
  offlineSubmissionActorIds,
  offlineSubmissionActorNameMap,
} from './offline-submission-response';
import { errorMessage } from './offline-attendance-resolution';
import { parseStoredScannerUserId, scannerUserIdForStorage } from './user-scanner-code';
import {
  notifySportsMatchAttendanceMutation,
  startSportsMatchCheckInFromAthleteAttendance,
} from '../../sports/operations/sports-match-attendance';
import { SportsMutationEventsService } from '../../sports/realtime/sports-mutation-events.service';
import { verifyOfflineAttendanceCollectorCredential } from '../../current-user/events/offline-attendance-collector-credential';
import { issueOfflineAttendanceCollectorCredential } from '../../current-user/events/offline-attendance-collector-credential';
import { buildOfflineOralAttendanceReceiptMarker } from '../../current-user/events/offline-attendance-receipt';
import { lockOfflineCommand } from '../../current-user/events/offline-command-lock';

const EVENT_ATTENDANCE_AUDIT_SELECT = {
  personId: true,
  eventId: true,
  attendedAt: true,
  createdAt: true,
  createdById: true,
  committedById: true,
  createdByMethod: true,
  category: true,
  status: true,
  collectedLatitude: true,
  collectedLongitude: true,
  collectedAccuracyMeters: true,
} satisfies Prisma.EventAttendanceSelect;

const MAX_OFFLINE_ATTENDANCE_REVIEW_BATCH_SIZE = 1000;
const ORAL_ATTENDANCE_TRANSACTION_BATCH_SIZE = 100;

type EventAttendanceAuditRecord = Prisma.EventAttendanceGetPayload<{
  select: typeof EVENT_ATTENDANCE_AUDIT_SELECT;
}>;

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
    private readonly authorizationPolicy: AuthorizationPolicyService = {
      assertPermissions: async () => undefined,
    } as unknown as AuthorizationPolicyService,
    private readonly currentUserContext: CurrentUserContextService = {
      getAuthenticatedUser: () => undefined,
    } as unknown as CurrentUserContextService,
    sportsMutationEvents: SportsMutationEventsService = {
      publishAttendanceMutation: async () => undefined,
    } as unknown as SportsMutationEventsService,
  ) {
    super(prisma, attendanceCategories, sportsMutationEvents);
  }

  @Mutation(() => String, { name: 'createAdminOfflineAttendanceCollectorCredential' })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async createAdminOfflineAttendanceCollectorCredential(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<string> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const actorId = this.getUser(context)?.sub;
    if (!actorId) {
      throw new BadRequestException('Usuário autenticado sem identificador de conta.');
    }
    await this.authorizationPolicy.assertPermissions(this.getUser(context), [Permission.EventAttendance.Collect], {
      eventId,
    });
    return issueOfflineAttendanceCollectorCredential({
      eventId,
      collectorPersonId: person.id,
      collectorUserId: actorId,
    });
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
    return this.createAttendanceWithMetadata(
      {
        eventId: input.eventId,
        personId: input.personId,
        attendedAt: input.attendedAt,
        createdById,
        committedById: createdById,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
      },
      (attendance, tx) =>
        this.recordAttendanceCreate(
          attendance,
          context,
          'Presença registrada manualmente pelo painel administrativo.',
          tx,
        ),
    );
  }

  @Mutation(() => EventAttendance, { name: 'setEventOralAttendance' })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async setEventOralAttendance(
    @Args('input', { type: () => AdminEventOralAttendanceInput })
    input: AdminEventOralAttendanceInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventMutable(input.eventId, this.getUser(context), 'edit');
    const actorId = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
    const collectedByUserId = input.collectedByUserId ?? actorId;
    const existingReceipt = input.clientId && this.prisma.offlineEventAttendanceSubmission
      ? await this.prisma.offlineEventAttendanceSubmission.findUnique({
          where: { clientId: input.clientId },
          select: { status: true, rejectionReason: true },
        })
      : null;
    if (existingReceipt?.status === 'COMMITTED') {
      if (existingReceipt.rejectionReason !== buildOfflineOralAttendanceReceiptMarker(input)) {
        throw new ConflictException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
      }
      const existing = await this.prisma.eventAttendance.findUnique({
        where: { personId_eventId: { personId: input.personId, eventId: input.eventId } },
      });
      if (existing) {
        return existing;
      }
    }
    this.assertAdminOralCollectorProvenance(input, actorId, collectedByUserId);
    let checkInStarted = false;
    const attendance = await this.prisma.$transaction(async (tx) => {
      await lockOfflineCommand(tx, input.clientId);
      if (input.clientId && tx.offlineEventAttendanceSubmission) {
        const receipt = await tx.offlineEventAttendanceSubmission.findUnique({
          where: { clientId: input.clientId },
          select: { status: true, rejectionReason: true },
        });
        if (receipt?.status === 'COMMITTED') {
          if (receipt.rejectionReason !== buildOfflineOralAttendanceReceiptMarker(input)) {
            throw new ConflictException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
          }
          const existing = await tx.eventAttendance.findUnique({
            where: { personId_eventId: { personId: input.personId, eventId: input.eventId } },
          });
          if (existing) {
            return existing;
          }
        }
      }
      const before = await tx.eventAttendance.findUnique({
        where: { personId_eventId: { personId: input.personId, eventId: input.eventId } },
        select: EVENT_ATTENDANCE_AUDIT_SELECT,
      });
      const result = await tx.eventAttendance.upsert({
        where: { personId_eventId: { personId: input.personId, eventId: input.eventId } },
        create: {
          personId: input.personId,
          eventId: input.eventId,
          status: input.status,
          attendedAt: input.collectedAt,
          createdByMethod: AttendanceCreationMethod.ORAL_CALL,
          createdById: collectedByUserId,
          committedById: actorId,
        },
        update: {
          status: input.status,
          attendedAt: input.collectedAt,
          createdByMethod: AttendanceCreationMethod.ORAL_CALL,
          createdById: collectedByUserId,
          committedById: actorId,
        },
        select: EVENT_ATTENDANCE_AUDIT_SELECT,
      });
      await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
      if (result.status === 'PRESENT') {
        checkInStarted =
          (await startSportsMatchCheckInFromAthleteAttendance({
            tx,
            eventId: result.eventId,
            personId: result.personId,
            updatedById: actorId,
          })) || checkInStarted;
      }
      await this.recordAttendanceSet(result, before, context, tx);
      await this.persistAdminOralReceipt(tx, input, actorId);
      return result;
    });
    if (checkInStarted) {
      await notifySportsMatchAttendanceMutation(this.sportsMutationEvents, attendance);
    }
    await this.dashboardInsights.invalidateCachedInsights();
    return attendance;
  }

  @Mutation(() => [EventAttendance], { name: 'setEventOralAttendances' })
  @RequirePermissions(Permission.EventAttendance.Collect)
  async setEventOralAttendances(
    @Args('inputs', { type: () => [AdminEventOralAttendanceInput] })
    inputs: AdminEventOralAttendanceInput[],
    @Context() context: GraphqlContext,
  ) {
    if (!inputs.length) {
      return [];
    }
    if (inputs.length > 1000 || inputs.some((input) => input.eventId !== inputs[0].eventId)) {
      throw new BadRequestException('Envie até 1000 decisões de um único evento por sincronização.');
    }
    const eventId = inputs[0].eventId;
    await this.assertOralAttendanceAllowed(eventId);
    await this.frozenResources.assertEventMutable(eventId, this.getUser(context), 'edit');
    const actorId = context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
    const idempotentClientIds = new Set<string>();
    for (const input of inputs) {
      if (!input.clientId || !this.prisma.offlineEventAttendanceSubmission) {
        continue;
      }
      const receipt = await this.prisma.offlineEventAttendanceSubmission.findUnique({
        where: { clientId: input.clientId },
        select: { status: true, rejectionReason: true },
      });
      if (receipt?.status === 'COMMITTED' && receipt.rejectionReason !== buildOfflineOralAttendanceReceiptMarker(input)) {
        throw new ConflictException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
      }
      if (receipt?.status === 'COMMITTED') {
        idempotentClientIds.add(input.clientId);
      }
    }
    inputs.forEach((input) =>
      idempotentClientIds.has(input.clientId ?? '')
        ? undefined
        : this.assertAdminOralCollectorProvenance(input, actorId, input.collectedByUserId ?? actorId),
    );
    const attendances: EventAttendanceAuditRecord[] = [];
    let checkInStarted = false;
    for (let offset = 0; offset < inputs.length; offset += ORAL_ATTENDANCE_TRANSACTION_BATCH_SIZE) {
      const chunk = inputs.slice(offset, offset + ORAL_ATTENDANCE_TRANSACTION_BATCH_SIZE);
      const chunkAttendances = await this.prisma.$transaction(async (tx) => {
        const previousAttendances = await tx.eventAttendance.findMany({
          where: {
            eventId,
            personId: { in: [...new Set(chunk.map((input) => input.personId))] },
          },
          select: EVENT_ATTENDANCE_AUDIT_SELECT,
        });
        const beforeByPersonId = new Map(previousAttendances.map((attendance) => [attendance.personId, attendance]));
        const results: EventAttendanceAuditRecord[] = [];
        for (const clientId of [...new Set(chunk.map((input) => input.clientId).filter(Boolean))].sort()) {
          await lockOfflineCommand(tx, clientId);
        }
        for (const input of chunk) {
          if (input.clientId && tx.offlineEventAttendanceSubmission) {
            const receipt = await tx.offlineEventAttendanceSubmission.findUnique({
              where: { clientId: input.clientId },
              select: { status: true, rejectionReason: true },
            });
            if (receipt?.status === 'COMMITTED') {
              if (receipt.rejectionReason !== buildOfflineOralAttendanceReceiptMarker(input)) {
                throw new ConflictException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
              }
              const existing = await tx.eventAttendance.findUnique({
                where: { personId_eventId: { personId: input.personId, eventId } },
              });
              if (existing) {
                results.push(existing);
                continue;
              }
            }
          }
          const before = beforeByPersonId.get(input.personId) ?? null;
          const attendance = await tx.eventAttendance.upsert({
            where: { personId_eventId: { personId: input.personId, eventId } },
            create: {
              personId: input.personId,
              eventId,
              status: input.status,
              attendedAt: input.collectedAt,
              createdByMethod: AttendanceCreationMethod.ORAL_CALL,
              createdById: input.collectedByUserId ?? actorId,
              committedById: actorId,
            },
            update: {
              status: input.status,
              attendedAt: input.collectedAt,
              createdByMethod: AttendanceCreationMethod.ORAL_CALL,
              createdById: input.collectedByUserId ?? actorId,
              committedById: actorId,
            },
            select: EVENT_ATTENDANCE_AUDIT_SELECT,
          });
          await this.attendanceCategories.refreshForAttendance(input.personId, eventId, tx);
          if (attendance.status === 'PRESENT') {
            checkInStarted =
              (await startSportsMatchCheckInFromAthleteAttendance({
                tx,
                eventId,
                personId: attendance.personId,
                updatedById: actorId,
              })) || checkInStarted;
          }
          await this.recordAttendanceSet(attendance, before, context, tx);
          await this.persistAdminOralReceipt(tx, input, actorId);
          beforeByPersonId.set(input.personId, attendance);
          results.push(attendance);
        }
        return results;
      });
      attendances.push(...chunkAttendances);
    }
    if (checkInStarted) {
      await notifySportsMatchAttendanceMutation(this.sportsMutationEvents, { eventId });
    }
    await this.dashboardInsights.invalidateCachedInsights();
    return attendances;
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

    return this.createAttendanceWithMetadata(
      {
        eventId,
        personId: person.id,
        createdById,
        committedById: createdById,
        createdByMethod: AttendanceCreationMethod.SCANNER,
      },
      (attendance, tx) =>
        this.recordAttendanceCreate(
          attendance,
          context,
          'Presença registrada por leitura de código no painel administrativo.',
          tx,
        ),
    );
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
    const explicitPersonId = normalizeOptionalString(input.personId);
    const personId = explicitPersonId
      ? await this.resolveActiveMergedPersonId(explicitPersonId)
      : (await this.findSinglePersonForManualInput(input.value)).id;
    return this.createAttendanceWithMetadata(
      {
        eventId: input.eventId,
        personId,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        createdById: this.getActorId(context),
        committedById: this.getActorId(context),
        location: input.location,
      },
      (attendance, tx) =>
        this.recordAttendanceCreate(attendance, context, 'Presença registrada por entrada manual.', tx),
    );
  }

  @Mutation(() => OfflineEventAttendanceSubmission, { name: 'approveOfflineEventAttendanceSubmission' })
  async approveOfflineEventAttendanceSubmission(
    @Args('submissionId', { type: () => String }) submissionId: string,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission> {
    return this.approveOfflineEventAttendanceSubmissionById(submissionId, context);
  }

  @Mutation(() => [OfflineEventAttendanceReviewResult], { name: 'approveOfflineEventAttendanceSubmissions' })
  async approveOfflineEventAttendanceSubmissions(
    @Args('submissionIds', { type: () => [String] }) submissionIds: string[],
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceReviewResult[]> {
    const normalizedIds = this.normalizeSubmissionBatch(submissionIds);
    const results: OfflineEventAttendanceReviewResult[] = [];
    for (const submissionId of normalizedIds) {
      try {
        results.push({
          submissionId,
          success: true,
          submission: await this.approveOfflineEventAttendanceSubmissionById(submissionId, context),
        });
      } catch (error: unknown) {
        results.push({
          submissionId,
          success: false,
          error: errorMessage(error),
        });
      }
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

    await this.assertCanReviewOfflineSubmission(submission.eventId, context);
    await this.frozenResources.assertEventMutable(submission.eventId, this.getUser(context), 'edit');
    const personId = await this.resolveOfflineSubmissionPersonId(submission);
    const committedById = this.getActorId(context);
    let checkInStarted = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        const reviewUpdate = await tx.offlineEventAttendanceSubmission.updateMany({
          where: {
            id: submission.id,
            status: 'PENDING',
          },
          data: {
            status: 'COMMITTED',
            personId,
            committedAt: new Date(),
            committedById,
            resolutionError: null,
          },
        });
        if (reviewUpdate.count !== 1) {
          throw new ConflictException('Esta presença off-line já foi revisada.');
        }

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
        checkInStarted = await startSportsMatchCheckInFromAthleteAttendance({
          tx,
          eventId: submission.eventId,
          personId,
          updatedById: committedById,
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

    if (checkInStarted) {
      await notifySportsMatchAttendanceMutation(this.sportsMutationEvents, { eventId: submission.eventId });
    }

    await this.dashboardInsights.invalidateCachedInsights();
    return this.getOfflineSubmissionForResponse(submission.id);
  }

  @Mutation(() => OfflineEventAttendanceSubmission, { name: 'rejectOfflineEventAttendanceSubmission' })
  async rejectOfflineEventAttendanceSubmission(
    @Args('submissionId', { type: () => String }) submissionId: string,
    @Args('reason', { type: () => String, nullable: true }) reason: string | null | undefined,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceSubmission> {
    return this.rejectOfflineEventAttendanceSubmissionById(submissionId, reason, context);
  }

  @Mutation(() => [OfflineEventAttendanceReviewResult], { name: 'rejectOfflineEventAttendanceSubmissions' })
  async rejectOfflineEventAttendanceSubmissions(
    @Args('submissionIds', { type: () => [String] }) submissionIds: string[],
    @Args('reason', { type: () => String, nullable: true }) reason: string | null | undefined,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceReviewResult[]> {
    const normalizedIds = this.normalizeSubmissionBatch(submissionIds);
    const results: OfflineEventAttendanceReviewResult[] = [];
    for (const submissionId of normalizedIds) {
      try {
        results.push({
          submissionId,
          success: true,
          submission: await this.rejectOfflineEventAttendanceSubmissionById(submissionId, reason, context),
        });
      } catch (error: unknown) {
        results.push({
          submissionId,
          success: false,
          error: errorMessage(error),
        });
      }
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

    await this.assertCanReviewOfflineSubmission(submission.eventId, context);
    await this.frozenResources.assertEventMutable(submission.eventId, this.getUser(context), 'edit');
    await this.prisma.$transaction(async (tx) => {
      const reviewUpdate = await tx.offlineEventAttendanceSubmission.updateMany({
        where: {
          id: submission.id,
          status: 'PENDING',
        },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectedById: this.getActorId(context),
          rejectionReason: reason?.trim() || undefined,
        },
      });
      if (reviewUpdate.count !== 1) {
        throw new ConflictException('Esta presença off-line já foi revisada.');
      }

      await this.auditLog.record(
        {
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
        },
        tx,
      );
    });

    await this.dashboardInsights.invalidateCachedInsights();
    return this.getOfflineSubmissionForResponse(submission.id);
  }

  @Mutation(() => OfflineEventAttendanceSubmission, { name: 'updateOfflineEventAttendanceSubmission' })
  async updateOfflineEventAttendanceSubmission(
    @Args('submissionId', { type: () => String }) submissionId: string,
    @Args('input', { type: () => OfflineEventAttendanceSubmissionUpdateInput })
    input: OfflineEventAttendanceSubmissionUpdateInput,
    @Context() context: GraphqlContext,
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

    await this.assertCanReviewOfflineSubmission(submission.eventId, context);
    await this.frozenResources.assertEventMutable(submission.eventId, this.getUser(context), 'edit');
    const data = await this.buildOfflineSubmissionCorrectionData(submission, input);

    await this.prisma.$transaction(async (tx) => {
      const reviewUpdate = await tx.offlineEventAttendanceSubmission.updateMany({
        where: {
          id: submission.id,
          status: 'PENDING',
        },
        data,
      });
      if (reviewUpdate.count !== 1) {
        throw new ConflictException('Esta presença off-line já foi revisada.');
      }

      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_ATTENDANCE,
          entityId: `offline:${submission.id}`,
          entityLabel: submission.id,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: {
            personId: submission.personId,
            createdByMethod: submission.createdByMethod,
            scannerCode: submission.scannerCode,
            manualValue: submission.manualValue,
            resolutionError: submission.resolutionError,
          },
          after: data,
          scope: {
            permission: Permission.EventAttendance.Update,
            eventId: submission.eventId,
          },
          summary: 'Presença off-line corrigida pelo painel administrativo.',
        },
        tx,
      );
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

  private async resolveOfflineSubmissionPersonId(submission: {
    personId: string | null;
    createdByMethod: AttendanceCreationMethod;
    scannerCode: string | null;
    manualValue: string | null;
  }): Promise<string> {
    const personId = submission.personId ?? (await this.resolveOfflineSubmissionPerson(submission));
    return this.resolveMergedPersonId(personId);
  }

  private async buildOfflineSubmissionCorrectionData(
    submission: {
      personId: string | null;
      createdByMethod: AttendanceCreationMethod;
      scannerCode: string | null;
      manualValue: string | null;
    },
    input: OfflineEventAttendanceSubmissionUpdateInput,
  ): Promise<Prisma.OfflineEventAttendanceSubmissionUncheckedUpdateManyInput> {
    const createdByMethod = (input.createdByMethod ?? submission.createdByMethod) as AttendanceCreationMethod;
    const scannerCode =
      createdByMethod === AttendanceCreationMethod.SCANNER
        ? this.scannerCodeForOfflineCorrection(input.scannerCode, submission.scannerCode)
        : null;
    const manualValue =
      createdByMethod === AttendanceCreationMethod.MANUAL_INPUT
        ? (normalizeOptionalString(input.manualValue ?? submission.manualValue) ?? null)
        : null;
    const explicitPersonId = normalizeOptionalString(input.personId);

    if (explicitPersonId) {
      try {
        return {
          createdByMethod,
          scannerCode,
          manualValue,
          personId: await this.resolveActiveMergedPersonId(explicitPersonId),
          stagedReason: null,
          resolutionError: null,
        };
      } catch (error: unknown) {
        if (!(error instanceof HttpException) || ![400, 404, 409].includes(error.getStatus())) {
          throw error;
        }

        return {
          createdByMethod,
          scannerCode,
          manualValue,
          personId: null,
          resolutionError: errorMessage(error),
        };
      }
    }

    try {
      const personId = await this.resolveOfflineSubmissionPerson({
        createdByMethod,
        scannerCode,
        manualValue,
      });
      return {
        createdByMethod,
        scannerCode,
        manualValue,
        personId: await this.resolveActiveMergedPersonId(personId),
        stagedReason: null,
        resolutionError: null,
      };
    } catch (error: unknown) {
      if (!(error instanceof HttpException) || ![400, 404, 409].includes(error.getStatus())) {
        throw error;
      }

      return {
        createdByMethod,
        scannerCode,
        manualValue,
        personId: null,
        resolutionError: errorMessage(error),
      };
    }
  }

  private async resolveOfflineSubmissionPerson(submission: {
    createdByMethod: AttendanceCreationMethod;
    scannerCode: string | null;
    manualValue: string | null;
  }): Promise<string> {
    switch (submission.createdByMethod) {
      case AttendanceCreationMethod.SCANNER: {
        const userId = submission.scannerCode ? parseStoredScannerUserId(submission.scannerCode) : null;
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

  private scannerCodeForOfflineCorrection(
    inputScannerCode: string | null | undefined,
    storedScannerCode: string | null,
  ): string | null {
    if (inputScannerCode !== undefined) {
      return scannerUserIdForStorage(inputScannerCode);
    }

    return storedScannerCode ? parseStoredScannerUserId(storedScannerCode) : null;
  }

  private async resolveMergedPersonId(personId: string): Promise<string> {
    const person = await this.prisma.people.findUnique({
      where: {
        id: personId,
      },
      select: {
        id: true,
        mergedIntoId: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person ${personId} was not found.`);
    }

    return person.mergedIntoId ?? person.id;
  }

  private async resolveActiveMergedPersonId(personId: string): Promise<string> {
    const resolvedPersonId = await this.resolveMergedPersonId(personId);
    const person = await this.prisma.people.findFirst({
      where: {
        id: resolvedPersonId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });
    if (!person) {
      throw new NotFoundException(`Person ${personId} was not found.`);
    }

    return person.id;
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

    const actorIds = offlineSubmissionActorIds([submission]);
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
    const actorNameById = offlineSubmissionActorNameMap(actors);

    return mapOfflineSubmissionForResponse(submission, actorNameById);
  }

  private async assertCanReviewOfflineSubmission(eventId: string, context: GraphqlContext): Promise<void> {
    await this.authorizationPolicy.assertPermissions(this.getUser(context), [Permission.EventAttendance.Update], {
      eventId,
    });
  }

  private async assertOralAttendanceAllowed(eventId: string): Promise<void> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { shouldAllowOralAttendance: true },
    });
    if (!event?.shouldAllowOralAttendance) {
      throw new BadRequestException('A chamada oral não está habilitada para este evento.');
    }
  }

  private assertAdminOralCollectorProvenance(
    input: AdminEventOralAttendanceInput,
    actorId: string | undefined,
    collectedByUserId: string | undefined,
  ): void {
    if (!actorId || !collectedByUserId || collectedByUserId === actorId) {
      return;
    }
    try {
      const credential = input.collectorCredential
        ? verifyOfflineAttendanceCollectorCredential(input.collectorCredential, input.collectedAt)
        : null;
      if (
        !credential ||
        credential.eventId !== input.eventId ||
        credential.collectorUserId !== collectedByUserId
      ) {
        throw new BadRequestException('A credencial assinada do coletor off-line não corresponde à decisão.');
      }
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('A credencial assinada do coletor off-line é inválida ou expirou.');
    }
  }

  private async persistAdminOralReceipt(
    tx: Prisma.TransactionClient,
    input: AdminEventOralAttendanceInput,
    submittedById: string | undefined,
  ): Promise<void> {
    if (!input.clientId || !submittedById || !tx.offlineEventAttendanceSubmission) {
      return;
    }
    await tx.offlineEventAttendanceSubmission.upsert({
      where: { clientId: input.clientId },
      create: {
        clientId: input.clientId,
        eventId: input.eventId,
        personId: input.personId,
        createdByMethod: AttendanceCreationMethod.ORAL_CALL,
        collectedAt: input.collectedAt,
        authorUserId: input.collectedByUserId ?? submittedById,
        submittedById,
        status: 'COMMITTED',
        committedAt: new Date(),
        committedById: submittedById,
        rejectionReason: buildOfflineOralAttendanceReceiptMarker(input),
      },
      update: {
        status: 'COMMITTED',
        rejectionReason: buildOfflineOralAttendanceReceiptMarker(input),
      },
    });
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
    await this.auditLog.record(
      {
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
      },
      prisma,
    );
  }

  private async recordAttendanceSet(
    attendance: Prisma.EventAttendanceGetPayload<{ select: typeof EVENT_ATTENDANCE_AUDIT_SELECT }>,
    before: Prisma.EventAttendanceGetPayload<{ select: typeof EVENT_ATTENDANCE_AUDIT_SELECT }> | null,
    context: GraphqlContext,
    prisma: Prisma.TransactionClient,
  ): Promise<void> {
    await recordSharedAttendanceSet({
      auditLog: this.auditLog,
      currentUserContext: this.currentUserContext,
      context,
      attendance,
      before,
      prisma,
      createOperation: AuditLogOperation.CREATE,
      summary:
        attendance.status === 'ABSENT'
          ? 'Ausência explícita registrada pela chamada oral administrativa.'
          : 'Presença registrada pela chamada oral administrativa.',
    });
  }
}
