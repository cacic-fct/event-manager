import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';
import { McpAdminInvalidationService } from './mcp-admin-invalidation.service';

const { jest } = import.meta;

function context() {
  const realtime = {
    scope: jest.fn((channel: string, userId: string) => `${channel}:test-scope-${userId}`),
    publish: jest.fn().mockResolvedValue(undefined),
  };
  return {
    realtime,
    service: new McpAdminInvalidationService(realtime as unknown as RealtimeInvalidationService),
  };
}

describe('McpAdminInvalidationService', () => {
  it('publishes only an opaque queue signal in the data subject scope with a fresh replay revision', async () => {
    const { service, realtime } = context();

    await service.publish('user-1');
    await service.publish('user-1');

    expect(realtime.scope).toHaveBeenCalledWith('admin-mcp', 'user-1');
    expect(realtime.publish).toHaveBeenCalledTimes(2);
    const first = realtime.publish.mock.calls[0] as [string, { type: string; revision: string }];
    const second = realtime.publish.mock.calls[1] as [string, { type: string; revision: string }];
    expect(first).toEqual([
      'admin-mcp:test-scope-user-1',
      {
        type: 'MCP_QUEUE_INVALIDATED',
        revision: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    ]);
    expect(first[1].revision).not.toBe(second[1].revision);
    expect(Object.keys(first[1]).sort()).toEqual(['revision', 'type']);
    expect(JSON.stringify(first[1])).not.toContain('user-1');
  });

  it('isolates two users through separate shared realtime scopes', async () => {
    const { service, realtime } = context();

    await service.publish('user-1');
    await service.publish('user-2');

    expect(realtime.publish.mock.calls.map((args: unknown[]) => args[0])).toEqual([
      'admin-mcp:test-scope-user-1',
      'admin-mcp:test-scope-user-2',
    ]);
  });

  it('absorbs delivery failure after commit so the caller does not retry its business mutation', async () => {
    const { service, realtime } = context();
    realtime.publish.mockRejectedValue(new Error('Redis delivery unavailable'));

    await expect(service.publish('user-1')).resolves.toBeUndefined();
    expect(realtime.publish).toHaveBeenCalledTimes(1);
  });
});
