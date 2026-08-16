import { Controller, Headers, MessageEvent, Param, ParseIntPipe, Query, Req, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { SseReplayService } from '../realtime/sse-replay.service';
import { AttendanceAnalyticsService } from './attendances/attendance-analytics.service';

type RequestWithUser = Request & { user?: { sub?: string } };

@ApiTags('SSE', 'event-attendances')
@ApiBearerAuth()
@Controller('event-attendances')
export class AttendanceAnalyticsController {
  constructor(
    private readonly analytics: AttendanceAnalyticsService,
    private readonly replay: SseReplayService,
  ) {}

  @Sse('events/:eventId/analytics/events')
  @RequirePermissions(Permission.EventAttendance.Read)
  @ApiOperation({ summary: 'Stream replayable event attendance analytics snapshots' })
  @ApiProduces('text/event-stream')
  streamAnalytics(
    @Param('eventId') eventId: string,
    @Query('windowMinutes', new ParseIntPipe({ optional: true })) windowMinutes: number | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    const snapshots = interval(2_000).pipe(
      startWith(0),
      switchMap(() => this.analytics.snapshot(eventId, windowMinutes)),
      map((snapshot) => ({ data: { type: 'event-attendance-analytics', snapshot } })),
    );
    return this.replay.replay(
      this.replay.scope('event-attendance-analytics', `${eventId}:${windowMinutes ?? 60}`, request.user?.sub ?? request.headers.cookie),
      lastEventId,
      snapshots,
    );
  }
}
