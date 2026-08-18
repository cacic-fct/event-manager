import { Controller, Headers, MessageEvent, Param, ParseIntPipe, Query, Req, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';
import { Permission } from '@cacic-fct/shared-permissions';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { SseReplayService } from '../realtime/sse-replay.service';
import {
  AttendanceAnalyticsService,
  resolveAttendanceAnalyticsWindow,
  type AttendanceAnalyticsWindowRequest,
} from './attendances/attendance-analytics.service';

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
    @Query('windowStart') windowStart: string | undefined,
    @Query('windowEnd') windowEnd: string | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: RequestWithUser,
  ): Observable<MessageEvent> {
    const requestedWindow: AttendanceAnalyticsWindowRequest = {
      windowMinutes,
      ...(windowStart ? { start: new Date(windowStart) } : {}),
      ...(windowEnd ? { end: new Date(windowEnd) } : {}),
    };
    resolveAttendanceAnalyticsWindow(requestedWindow);
    const snapshots = interval(2_000).pipe(
      startWith(0),
      switchMap(() => this.analytics.snapshot(eventId, requestedWindow)),
      map((snapshot) => ({ data: { type: 'event-attendance-analytics', snapshot } })),
    );
    return this.replay.replay(
      this.replay.scope(
        'event-attendance-analytics',
        analyticsReplayKey(eventId, requestedWindow),
        request.user?.sub ?? request.headers.cookie,
      ),
      lastEventId,
      snapshots,
    );
  }
}

function analyticsReplayKey(eventId: string, requestedWindow: AttendanceAnalyticsWindowRequest): string {
  if (requestedWindow.start && requestedWindow.end) {
    return `${eventId}:${requestedWindow.start.toISOString()}:${requestedWindow.end.toISOString()}`;
  }
  return `${eventId}:${requestedWindow.windowMinutes ?? 'all'}`;
}
