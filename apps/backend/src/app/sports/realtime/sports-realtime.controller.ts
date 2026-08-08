import { Controller, Headers, MessageEvent, NotFoundException, Param, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';
import { PublicationState, SportsTournamentStatus } from '@prisma/client';
import type { Request } from 'express';
import { defer, Observable, switchMap } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { Public } from '../../auth/decorators/public.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { CurrentUserContextService } from '../../current-user/context.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SseReplayService } from '../../realtime/sse-replay.service';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { SportsRealtimeService } from './sports-realtime.service';
import { PUBLIC_SPORTS_MATCH_RELATIONS_WHERE } from '../security/sports-public-visibility';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@ApiTags('sports-realtime', 'SSE')
@Controller('sports')
export class SportsRealtimeController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: AuthorizationPolicyService,
    private readonly currentUser: CurrentUserContextService,
    private readonly replay: SseReplayService,
    private readonly realtime: SportsRealtimeService,
  ) {}

  @Sse('current/autoroute-events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream current-user sports autoroute invalidations',
    description:
      'Authenticated, person-scoped and replayable invalidations. Payloads disclose only an opaque revision and instruct the client to refetch the current route.',
  })
  @ApiProduces('text/event-stream')
  streamCurrentUserAutoroute(
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    return defer(() => this.currentUser.requireCurrentPerson({ req: request })).pipe(
      switchMap((person) => {
        const scope = this.realtime.scope('autoroute', person.id);
        return this.replay.replay(scope, lastEventId, this.realtime.watch(scope));
      }),
    );
  }

  @Public()
  @Sse('matches/:matchId/events')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents, [{ source: 'params', path: 'matchId' }])
  @ApiOperation({
    summary: 'Stream live public match projections',
    description:
      'Replayable, mutation-driven SSE stream. Clients reconnect with Last-Event-ID; the server never polls.',
  })
  @ApiParam({ name: 'matchId', description: 'Public sports match identifier.' })
  @ApiProduces('text/event-stream')
  streamPublicMatch(
    @Param('matchId') matchId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    const scope = this.realtime.scope('match', matchId);
    return defer(() => this.assertPublicMatch(matchId)).pipe(
      switchMap(() => this.replay.replay(scope, lastEventId, this.realtime.watch(scope))),
    );
  }

  @Public()
  @Sse('tournaments/:tournamentId/events')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents, [{ source: 'params', path: 'tournamentId' }])
  @ApiOperation({
    summary: 'Stream live public tournament projections',
    description: 'Replayable, mutation-driven SSE stream for brackets, standings, and match changes.',
  })
  @ApiParam({
    name: 'tournamentId',
    description: 'Published sports tournament identifier.',
  })
  @ApiProduces('text/event-stream')
  streamPublicTournament(
    @Param('tournamentId') tournamentId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    const scope = this.realtime.scope('tournament', tournamentId);
    return defer(() => this.assertPublicTournament(tournamentId)).pipe(
      switchMap(() => this.replay.replay(scope, lastEventId, this.realtime.watch(scope))),
    );
  }

  @Sse('matches/:matchId/review-events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream pending match review changes',
    description: 'Scoped administrator stream. Authorization is evaluated before any replayed event is disclosed.',
  })
  @ApiParam({ name: 'matchId', description: 'Sports match review scope.' })
  @ApiProduces('text/event-stream')
  streamReview(
    @Param('matchId') matchId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    const scope = this.realtime.scope('review', matchId);
    return defer(() =>
      this.policy.assertPermissions(request.user, [Permission.SportsMatch.Review], { sportsMatchId: matchId }),
    ).pipe(switchMap(() => this.replay.replay(scope, lastEventId, this.realtime.watch(scope))));
  }

  @Sse('tournaments/:tournamentId/review-events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream administrator sports-workspace invalidations',
    description: 'Replayable scoped invalidations for teams, registrations, brackets, officials, and review queues.',
  })
  @ApiParam({ name: 'tournamentId', description: 'Sports tournament review scope.' })
  @ApiProduces('text/event-stream')
  streamTournamentReview(
    @Param('tournamentId') tournamentId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    const scope = this.realtime.scope('admin-tournament', tournamentId);
    return defer(() =>
      this.policy.assertPermissions(request.user, [Permission.SportsTournament.Read], {
        sportsTournamentId: tournamentId,
      }),
    ).pipe(switchMap(() => this.replay.replay(scope, lastEventId, this.realtime.watch(scope))));
  }

  private async assertPublicMatch(matchId: string): Promise<void> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: {
        id: matchId,
        deletedAt: null,
        ...PUBLIC_SPORTS_MATCH_RELATIONS_WHERE,
      },
      select: { id: true },
    });
    if (!match) {
      throw new NotFoundException('Partida esportiva pública não encontrada.');
    }
  }

  private async assertPublicTournament(tournamentId: string): Promise<void> {
    await this.prisma.sportsTournament.findFirstOrThrow({
      where: {
        id: tournamentId,
        deletedAt: null,
        status: { not: SportsTournamentStatus.DRAFT },
        majorEvent: {
          deletedAt: null,
          publicationState: PublicationState.PUBLISHED,
        },
      },
      select: { id: true },
    });
  }
}
