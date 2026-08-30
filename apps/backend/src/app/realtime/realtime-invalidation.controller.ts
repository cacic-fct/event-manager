import {
  Controller,
  ForbiddenException,
  Headers,
  MessageEvent,
  Param,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Permission } from '@cacic-fct/shared-permissions';
import type { Request } from 'express';
import { Observable, defer, exhaustMap, interval, map, merge, startWith, switchMap } from 'rxjs';
import { createHash } from 'node:crypto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Public } from '../auth/decorators/public.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { CurrentUserEventAttendanceResolver } from '../current-user/events/attendance.resolver';
import { DashboardInsightsService } from '../dashboard/insights.service';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { PUBLIC_CATALOG_REALTIME_CHANNEL } from './public-catalog-invalidation';
import { RealtimeFingerprintService } from './realtime-fingerprint.service';
import { RealtimeInvalidationService } from './realtime-invalidation.service';
import { SseReplayService } from './sse-replay.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

const HEARTBEAT_INTERVAL_MS = 25_000;
const PERSONAL_REFRESH_INTERVAL_MS = 5_000;
const SUBSCRIPTION_REFRESH_INTERVAL_MS = 3_000;
const ORGANIZER_REFRESH_INTERVAL_MS = 2_000;

@ApiTags('SSE', 'realtime')
@ApiBearerAuth()
@Controller('realtime')
export class RealtimeInvalidationController {
  constructor(
    private readonly invalidations: RealtimeInvalidationService,
    private readonly replay: SseReplayService,
    private readonly fingerprints: RealtimeFingerprintService,
    private readonly dashboard: DashboardInsightsService,
    private readonly currentUser: CurrentUserContextService,
    private readonly organizerInfo: CurrentUserEventAttendanceResolver,
    private readonly policy: AuthorizationPolicyService,
  ) {}

  @Sse('admin/workspace/events')
  @ApiOperation({ summary: 'Stream replayable administrative workspace invalidations' })
  @ApiProduces('text/event-stream')
  streamAdminWorkspace(
    @Req() request: RequestWithUser,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    const scope = this.invalidations.scope('admin-workspace');
    return defer(() => this.dashboard.getWorkspaceDashboardInsights({ req: request })).pipe(
      switchMap(() => this.replay.replay(scope, lastEventId, this.invalidations.watch(scope))),
    );
  }

  @Public()
  @Sse('public/catalog/events')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  @ApiOperation({ summary: 'Stream replayable public event-catalog invalidations' })
  @ApiProduces('text/event-stream')
  streamPublicCatalog(@Headers('last-event-id') lastEventId: string | undefined): Observable<MessageEvent> {
    const scope = this.invalidations.scope(PUBLIC_CATALOG_REALTIME_CHANNEL);
    const minuteBoundary = interval(60_000).pipe(
      map(() => ({ data: { type: 'PUBLIC_TIME_BOUNDARY', minute: Math.floor(Date.now() / 60_000) } })),
    );
    return this.replay.replay(scope, lastEventId, merge(this.invalidations.watch(scope), minuteBoundary));
  }

  @Sse('current-user/data/events')
  @ApiOperation({ summary: 'Stream replayable current-user data revisions' })
  @ApiProduces('text/event-stream')
  streamCurrentUserData(
    @Req() request: RequestWithUser,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return defer(() => this.currentUser.requireCurrentPerson({ req: request })).pipe(
      switchMap((person) =>
        this.replayPolling(
          this.invalidations.scope('current-user-data', person.id),
          lastEventId,
          PERSONAL_REFRESH_INTERVAL_MS,
          () => this.fingerprints.currentUser(person.id),
        ),
      ),
    );
  }

  @Sse('current-user/organizer/:targetType/:targetId/events')
  @ApiOperation({ summary: 'Stream replayable organizer metrics revisions for an authorized target' })
  @ApiProduces('text/event-stream')
  streamOrganizerInfo(
    @Param('targetType') targetType: string,
    @Param('targetId') targetId: string,
    @Req() request: RequestWithUser,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return defer(() => this.currentUser.requireCurrentPerson({ req: request })).pipe(
      switchMap((person) =>
        this.replayPolling(
          this.invalidations.scope('current-user-organizer', person.id, targetType, targetId),
          lastEventId,
          ORGANIZER_REFRESH_INTERVAL_MS,
          async () => {
            const info = await this.organizerInfo.currentUserOrganizerInfo(targetType, targetId, { req: request });
            if (!info) throw new ForbiddenException('Informações restritas aos ministrantes deste evento.');
            return {
              type: 'ORGANIZER_INFO_INVALIDATED',
              revision: createHash('sha256').update(JSON.stringify(info)).digest('base64url'),
            };
          },
        ),
      ),
    );
  }

  @Sse('admin/events/:eventId/subscriptions/events')
  @ApiOperation({ summary: 'Stream replayable event-subscription revisions for administrators' })
  @ApiProduces('text/event-stream')
  streamEventSubscriptions(
    @Param('eventId') eventId: string,
    @Req() request: RequestWithUser,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return defer(() => this.policy.assertPermissions(request.user, [Permission.Subscription.Read], { eventId })).pipe(
      switchMap(() =>
        this.replayPolling(
          this.invalidations.scope('admin-event-subscriptions', eventId),
          lastEventId,
          SUBSCRIPTION_REFRESH_INTERVAL_MS,
          () => this.fingerprints.eventSubscriptions(eventId),
        ),
      ),
    );
  }

  @Sse('admin/major-events/:majorEventId/subscriptions/events')
  @ApiOperation({ summary: 'Stream replayable major-event subscription revisions for administrators' })
  @ApiProduces('text/event-stream')
  streamMajorEventSubscriptions(
    @Param('majorEventId') majorEventId: string,
    @Req() request: RequestWithUser,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return defer(() =>
      this.policy.assertPermissions(request.user, [Permission.Subscription.Read], { majorEventId }),
    ).pipe(
      switchMap(() =>
        this.replayPolling(
          this.invalidations.scope('admin-major-event-subscriptions', majorEventId),
          lastEventId,
          SUBSCRIPTION_REFRESH_INTERVAL_MS,
          () => this.fingerprints.majorEventSubscriptions(majorEventId),
        ),
      ),
    );
  }

  private replayPolling(
    scope: string,
    lastEventId: string | undefined,
    refreshIntervalMs: number,
    load: () => Promise<object>,
  ): Observable<MessageEvent> {
    const snapshots = interval(refreshIntervalMs).pipe(
      startWith(0),
      exhaustMap(load),
      map((data) => ({ data })),
    );
    const heartbeat = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map(() => ({ data: { type: 'heartbeat', timestamp: Date.now() } })),
    );
    return this.replay.replay(scope, lastEventId, merge(snapshots, heartbeat));
  }
}
