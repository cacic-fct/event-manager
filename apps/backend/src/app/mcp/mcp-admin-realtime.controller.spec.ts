import { ForbiddenException, type MessageEvent } from '@nestjs/common';
import { concatMap, firstValueFrom, Observable, of, Subject } from 'rxjs';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import { SseReplayService } from '../realtime/sse-replay.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';
import { type McpAuthenticatedRequest } from './mcp-admin-principal';
import { McpAdminRealtimeController } from './mcp-admin-realtime.controller';

const { jest } = import.meta;

function request(userId: string): McpAuthenticatedRequest {
  const user: AuthenticatedUser = {
    sub: userId,
    token: 'unused',
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    claims: {},
  };
  return { user } as McpAuthenticatedRequest;
}

function context() {
  const sources = new Map<string, Subject<MessageEvent>>();
  const beforeReplay: { scope: string; event: MessageEvent }[] = [];
  const scope = (channel: string, userId?: string) => `${channel}:scope-${userId ?? 'global'}`;
  const realtime = {
    scope: jest.fn(scope),
    watch: jest.fn((key: string): Observable<MessageEvent> => {
      let source = sources.get(key);
      if (!source) {
        source = new Subject<MessageEvent>();
        sources.set(key, source);
      }
      return source.asObservable();
    }),
  };
  const access = { assertEligible: jest.fn().mockResolvedValue(undefined) };
  const invalidations = new McpAdminInvalidationService(realtime as unknown as RealtimeInvalidationService);
  const replay = {
    replay: jest.fn((key: string, _lastEventId: string | undefined, source: Observable<MessageEvent>) =>
      source.pipe(
        concatMap((event) => {
          beforeReplay.push({ scope: key, event });
          return of(event);
        }),
      ),
    ),
  };
  const controller = new McpAdminRealtimeController(
    access as unknown as McpAdminAccessService,
    invalidations,
    realtime as unknown as RealtimeInvalidationService,
    replay as unknown as SseReplayService,
  );
  const emit = (key: string, event: MessageEvent) => {
    const source = sources.get(key);
    if (!source) throw new Error('Expected an active stream subscription');
    source.next(event);
  };
  return { controller, access, realtime, replay, beforeReplay, emit, scope };
}

