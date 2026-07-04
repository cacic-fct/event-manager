import {
  CommitOfflineEventAttendancesInput,
  EventAttendance,
  EventAttendanceManualInput,
  EventAttendanceScannerCodeInput,
  EventAttendanceScannerFeedItem,
  OfflineEventAttendanceCommitResult,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceCreationMethod } from '@prisma/client';
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
import { recordAttendanceCreate } from './attendance-collection-audit';
import {
  findCurrentUserAttendanceCollectionEvents,
  requireAttendanceCollector,
} from './attendance-collection-events';
import { getAttendanceScannerFeed } from './attendance-collection-feed';
import { OfflineAttendanceCommitter } from './attendance-collection-offline-commit';
import {
  createAttendance,
  findSinglePersonForManualInput,
} from './attendance-collection-records';
import {
  getActorId,
  getAuthenticatedUser,
  parseUserAztecCode,
} from './attendance-collection-context';

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
  ) {}

  @Query(() => [CurrentUserAttendanceCollectionEvent], {
    name: 'currentUserAttendanceCollectionEvents',
  })
  async currentUserAttendanceCollectionEvents(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserAttendanceCollectionEvent[]> {
    return findCurrentUserAttendanceCollectionEvents(this.collectionDeps, context);
  }

  @Query(() => [EventAttendanceScannerFeedItem], { name: 'currentUserAttendanceCollectionFeed' })
  async currentUserAttendanceCollectionFeed(
    @Args('eventId', { type: () => String }) eventId: string,
    @Context() context: GraphqlContext,
  ): Promise<EventAttendanceScannerFeedItem[]> {
    await this.requireCollector(eventId, context, true);
    return getAttendanceScannerFeed(this.prisma, eventId);
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
    });
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
}
