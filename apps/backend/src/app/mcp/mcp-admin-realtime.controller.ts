import { Controller, Headers, type MessageEvent, Req, Sse, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { concatMap, defer, filter, map, merge, type Observable, switchMap } from 'rxjs';
import { Public } from '../auth/decorators/public.decorator';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import { SseReplayService } from '../realtime/sse-replay.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';
import { type McpAuthenticatedRequest, mcpUserId } from './mcp-admin-principal';
import { McpAdminSessionGuard } from './mcp-admin-session.guard';

@ApiTags('Admin MCP', 'SSE')
@ApiCookieAuth()
@Public()
@UseGuards(McpAdminSessionGuard)
@Controller('realtime/admin/mcp')
export class McpAdminRealtimeController {
  constructor(
    private readonly access: McpAdminAccessService,
    private readonly invalidations: McpAdminInvalidationService,
    private readonly realtime: RealtimeInvalidationService,
    private readonly replay: SseReplayService,
  ) {}

  @Sse('events')
  @ApiOperation({
    summary: 'Atualizações replayable da própria fila MCP, sem conteúdo ou identificadores de propostas.',
  })
  @ApiHeader({
    name: 'Last-Event-ID',
    required: false,
    description: 'Cursor da conexão anterior para recuperação do stream.',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ schema: { example: { type: 'MCP_QUEUE_INVALIDATED' } } })
  stream(
    @Req() request: McpAuthenticatedRequest,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<MessageEvent> {
    const user = request.user;
    return defer(() => this.access.assertEligible(user)).pipe(
      switchMap(() => {
        const scope = this.invalidations.scope(mcpUserId(user));
        // Event edits may make a queued revision stale. Workspace invalidations are
        // reduced to an identifier-free signal before entering this user's replay scope.
        const workspace = this.realtime.watch(this.realtime.scope('admin-workspace')).pipe(
          filter((event) => (event.data as { type?: string }).type !== 'heartbeat'),
          map(
            (event): MessageEvent => ({
              data: { type: 'MCP_QUEUE_INVALIDATED', revision: event.id ?? new Date().toISOString() },
            }),
          ),
        );
        return this.replay.replay(scope, lastEventId, merge(this.realtime.watch(scope), workspace)).pipe(
          concatMap(async (event) => {
            await this.access.assertEligible(user);
            return (event.data as { type?: string }).type === 'heartbeat'
              ? event
              : { ...event, data: { type: 'MCP_QUEUE_INVALIDATED' } };
          }),
        );
      }),
    );
  }
}
