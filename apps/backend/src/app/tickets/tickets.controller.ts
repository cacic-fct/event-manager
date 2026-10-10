import {
  Controller,
  ForbiddenException,
  Headers,
  MessageEvent,
  NotFoundException,
  Param,
  Req,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Observable, defer, from, merge, of, switchMap } from 'rxjs';
import { AuthenticatedRequest, authenticateHttpRequest } from '../auth/authenticated-request';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { Permission } from '@cacic-fct/shared-permissions';
import { SseReplayService } from '../realtime/sse-replay.service';
import { TicketRealtimeService } from './ticket-realtime.service';

@ApiTags('tickets', 'SSE')
@ApiBearerAuth()
@Controller('current-user/tickets')
export class CurrentUserTicketRealtimeController {
  constructor(
    private readonly realtime: TicketRealtimeService,
    private readonly replay: SseReplayService,
    private readonly keycloakAuth: KeycloakAuthService,
  ) {}

  @Sse('realtime/events')
  @ApiOperation({ summary: 'Stream replayable ticket and transfer invalidations for the current user' })
  @ApiProduces('text/event-stream')
  stream(
    @Req() request: AuthenticatedRequest,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return defer(() => authenticateHttpRequest(request, this.keycloakAuth)).pipe(
      switchMap((user) => {
        if (!user.sub) throw new UnauthorizedException('Missing authenticated user.');
        const changedAt = new Date().toISOString();
        const baselines: MessageEvent[] = ['TICKETS_CHANGED', 'TRANSFERS_CHANGED', 'PURCHASES_CHANGED'].map((type) => ({
          data: {
            revision: `baseline:${type}:${Date.now()}`,
            type,
            changedAt,
          },
          retry: 3_000,
        }));
        return this.replay.replay(
          this.realtime.scope(user.sub),
          lastEventId,
          merge(from(baselines), this.realtime.watch(user.sub)),
        );
      }),
    );
  }
}

@ApiTags('tickets', 'admin', 'SSE')
@ApiBearerAuth()
@Controller('realtime/admin')
export class AdminTicketRealtimeController {
  constructor(
    private readonly realtime: TicketRealtimeService,
    private readonly replay: SseReplayService,
    private readonly keycloakAuth: KeycloakAuthService,
    private readonly authorization: AuthorizationPolicyService,
  ) {}

  @Sse('events/:eventId/tickets/events')
  @ApiOperation({ summary: 'Stream scoped ticket-list and redemption invalidations for event managers' })
  @ApiProduces('text/event-stream')
  stream(
    @Param('eventId') eventId: string,
    @Req() request: AuthenticatedRequest,
    @Headers('last-event-id') lastEventId: string | undefined,
  ): Observable<MessageEvent> {
    return defer(() => authenticateHttpRequest(request, this.keycloakAuth)).pipe(
      switchMap(async (user) => {
        let authorized = false;
        for (const permission of [Permission.Ticket.Read, Permission.TicketConfig.Read]) {
          try {
            await this.authorization.assertPermissions(user, [permission], { eventId });
            authorized = true;
            break;
          } catch (error) {
            if (!(error instanceof ForbiddenException || error instanceof NotFoundException)) {
              throw error;
            }
            // Try the other read grant because event-ticket and config scopes are independent.
          }
        }
        if (!authorized) throw new ForbiddenException('Missing event ticket read permission.');
        const baseline: MessageEvent = {
          data: {
            revision: `baseline:${Date.now()}`,
            type: 'TICKETS_CHANGED',
            eventId,
            changedAt: new Date().toISOString(),
          },
          retry: 3_000,
        };
        return this.replay.replay(
          this.realtime.adminEventScope(eventId),
          lastEventId,
          merge(of(baseline), this.realtime.watchAdminEvent(eventId)),
        );
      }),
      switchMap((stream) => stream),
    );
  }
}
