import {
  CommitOfflineEventAttendancesInput,
  EventAttendance,
  EventAttendanceManualInput,
  EventOralAttendanceInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceScannerFeedItem,
  OfflineEventAttendanceCommitResult,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod, EventAttendanceStatus, Prisma } from '@prisma/client';
import { CurrentUserAttendanceCollectionEvent } from '../models';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { PrismaService } from '../../prisma/prisma.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { DashboardInsightsService } from '../../dashboard/insights.service';
import { NovuNotificationsService } from '../../notifications/novu-notifications.service';
import { recordAttendanceCreate, recordAttendanceSet } from './attendance-collection-audit';
import { findCurrentUserAttendanceCollectionEvents, requireAttendanceCollector } from './attendance-collection-events';
import {
  findAttendanceOralRosterPersonIds,
  getAttendanceOralRoster,
  getAttendanceScannerFeed,
  isOnAttendanceOralRoster,
} from './attendance-collection-feed';
import { OfflineAttendanceCommitter } from './attendance-collection-offline-commit';
import {
  createAttendance,
  findSinglePersonForManualInput,
  getRequiredAttendanceLocationData,
} from './attendance-collection-records';
import { getActorId, getAuthenticatedUser, parseUserAztecCode } from './attendance-collection-context';
import {
  notifySportsMatchAttendanceMutation,
  startSportsMatchCheckInFromAthleteAttendance,
} from '../../sports/operations/sports-match-attendance';
import { issueOfflineAttendanceCollectorCredential } from './offline-attendance-collector-credential';
import { verifyOfflineAttendanceCollectorCredential } from './offline-attendance-collector-credential';
import { buildOfflineOralAttendanceReceiptMarker } from './offline-attendance-receipt';
import { lockOfflineCommand } from './offline-command-lock';
import { SportsMutationEventsService } from '../../sports/realtime/sports-mutation-events.service';

