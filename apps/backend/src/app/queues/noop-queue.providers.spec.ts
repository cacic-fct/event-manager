import { getQueueToken } from '@nestjs/bullmq';
import { createNoopQueueProviders, NoopQueue } from './noop-queue.providers';

describe('createNoopQueueProviders', () => {
  it('creates no-op queue providers for each queue token', async () => {
    const providers = createNoopQueueProviders(['weather', 'publication']);

    expect(providers).toHaveLength(2);
    expect(providers.map((provider) => provider.provide)).toEqual([getQueueToken('weather'), getQueueToken('publication')]);

    const queue = providers[0].useFactory() as NoopQueue;
    await expect(queue.add('refresh-event-weather')).resolves.toEqual({
      id: 'noop-refresh-event-weather',
      name: 'refresh-event-weather',
    });
    await expect(queue.close()).resolves.toBeUndefined();
  });
});
