import { Controller, Headers, MessageEvent, Param, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { defer, filter, Observable, switchMap } from 'rxjs';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { SseReplayService } from '../realtime/sse-replay.service';
import { PrizeDrawService } from './prize-draw.service';
import { PrizeDrawRealtimeService } from './prize-draw-realtime.service';

const PRIZE_DRAW_SSE_RESPONSE = {
  description: 'Eventos de invalidação de sorteios publicamente disponíveis e heartbeats de manutenção da conexão.',
  schema: {
    oneOf: [
      {
        type: 'object',
        properties: {
              type: { type: 'string', example: 'SPIN_PRESENTED' },
          drawId: { type: 'string', example: '019d2a25-5694-7f19-b954-8a98f7bb9a44' },
          spinId: { type: 'string', nullable: true, example: '019d2a25-5694-7f19-b954-8a98f7bb9a45' },
          revision: { type: 'integer', example: 3 },
          occurredAt: { type: 'string', format: 'date-time' },
        },
      },
      {
        type: 'object',
        properties: {
          type: { type: 'string', example: 'heartbeat' },
          timestamp: { type: 'integer', example: 1787756400000 },
        },
      },
    ],
  },
};

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
  @ApiParam({ name: 'eventId', description: 'Identificador do evento', example: '019d2a25-5694-7f19-b954-8a98f7bb9a44' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse(PRIZE_DRAW_SSE_RESPONSE)
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
  @ApiParam({ name: 'majorEventId', description: 'Identificador do grande evento', example: '019d2a25-5694-7f19-b954-8a98f7bb9a44' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse(PRIZE_DRAW_SSE_RESPONSE)
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
  @ApiParam({ name: 'eventGroupId', description: 'Identificador do grupo de eventos', example: '019d2a25-5694-7f19-b954-8a98f7bb9a44' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse(PRIZE_DRAW_SSE_RESPONSE)
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
      switchMap((draws) => {
        const allowedDrawIds = new Set(draws.map((draw) => draw.id));
        return this.replay.replay(scope, lastEventId, this.realtime.watch(scope)).pipe(
          filter((event) => {
            const data = event.data as { type?: string; drawId?: string };
            return data?.type === 'heartbeat' || Boolean(data?.drawId && allowedDrawIds.has(data.drawId));
          }),
        );
      }),
    );
  }
}