@Resolver(() => CurrentUserAttendanceCollectionEvent)
export class CurrentUserAttendanceCollectionResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly currentUserContext: CurrentUserContextService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly frozenResources: FrozenResourceService = {
      assertEventMutable: async () => undefined,
    } as unknown as FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService = {
      assertAttendanceCollectorForEvent: async () => undefined,
      assertPermissions: async () => undefined,
      accessibleEventTargets: async () => ({
        eventIds: new Set(),
        majorEventIds: new Set(),
        eventGroupIds: new Set(),
      }),
    } as unknown as AuthorizationPolicyService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
      buildCompositeEntityId: (parts: readonly string[]) => parts.join(':'),
    } as unknown as AuditLogService,
    private readonly dashboardInsights: DashboardInsightsService = {
      invalidateCachedInsights: async () => undefined,
    } as unknown as DashboardInsightsService,
    private readonly notifications: NovuNotificationsService = {
      notifyOfflineAttendanceReviewQueued: async () => undefined,
      mapUserToRecipient: (user: { id: string; email: string; name: string }) => ({
        subscriberId: user.id,
        email: user.email,
      }),
    } as unknown as NovuNotificationsService,
    private readonly sportsMutationEvents: SportsMutationEventsService = {
      publishAttendanceMutation: async () => undefined,
    } as unknown as SportsMutationEventsService,
  ) {}

  @Query(() => [CurrentUserAttendanceCollectionEvent], {
    name: 'currentUserAttendanceCollectionEvents',
  })
  async currentUserAttendanceCollectionEvents(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserAttendanceCollectionEvent[]> {
    const events = await findCurrentUserAttendanceCollectionEvents(this.collectionDeps, context);
    const person = await this.currentUserContext.requireCurrentPerson(context);
    const user = getAuthenticatedUser(this.currentUserContext, context);
    const collectorUserId = user?.sub;
    if (!collectorUserId) {
      return events;
    }
    return events.map((event) => {
      const result = { ...event } as CurrentUserAttendanceCollectionEvent;
      Object.defineProperty(result, 'offlineCollectorCredential', {
        value: issueOfflineAttendanceCollectorCredential({
          eventId: event.eventId,
          collectorPersonId: person.id,
          collectorUserId,
        }),
        enumerable: false,
      });
      return result;
    });
  }

  @Query(() => [EventAttendanceScannerFeedItem], { name: 'currentUserAttendanceCollectionFeed' })
  async currentUserAttendanceCollectionFeed(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventAttendanceScannerFeedItem[]> {
    await this.requireCollector(eventId, context, true);
    return getAttendanceScannerFeed(this.prisma, eventId);
  }

  @Query(() => [EventAttendanceScannerFeedItem], { name: 'currentUserAttendanceOralRoster' })
  async currentUserAttendanceOralRoster(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventAttendanceScannerFeedItem[]> {
    await this.requireCollector(eventId, context, true);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { shouldAllowOralAttendance: true },
    });
    if (!event?.shouldAllowOralAttendance) {
      throw new BadRequestException('A chamada oral não está habilitada para este evento.');
    }
    return getAttendanceOralRoster(this.prisma, eventId);
  }

  @Mutation(() => EventAttendance, { name: 'collectCurrentUserAttendanceFromScannerCode' })
  async collectCurrentUserAttendanceFromScannerCode(
    @Args('input', { type: () => EventAttendanceScannerCodeInput })
    input: EventAttendanceScannerCodeInput,
    @Context() context: GraphqlContext,
  ) {
    const collector = await this.requireCollector(input.eventId, context, true);
    await this.frozenResources.assertEventMutable(
      input.eventId,
      getAuthenticatedUser(this.currentUserContext, context),
      'edit',
    );
    const userId = parseUserAztecCode(input.code);
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

    return createAttendance({
      prisma: this.prisma,
      attendanceCategories: this.attendanceCategories,
      input: {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.SCANNER,
        createdById: getActorId(context) ?? collector.userId ?? undefined,
        committedById: getActorId(context) ?? collector.userId ?? undefined,
        location: input.location,
      },
      afterCreate: (attendance, tx) =>
        recordAttendanceCreate({
          auditLog: this.auditLog,
          currentUserContext: this.currentUserContext,
          context,
          attendance,
          summary: 'Presença registrada pelo coletor via scanner.',
          prisma: tx,
        }),
      afterCheckInStarted: (attendance) => notifySportsMatchAttendanceMutation(this.sportsMutationEvents, attendance),
    });
  }

  @Mutation(() => EventAttendance, { name: 'collectCurrentUserManualAttendance' })
  async collectCurrentUserManualAttendance(
    @Args('input', { type: () => EventAttendanceManualInput })
    input: EventAttendanceManualInput,
    @Context() context: GraphqlContext,
  ) {
    const collector = await this.requireCollector(input.eventId, context, true);
    await this.frozenResources.assertEventMutable(
      input.eventId,
      getAuthenticatedUser(this.currentUserContext, context),
      'edit',
    );
    const person = await findSinglePersonForManualInput(this.prisma, input.value);
    return createAttendance({
      prisma: this.prisma,
      attendanceCategories: this.attendanceCategories,
      input: {
        eventId: input.eventId,
        personId: person.id,
        createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
        createdById: getActorId(context) ?? collector.userId ?? undefined,
        committedById: getActorId(context) ?? collector.userId ?? undefined,
        location: input.location,
      },
      afterCreate: (attendance, tx) =>
        recordAttendanceCreate({
          auditLog: this.auditLog,
          currentUserContext: this.currentUserContext,
          context,
          attendance,
          summary: 'Presença registrada pelo coletor manualmente.',
          prisma: tx,
        }),
      afterCheckInStarted: (attendance) => notifySportsMatchAttendanceMutation(this.sportsMutationEvents, attendance),
    });
  }

  @Mutation(() => EventAttendance, { name: 'collectCurrentUserOralAttendance' })
  async collectCurrentUserOralAttendance(
    @Args('input', { type: () => EventOralAttendanceInput })
    input: EventOralAttendanceInput,
    @Context() context: GraphqlContext,
  ) {
    const collector = await this.requireCollector(input.eventId, context, true);
    const event = await this.prisma.event.findUnique({
      where: { id: input.eventId },
      select: { shouldAllowOralAttendance: true },
    });
    if (!event?.shouldAllowOralAttendance) {
      throw new BadRequestException('A chamada oral não está habilitada para este evento.');
    }
    await this.frozenResources.assertEventMutable(
      input.eventId,
      getAuthenticatedUser(this.currentUserContext, context),
      'edit',
    );
    const subscriber = await isOnAttendanceOralRoster(this.prisma, input.eventId, input.personId);
    if (!subscriber) {
      throw new NotFoundException('Pessoa não inscrita neste evento.');
    }

    const actorId = getActorId(context) ?? collector.userId ?? undefined;
    const existingReceipt = await this.findOralReceipt(input, actorId);
    if (existingReceipt?.status === 'COMMITTED') {
      if (existingReceipt.rejectionReason !== buildOfflineOralAttendanceReceiptMarker(input)) {
        throw new BadRequestException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
      }
      const existing = await this.prisma.eventAttendance.findUnique({
        where: { personId_eventId: { personId: input.personId, eventId: input.eventId } },
      });
      if (existing) {
        return existing;
      }
    }
    this.assertOralCollectorProvenance(input, actorId);
    const locationData = getRequiredAttendanceLocationData(input.location);
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
            throw new BadRequestException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
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
      });
      const result = await tx.eventAttendance.upsert({
        where: { personId_eventId: { personId: input.personId, eventId: input.eventId } },
        create: {
          personId: input.personId,
          eventId: input.eventId,
          status: input.status as EventAttendanceStatus,
          attendedAt: input.collectedAt,
          createdByMethod: AttendanceCreationMethod.ORAL_CALL,
          createdById: input.collectedByUserId,
          committedById: actorId,
          ...locationData,
        },
        update: {
          status: input.status as EventAttendanceStatus,
          attendedAt: input.collectedAt,
          createdByMethod: AttendanceCreationMethod.ORAL_CALL,
          createdById: input.collectedByUserId,
          committedById: actorId,
          ...locationData,
        },
      });
      await this.attendanceCategories.refreshForAttendance(input.personId, input.eventId, tx);
      if (result.status === EventAttendanceStatus.PRESENT) {
        checkInStarted =
          (await startSportsMatchCheckInFromAthleteAttendance({
            tx,
            eventId: result.eventId,
            personId: result.personId,
            updatedById: actorId,
          })) || checkInStarted;
      }
      await recordAttendanceSet({
        auditLog: this.auditLog,
        currentUserContext: this.currentUserContext,
        context,
        attendance: result,
        before,
        prisma: tx,
      });
      await this.persistOralReceipt(tx, input, actorId);
      return result;
    });
    if (checkInStarted) {
      await notifySportsMatchAttendanceMutation(this.sportsMutationEvents, attendance);
    }
    await this.dashboardInsights.invalidateCachedInsights();
    return attendance;
  }

  @Mutation(() => [EventAttendance], { name: 'collectCurrentUserOralAttendances' })
  async collectCurrentUserOralAttendances(
    @Args('inputs', { type: () => [EventOralAttendanceInput] })
    inputs: EventOralAttendanceInput[],
    @Context() context: GraphqlContext,
  ) {
    if (inputs.length === 0) {
      return [];
    }
    if (inputs.length > 1000 || inputs.some((input) => input.eventId !== inputs[0].eventId)) {
      throw new BadRequestException('Envie até 1000 decisões de um único evento por sincronização.');
    }
    const eventId = inputs[0].eventId;
    const collector = await this.requireCollector(eventId, context, true);
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { shouldAllowOralAttendance: true },
    });
    if (!event?.shouldAllowOralAttendance) {
      throw new BadRequestException('A chamada oral não está habilitada para este evento.');
    }
    await this.frozenResources.assertEventMutable(
      eventId,
      getAuthenticatedUser(this.currentUserContext, context),
      'edit',
    );
    const rosterIds = await findAttendanceOralRosterPersonIds(
      this.prisma,
      eventId,
      inputs.map((input) => input.personId),
    );
    if (inputs.some((input) => !rosterIds.has(input.personId))) {
      throw new NotFoundException('Uma ou mais pessoas não estão inscritas neste evento.');
    }
    const actorId = getActorId(context) ?? collector.userId ?? undefined;
    const idempotentClientIds = new Set<string>();
    for (const input of inputs) {
      const receipt = await this.findOralReceipt(input, actorId);
      if (
        receipt?.status === 'COMMITTED' &&
        receipt.rejectionReason !== buildOfflineOralAttendanceReceiptMarker(input)
      ) {
        throw new BadRequestException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
      }
      if (receipt?.status === 'COMMITTED' && input.clientId) {
        idempotentClientIds.add(input.clientId);
      }
    }
    inputs.forEach((input) => {
      if (!input.clientId || !idempotentClientIds.has(input.clientId)) {
        this.assertOralCollectorProvenance(input, actorId);
      }
    });
    let checkInStarted = false;
    const attendances = await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const clientId of [...new Set(inputs.map((input) => input.clientId).filter(Boolean))].sort()) {
        await lockOfflineCommand(tx, clientId);
      }
      for (const input of inputs) {
        if (input.clientId && tx.offlineEventAttendanceSubmission) {
          const receipt = await tx.offlineEventAttendanceSubmission.findUnique({
            where: { clientId: input.clientId },
            select: { status: true, rejectionReason: true },
          });
          if (
            receipt?.status === 'COMMITTED' &&
            receipt.rejectionReason !== buildOfflineOralAttendanceReceiptMarker(input)
          ) {
            throw new BadRequestException('O identificador da decisão off-line foi reutilizado para outro conteúdo.');
          }
          if (
            receipt?.status === 'COMMITTED' &&
            receipt.rejectionReason === buildOfflineOralAttendanceReceiptMarker(input)
          ) {
            const existing = await tx.eventAttendance.findUnique({
              where: { personId_eventId: { personId: input.personId, eventId } },
            });
            if (existing) {
              results.push(existing);
              continue;
            }
          }
        }
        const locationData = getRequiredAttendanceLocationData(input.location);
        const data = {
          status: input.status as EventAttendanceStatus,
          attendedAt: input.collectedAt,
          createdByMethod: AttendanceCreationMethod.ORAL_CALL,
          createdById: input.collectedByUserId,
          committedById: actorId,
          ...locationData,
        };
        const before = await tx.eventAttendance.findUnique({
          where: { personId_eventId: { personId: input.personId, eventId } },
        });
        const attendance = await tx.eventAttendance.upsert({
          where: { personId_eventId: { personId: input.personId, eventId } },
          create: { personId: input.personId, eventId, ...data },
          update: data,
        });
        await this.attendanceCategories.refreshForAttendance(input.personId, eventId, tx);
        if (attendance.status === EventAttendanceStatus.PRESENT) {
          checkInStarted =
            (await startSportsMatchCheckInFromAthleteAttendance({
              tx,
              eventId,
              personId: attendance.personId,
              updatedById: actorId,
            })) || checkInStarted;
        }
        await recordAttendanceSet({
          auditLog: this.auditLog,
          currentUserContext: this.currentUserContext,
          context,
          attendance,
          before,
          prisma: tx,
        });
        await this.persistOralReceipt(tx, input, actorId);
        results.push(attendance);
      }
      return results;
    });
    if (checkInStarted) {
      await notifySportsMatchAttendanceMutation(this.sportsMutationEvents, { eventId });
    }
    await this.dashboardInsights.invalidateCachedInsights();
    return attendances;
  }

  @Mutation(() => [OfflineEventAttendanceCommitResult], { name: 'commitCurrentUserOfflineAttendances' })
  async commitCurrentUserOfflineAttendances(
    @Args('input', { type: () => CommitOfflineEventAttendancesInput })
    input: CommitOfflineEventAttendancesInput,
    @Context() context: GraphqlContext,
  ): Promise<OfflineEventAttendanceCommitResult[]> {
    return new OfflineAttendanceCommitter({
      prisma: this.prisma,
      currentUserContext: this.currentUserContext,
      attendanceCategories: this.attendanceCategories,
      frozenResources: this.frozenResources,
      authorizationPolicy: this.authorizationPolicy,
      auditLog: this.auditLog,
      dashboardInsights: this.dashboardInsights,
      notifications: this.notifications,
      sportsMutationEvents: this.sportsMutationEvents,
    }).commitBatch(input, context);
  }

  private get collectionDeps() {
    return {
      prisma: this.prisma,
      currentUserContext: this.currentUserContext,
      authorizationPolicy: this.authorizationPolicy,
    };
  }

  private async requireCollector(eventId: string, context: GraphqlContext, enforceCollectionWindow: boolean) {
    return requireAttendanceCollector(this.collectionDeps, eventId, context, enforceCollectionWindow);
  }

  private assertOralCollectorProvenance(input: EventOralAttendanceInput, actorId: string | undefined): void {
    if (!actorId) {
      throw new BadRequestException('O coletor informado deve ser o usuário autenticado.');
    }
    if (input.collectedByUserId === actorId) {
      return;
    }
    try {
      const credential = input.collectorCredential
        ? verifyOfflineAttendanceCollectorCredential(input.collectorCredential, input.collectedAt)
        : null;
      if (
        !credential ||
        credential.eventId !== input.eventId ||
        credential.collectorUserId !== input.collectedByUserId
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

  private async findOralReceipt(input: EventOralAttendanceInput, submittedById: string | undefined) {
    if (!input.clientId || !submittedById || !this.prisma.offlineEventAttendanceSubmission) {
      return null;
    }
    const receipt = await this.prisma.offlineEventAttendanceSubmission.findUnique({
      where: { clientId: input.clientId },
      select: { id: true, status: true, rejectionReason: true },
    });
    return receipt;
  }

  private async persistOralReceipt(
    tx: Prisma.TransactionClient,
    input: EventOralAttendanceInput,
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
        authorUserId: input.collectedByUserId,
        submittedById,
        status: 'COMMITTED',
        committedAt: new Date(),
        committedById: submittedById,
        collectedLatitude: input.location?.latitude,
        collectedLongitude: input.location?.longitude,
        collectedAccuracyMeters: input.location?.accuracyMeters,
        rejectionReason: buildOfflineOralAttendanceReceiptMarker(input),
      },
      update: {
        status: 'COMMITTED',
        rejectionReason: buildOfflineOralAttendanceReceiptMarker(input),
      },
    });
  }
}