describe('McpAdminRealtimeController scoped replay', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('checks eligibility before subscriptions and forwards Last-Event-ID to the user replay scope', async () => {
    const { controller, access, realtime, replay, scope } = context();
    const req = request('user-1');
    const subscription = controller.stream(req, 'previous-user-cursor').subscribe();
    expect(realtime.watch).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(0);

    expect(access.assertEligible).toHaveBeenCalledWith(req.user);
    expect(replay.replay).toHaveBeenCalledWith(
      scope('admin-mcp', 'user-1'),
      'previous-user-cursor',
      expect.any(Observable),
    );
    expect(realtime.watch).toHaveBeenCalledWith(scope('admin-workspace'));
    expect(realtime.watch).toHaveBeenCalledWith(scope('admin-mcp', 'user-1'));
    subscription.unsubscribe();
  });

  it('never opens replay or workspace subscriptions for an ineligible person', async () => {
    const { controller, access, replay, realtime } = context();
    access.assertEligible.mockRejectedValue(new ForbiddenException('Pending deletion'));

    await expect(firstValueFrom(controller.stream(request('user-1'), 'cursor'))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(realtime.watch).not.toHaveBeenCalled();
    expect(replay.replay).not.toHaveBeenCalled();
  });

  it('strips workspace identifiers and content before entering personal replay and before browser delivery', async () => {
    const { controller, emit, scope, beforeReplay } = context();
    const events: MessageEvent[] = [];
    const subscription = controller.stream(request('user-1'), 'previous').subscribe((event) => events.push(event));
    await jest.advanceTimersByTimeAsync(0);

    emit(scope('admin-workspace'), {
      id: 'workspace-replay-cursor',
      data: {
        type: 'EVENT_UPDATED',
        eventId: 'private-event',
        proposalId: 'private-proposal',
        delegationId: 'private-delegation',
        clientId: 'private-client',
        description: 'Private event content',
      },
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(beforeReplay).toEqual([
      {
        scope: scope('admin-mcp', 'user-1'),
        event: { data: { type: 'MCP_QUEUE_INVALIDATED', revision: 'workspace-replay-cursor' } },
      },
    ]);
    expect(events).toEqual([{ data: { type: 'MCP_QUEUE_INVALIDATED' } }]);
    expect(JSON.stringify(beforeReplay)).not.toContain('private-');
    expect(JSON.stringify(events)).not.toContain('Private event content');
    subscription.unsubscribe();
  });

  it('preserves heartbeats on the user scope while ignoring duplicate workspace heartbeats', async () => {
    const { controller, emit, scope, access, beforeReplay } = context();
    const req = request('user-1');
    const events: MessageEvent[] = [];
    const subscription = controller.stream(req).subscribe((event) => events.push(event));
    await jest.advanceTimersByTimeAsync(0);
    const heartbeat: MessageEvent = { data: { type: 'heartbeat', timestamp: Date.now() } };

    emit(scope('admin-workspace'), heartbeat);
    emit(scope('admin-mcp', 'user-1'), heartbeat);
    await jest.advanceTimersByTimeAsync(0);

    expect(events).toEqual([heartbeat]);
    expect(beforeReplay).toHaveLength(1);
    expect(access.assertEligible).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
  });

  it('sanitizes personal replay events and retains only transport metadata with an opaque signal', async () => {
    const { controller, emit, scope } = context();
    const events: MessageEvent[] = [];
    const subscription = controller.stream(request('user-1')).subscribe((event) => events.push(event));
    await jest.advanceTimersByTimeAsync(0);

    emit(scope('admin-mcp', 'user-1'), {
      id: 'personal-replay-cursor',
      retry: 3000,
      data: { type: 'MCP_QUEUE_INVALIDATED', proposalId: 'private-proposal', description: 'Private content' },
    });
    await jest.advanceTimersByTimeAsync(0);

    expect(events).toEqual([{ id: 'personal-replay-cursor', retry: 3000, data: { type: 'MCP_QUEUE_INVALIDATED' } }]);
    subscription.unsubscribe();
  });

  it('revalidates eligibility for future events and terminates before sending data after revocation', async () => {
    const { controller, emit, scope, access } = context();
    const events: MessageEvent[] = [];
    const errors: unknown[] = [];
    const subscription = controller.stream(request('user-1')).subscribe({
      next: (event) => events.push(event),
      error: (error: unknown) => errors.push(error),
    });
    await jest.advanceTimersByTimeAsync(0);
    const forbidden = new ForbiddenException('Person became ineligible');
    access.assertEligible.mockRejectedValue(forbidden);

    emit(scope('admin-mcp', 'user-1'), { id: 'future-cursor', data: { type: 'MCP_QUEUE_INVALIDATED' } });
    await jest.advanceTimersByTimeAsync(0);

    expect(events).toEqual([]);
    expect(errors).toEqual([forbidden]);
    expect(subscription.closed).toBe(true);
  });

  it('keeps two users on distinct personal scopes and does not broadcast one user queue change to the other', async () => {
    const { controller, emit, scope, replay } = context();
    const first: MessageEvent[] = [];
    const second: MessageEvent[] = [];
    const a = controller.stream(request('user-1'), 'cursor-a').subscribe((event) => first.push(event));
    const b = controller.stream(request('user-2'), 'cursor-b').subscribe((event) => second.push(event));
    await jest.advanceTimersByTimeAsync(0);

    emit(scope('admin-mcp', 'user-1'), { id: 'cursor-a-new', data: { type: 'MCP_QUEUE_INVALIDATED' } });
    await jest.advanceTimersByTimeAsync(0);

    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(replay.replay).toHaveBeenCalledWith(scope('admin-mcp', 'user-1'), 'cursor-a', expect.any(Observable));
    expect(replay.replay).toHaveBeenCalledWith(scope('admin-mcp', 'user-2'), 'cursor-b', expect.any(Observable));
    a.unsubscribe();
    b.unsubscribe();
  });
});
