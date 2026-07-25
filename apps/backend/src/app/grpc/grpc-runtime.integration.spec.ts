import { Metadata, Server, ServerCredentials } from '@grpc/grpc-js';
import {
  GrpcUnaryClient,
  loadGrpcServiceDefinition,
  resolveGrpcProtoPath,
} from './grpc-runtime';

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
    const service = loadGrpcServiceDefinition(
      resolveGrpcProtoPath('event-manager-m2m.proto'),
      ['cacic', 'm2m', 'event_manager', 'v1'],
      'EventManagerM2M',
    );
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
    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, boundPort) =>
        error ? reject(error) : resolve(boundPort),
      );
    });
    client = new GrpcUnaryClient(`127.0.0.1:${port}`, service);
    const metadata = new Metadata();
    metadata.set('authorization', 'Bearer integration-token');

    await expect(
      client.call<{ events: { id: string; name: string }[] }>(
        'ListVotingEvents',
        {},
        metadata,
        { idempotent: true, timeoutMs: 2_000 },
      ),
    ).resolves.toMatchObject({
      events: [{ id: 'event-1', name: 'Bearer integration-token' }],
    });
  });
});
