import { AttendanceReviewEventSummary, AttendanceReviewItem, EventAttendanceAnalyticsSnapshot } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { AttendanceReviewFlagStatus } from '@prisma/client';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { AllowScopedCollectionPermissions } from '../../auth/decorators/allow-scoped-collection-permissions.decorator';
import { GraphqlContext } from './event-attendances.shared';
import { AttendanceAnalyticsService } from './attendance-analytics.service';

@Resolver()
export class AttendanceAnalyticsResolver {
  constructor(private readonly analytics: AttendanceAnalyticsService) {}

  @Query(() => EventAttendanceAnalyticsSnapshot, { name: 'eventAttendanceAnalytics' })
  @RequirePermissions(Permission.EventAttendance.Read)
  eventAttendanceAnalytics(
    @Args('eventId', { type: () => String }) eventId: string,
    @Args('windowMinutes', { type: () => Int, nullable: true }) windowMinutes?: number | null,
    @Args('windowStart', { type: () => Date, nullable: true }) windowStart?: Date | null,
    @Args('windowEnd', { type: () => Date, nullable: true }) windowEnd?: Date | null,
  ): Promise<EventAttendanceAnalyticsSnapshot> {
    return this.analytics.snapshot(eventId, {
      windowMinutes: windowMinutes ?? undefined,
      start: windowStart ?? undefined,
      end: windowEnd ?? undefined,
    });
  }

  @Query(() => [AttendanceReviewEventSummary], { name: 'attendanceReviewEventSummaries' })
  @RequirePermissions(Permission.EventAttendance.Update)
  @AllowScopedCollectionPermissions()
  attendanceReviewEventSummaries(@Context() context?: GraphqlContext): Promise<AttendanceReviewEventSummary[]> {
    const user = context?.req?.user ?? context?.request?.user;
    return user ? this.analytics.pendingReviewSummaries(user) : this.analytics.pendingReviewSummaries();
  }

  @Mutation(() => AttendanceReviewItem, { name: 'reviewAttendanceFlag' })
  @RequirePermissions(Permission.EventAttendance.Update)
  reviewAttendanceFlag(
    @Args('flagId', { type: () => String }) flagId: string,
    @Args('status', { type: () => String }) status: string,
    @Args('note', { type: () => String, nullable: true }) note: string | undefined,
    @Context() context: GraphqlContext,
    @Args('eventId', { type: () => String }) eventId?: string,
  ): Promise<AttendanceReviewItem> {
    if (status !== AttendanceReviewFlagStatus.RESOLVED && status !== AttendanceReviewFlagStatus.DISMISSED) {
      throw new Error('Invalid attendance review status.');
    }
    const actorId = context.req?.user?.sub ?? context.request?.user?.sub;
    return eventId
      ? this.analytics.reviewFlag(flagId, status, actorId, note, eventId)
      : this.analytics.reviewFlag(flagId, status, actorId, note);
  }
}
