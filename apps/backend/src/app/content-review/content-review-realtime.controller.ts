import { Controller, Headers, type MessageEvent, Req, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { concatMap, defer, filter, type Observable, switchMap } from 'rxjs';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import { SseReplayService } from '../realtime/sse-replay.service';
import { ContentReviewInvalidationService } from './content-review-invalidation.service';
import { ContentReviewResolver } from './content-review.resolver';

@ApiTags('SSE', 'realtime')
@Controller('realtime')
export class ContentReviewRealtimeController {
  constructor(
    private readonly context: CurrentUserContextService,
    private readonly reviews: ContentReviewResolver,
    private readonly invalidations: ContentReviewInvalidationService,
    private readonly realtime: RealtimeInvalidationService,
    private readonly replay: SseReplayService,
    private readonly prisma: PrismaService,
  ) {}

  @Sse('admin/content-reviews/events')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Stream administrative content review queue invalidations' })
  @ApiProduces('text/event-stream')
  stream(
    @Req() request: Request & { user?: AuthenticatedUser },
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return defer(async () => {
      const user = this.context.getAuthenticatedUser({ req: request });
      const principal = audienceContext.getStore() ?? ANONYMOUS_AUDIENCE;
      const access = await this.reviews.queueAccess(user);
      return { principal, ...access };
    }).pipe(
      switchMap(({ principal, profilePermission, materialScope }) => {
        const scope = this.invalidations.scope();
        return this.replay.replay(scope, lastEventId, this.realtime.watch(scope)).pipe(
          concatMap(async (event): Promise<MessageEvent | null> => {
            const data = event.data as { type?: string; eventId?: string | null };
            if (data.type === 'heartbeat') return event;
            if (data.eventId === null) {
              if (!profilePermission) return null;
            } else {
              const eventId = data.eventId;
              if (!eventId || !materialScope) return null;
              const visible = await audienceContext.run(principal, () =>
                this.prisma.event.findFirst({
                  where: { id: eventId, AND: [materialScope] },
                  select: { id: true },
                }),
              );
              if (!visible) return null;
            }
            return { ...event, data: { type: 'CONTENT_REVIEWS_INVALIDATED' } };
          }),
          filter((event) => event !== null),
        );
      }),
    );
  }
}
