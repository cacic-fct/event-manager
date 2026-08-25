import { HealthService } from './health.service';

describe('HealthService', () => {
  it('keeps liveness independent from external dependencies', () => {
    const service = new HealthService({} as never, {} as never);

    expect(service.live()).toEqual({ status: 'ok' });
  });

  it('reports ready only when PostgreSQL and Redis respond', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const redis = { ping: jest.fn().mockResolvedValue('PONG') };
    const service = new HealthService(prisma as never, redis as never);

    await expect(service.ready()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it.each([
    ['database', new Error('database unavailable'), undefined],
    ['redis', undefined, new Error('redis unavailable')],
  ])('reports a non-sensitive readiness failure for %s', async (dependency, databaseError, redisError) => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockImplementation(() =>
          databaseError ? Promise.reject(databaseError) : Promise.resolve([{ '?column?': 1 }]),
        ),
    };
    const redis = {
      ping: jest.fn().mockImplementation(() => (redisError ? Promise.reject(redisError) : Promise.resolve('PONG'))),
    };
    const service = new HealthService(prisma as never, redis as never);

    await expect(service.ready()).rejects.toMatchObject({
      response: {
        status: 'unavailable',
        failed: [dependency],
      },
    });
  });
});
