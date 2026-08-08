import { Metadata, Server, ServerCredentials, status } from '@grpc/grpc-js';
import { GrpcUnaryClient, loadGrpcServiceDefinition, resolveGrpcProtoPath } from './grpc-runtime';

describe('gRPC runtime integration', () => {
  let server: Server;
  let client: GrpcUnaryClient;

  afterEach(async () => {
    client?.close();
    if (server) {
      await new Promise<void>((resolve) => server.tryShutdown(() => resolve()));
    }
  });

  it('performs an authenticated protobuf round trip after channel readiness', async () => {
    const service = eventManagerService();
    server = new Server();
    server.addService(service, {
      listVotingEvents: (call, callback) => {
        callback(null, {
          events: [
            {
              id: 'event-1',
              name: String(call.metadata.get('authorization')[0]),
              startDate: '2026-07-25T10:00:00.000Z',
              endDate: '2026-07-25T12:00:00.000Z',
              shouldCollectAttendance: true,
            },
          ],
        });
      },
    });
    client = new GrpcUnaryClient(`127.0.0.1:${await bindServer(server)}`, service);
    const metadata = new Metadata();
    metadata.set('authorization', 'Bearer integration-token');

    await expect(
      client.call<{ events: { id: string; name: string }[] }>('ListVotingEvents', {}, metadata, {
        idempotent: true,
        timeoutMs: 2_000,
      }),
    ).resolves.toMatchObject({
      events: [{ id: 'event-1', name: 'Bearer integration-token' }],
    });
  });

  it('retries a transient unavailable response within one deadline budget', async () => {
    const service = eventManagerService();
    let attempts = 0;
    server = new Server();
    server.addService(service, {
      listVotingEvents: (_call, callback) => {
        attempts += 1;
        if (attempts === 1) {
          callback(Object.assign(new Error('temporarily unavailable'), { code: status.UNAVAILABLE }), null);
          return;
        }
        callback(null, { events: [] });
      },
    });
    client = new GrpcUnaryClient(`127.0.0.1:${await bindServer(server)}`, service);

    await expect(
      client.call('ListVotingEvents', {}, new Metadata(), { idempotent: true, maxAttempts: 2, timeoutMs: 2_000 }),
    ).resolves.toEqual({});
    expect(attempts).toBe(2);
  });

  it('rejects a call that exceeds its deadline', async () => {
    const service = eventManagerService();
    server = new Server();
    server.addService(service, {
      listVotingEvents: (_call, callback) => {
        setTimeout(() => callback(null, { events: [] }), 250);
      },
    });
    client = new GrpcUnaryClient(`127.0.0.1:${await bindServer(server)}`, service);

    await expect(
      client.call('ListVotingEvents', {}, new Metadata(), { idempotent: false, timeoutMs: 50 }),
    ).rejects.toEqual(expect.objectContaining({ code: status.DEADLINE_EXCEEDED }));
  });

  function eventManagerService() {
    return loadGrpcServiceDefinition(
      resolveGrpcProtoPath('cacic/m2m/event_manager/v1/event-manager-m2m.proto'),
      ['cacic', 'm2m', 'event_manager', 'v1'],
      'EventManagerM2M',
    );
  }

  function bindServer(grpcServer: Server): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      grpcServer.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, boundPort) =>
        error ? reject(error) : resolve(boundPort),
      );
    });
  }
});
