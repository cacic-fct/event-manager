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
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Permission } from '@cacic-fct/shared-permissions';
import type { Request } from 'express';
import {
  EMPTY,
  Observable,
  Subject,
  catchError,
  defer,
  exhaustMap,
  interval,
  map,
  merge,
  share,
  startWith,
  switchMap,
  throwError,
} from 'rxjs';
import { createHash } from 'node:crypto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Public } from '../auth/decorators/public.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { CurrentUserEventAttendanceResolver } from '../current-user/events/attendance.resolver';
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
const LAST_EVENT_ID_HEADER = {
  name: 'Last-Event-ID',
  required: false,
  description: 'Cursor do último evento SSE recebido, usado para replay após reconexão.',
  example: 'sse1.scope.abc123',
};
const REALTIME_SSE_RESPONSE = {
  description: 'Stream SSE com invalidações replayable e heartbeats de manutenção.',
  schema: {
    oneOf: [
      { type: 'object', example: { type: 'ADMIN_WORKSPACE_INVALIDATED', occurredAt: '2026-08-30T12:00:00.000Z' } },
      { type: 'object', example: { type: 'CURRENT_USER_DATA_INVALIDATED', minute: 29804280 } },
      { type: 'object', example: { type: 'EVENT_SUBSCRIPTIONS_INVALIDATED', subscriptions: { _count: 12 } } },
      { type: 'object', example: { type: 'heartbeat', timestamp: 1788091200000 } },
    ],
  },
};

@ApiTags('SSE', 'realtime')
@Controller('realtime')
export class RealtimeInvalidationController {
  private readonly pollingSnapshots = new Map<string, Observable<MessageEvent>>();

  constructor(
    private readonly invalidations: RealtimeInvalidationService,
    private readonly replay: SseReplayService,
    private readonly fingerprints: RealtimeFingerprintService,
    private readonly currentUser: CurrentUserContextService,
    private readonly organizerInfo: CurrentUserEventAttendanceResolver,
    private readonly policy: AuthorizationPolicyService,
  ) {}

  @Sse('admin/workspace/events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream replayable administrative workspace invalidations',
    description: 'Notifica usuários do workspace sobre dados administrativos alterados sem expor identificadores de outros escopos.',
  })
  @ApiHeader(LAST_EVENT_ID_HEADER)
  @ApiProduces('text/event-stream')
  @ApiOkResponse(REALTIME_SSE_RESPONSE)
  streamAdminWorkspace(
    @Req() request: RequestWithUser,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    const scope = this.invalidations.scope('admin-workspace');
    return defer(() => {
      if (!this.policy.hasEventManagerAccess(request.user)) {
        throw new ForbiddenException('Acesso ao workspace administrativo não autorizado.');
      }
      return this.replay.replay(scope, lastEventId, this.invalidations.watch(scope));
    }).pipe(
      map((event) => {
        const data = event.data as { type?: string };
        return data?.type === 'heartbeat'
          ? event
          : { ...event, data: { type: 'ADMIN_WORKSPACE_INVALIDATED', occurredAt: new Date().toISOString() } };
      }),
    );
  }

  @Public()
  @Sse('public/catalog/events')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  @ApiOperation({
    summary: 'Stream replayable public event-catalog invalidations',
    description: 'Notifica alterações no catálogo público e mudanças de fronteira temporal sem exigir autenticação.',
  })
  @ApiHeader(LAST_EVENT_ID_HEADER)
  @ApiProduces('text/event-stream')
  @ApiOkResponse(REALTIME_SSE_RESPONSE)
  streamPublicCatalog(@Headers('last-event-id') lastEventId: string | undefined): Observable<MessageEvent> {
    const scope = this.invalidations.scope(PUBLIC_CATALOG_REALTIME_CHANNEL);
    const minuteBoundary = interval(60_000).pipe(
      map(() => ({ data: { type: 'PUBLIC_TIME_BOUNDARY', minute: Math.floor(Date.now() / 60_000) } })),
    );
    return this.replay.replay(scope, lastEventId, merge(this.invalidations.watch(scope), minuteBoundary));
  }

  @Sse('current-user/data/events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream replayable current-user data revisions',
    description: 'Emite fingerprints de dados pertencentes à pessoa autenticada para atualização dos clientes.',
  })
  @ApiHeader(LAST_EVENT_ID_HEADER)
  @ApiProduces('text/event-stream')
  @ApiOkResponse(REALTIME_SSE_RESPONSE)
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream replayable organizer metrics revisions for an authorized target',
    description: 'Atualiza métricas de organização somente após validar o acesso da pessoa autenticada ao destino.',
  })
  @ApiParam({ name: 'targetType', description: 'Tipo do destino', example: 'EVENT' })
  @ApiParam({ name: 'targetId', description: 'Identificador do destino', example: '019d2a25-5694-7f19-b954-8a98f7bb9a44' })
  @ApiHeader(LAST_EVENT_ID_HEADER)
  @ApiProduces('text/event-stream')
  @ApiOkResponse(REALTIME_SSE_RESPONSE)
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream replayable event-subscription revisions for administrators',
    description: 'Emite revisões de inscrições após validar a permissão de leitura no evento solicitado.',
  })
  @ApiParam({ name: 'eventId', description: 'Identificador do evento', example: '019d2a25-5694-7f19-b954-8a98f7bb9a44' })
  @ApiHeader(LAST_EVENT_ID_HEADER)
  @ApiProduces('text/event-stream')
  @ApiOkResponse(REALTIME_SSE_RESPONSE)
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
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream replayable major-event subscription revisions for administrators',
    description: 'Emite revisões de inscrições após validar a permissão de leitura no grande evento solicitado.',
  })
  @ApiParam({ name: 'majorEventId', description: 'Identificador do grande evento', example: '019d2a25-5694-7f19-b954-8a98f7bb9a44' })
  @ApiHeader(LAST_EVENT_ID_HEADER)
  @ApiProduces('text/event-stream')
  @ApiOkResponse(REALTIME_SSE_RESPONSE)
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
    let snapshots = this.pollingSnapshots.get(scope);
    if (!snapshots) {
      const sharedSnapshots = interval(refreshIntervalMs).pipe(
        startWith(0),
        exhaustMap(() =>
          defer(load).pipe(
            catchError((error: unknown) =>
              error instanceof ForbiddenException ? throwError(() => error) : EMPTY,
            ),
          ),
        ),
        map((data) => ({ data })),
        share({
          connector: () => new Subject<MessageEvent>(),
          resetOnComplete: true,
          resetOnError: true,
          resetOnRefCountZero: true,
        }),
      );
      let subscribers = 0;
      snapshots = new Observable<MessageEvent>((subscriber) => {
        subscribers += 1;
        const subscription = sharedSnapshots.subscribe(subscriber);
        return () => {
          subscription.unsubscribe();
          subscribers -= 1;
          if (subscribers === 0 && this.pollingSnapshots.get(scope) === snapshots) {
            this.pollingSnapshots.delete(scope);
          }
        };
      });
      this.pollingSnapshots.set(scope, snapshots);
    }
    const heartbeat = interval(HEARTBEAT_INTERVAL_MS).pipe(
      map(() => ({ data: { type: 'heartbeat', timestamp: Date.now() } })),
    );
    return this.replay.replay(scope, lastEventId, merge(snapshots, heartbeat));
  }
}
