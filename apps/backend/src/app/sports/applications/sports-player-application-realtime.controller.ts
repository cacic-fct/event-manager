import { Controller, Headers, MessageEvent, Req, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { defer, Observable, switchMap } from 'rxjs';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../../current-user/context.service';
import { SseReplayService } from '../../realtime/sse-replay.service';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';
import { SportsPlayerApplicationRealtimeService } from './sports-player-application-realtime.service';

type RequestWithUser = Request & { user?: AuthenticatedUser };

@ApiTags('sports-realtime', 'SSE')
@Controller('sports/applications')
export class SportsPlayerApplicationRealtimeController {
  constructor(
    private readonly currentUser: CurrentUserContextService,
    private readonly replay: SseReplayService,
    private readonly realtime: SportsRealtimeService,
    private readonly applicationRealtime: SportsPlayerApplicationRealtimeService,
  ) {}

  @Sse('current/events')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Stream current-user sports application and payment changes',
    description:
      'Replayable person-scoped stream. The authenticated person is resolved before any replayed event is disclosed.',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'Fluxo SSE reproduzível de alterações em solicitações esportivas e pagamentos do usuário atual.',
    content: {
      'text/event-stream': {
        example:
          'id: 42\nevent: SPORTS_PLAYER_APPLICATION_CHANGED\ndata: {"type":"SPORTS_PLAYER_APPLICATION_CHANGED","applicationId":"01900000-0000-7000-8000-000000000001","reason":"SUBMITTED"}\n\n',
      },
    },
  })
  streamCurrentUserApplications(
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    return defer(() => this.currentUser.requireCurrentPerson({ req: request })).pipe(
      switchMap((person) => {
        const scope = this.applicationRealtime.scope(person.id);
        return this.replay.replay(scope, lastEventId, this.realtime.watch(scope));
      }),
    );
  }
}
