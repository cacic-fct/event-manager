import { Controller, Headers, MessageEvent, Param, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { defer, Observable, switchMap } from 'rxjs';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { SseReplayService } from '../realtime/sse-replay.service';
import { PrizeDrawService } from './prize-draw.service';
import { PrizeDrawRealtimeService } from './prize-draw-realtime.service';

@ApiTags('prize-draws', 'SSE')
@ApiBearerAuth()
@Controller('prize-draws/public')
export class PrizeDrawRealtimeController {
  constructor(
    private readonly draws: PrizeDrawService,
    private readonly realtime: PrizeDrawRealtimeService,
    private readonly replay: SseReplayService,
  ) {}

  @Sse('events/:eventId/events')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents, [{ source: 'params', path: 'eventId' }])
  @ApiOperation({ summary: 'Stream replayable public prize-draw invalidations for an event' })
  @ApiParam({ name: 'eventId' })
  @ApiProduces('text/event-stream')
  eventStream(
    @Param('eventId') eventId: string,
    @Req() request: Request & { user?: AuthenticatedUser },
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return this.stream('event', eventId, lastEventId, { eventId }, request.user);
  }

  @Sse('major-events/:majorEventId/events')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents, [{ source: 'params', path: 'majorEventId' }])
  @ApiOperation({ summary: 'Stream replayable public prize-draw invalidations for a major event' })
  @ApiParam({ name: 'majorEventId' })
  @ApiProduces('text/event-stream')
  majorEventStream(
    @Param('majorEventId') majorEventId: string,
    @Req() request: Request & { user?: AuthenticatedUser },
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return this.stream('major-event', majorEventId, lastEventId, { majorEventId }, request.user);
  }

  @Sse('event-groups/:eventGroupId/events')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents, [{ source: 'params', path: 'eventGroupId' }])
  @ApiOperation({ summary: 'Stream replayable public prize-draw invalidations for an event group' })
  @ApiParam({ name: 'eventGroupId' })
  @ApiProduces('text/event-stream')
  eventGroupStream(
    @Param('eventGroupId') eventGroupId: string,
    @Req() request: Request & { user?: AuthenticatedUser },
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return this.stream('event-group', eventGroupId, lastEventId, { eventGroupId }, request.user);
  }

  private stream(
    type: 'event' | 'major-event' | 'event-group',
    id: string,
    lastEventId: string | undefined,
    target: { eventId?: string; majorEventId?: string; eventGroupId?: string },
    user: AuthenticatedUser | undefined,
  ): Observable<MessageEvent> {
    const scope = this.realtime.scope(type, id);
    return defer(() => this.draws.listPublic(target, user)).pipe(
      switchMap(() => this.replay.replay(scope, lastEventId, this.realtime.watch(scope))),
    );
  }
}
