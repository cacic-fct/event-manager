import { PublicationScheduler } from './publishing.scheduler';

describe('PublicationScheduler', () => {
  it('registers every recurring publication job during module initialization', async () => {
    const schedulePublicationJobs = jest.fn().mockResolvedValue(undefined);
    const scheduler = new PublicationScheduler({ schedulePublicationJobs } as never);

    await scheduler.onModuleInit();

    expect(schedulePublicationJobs).toHaveBeenCalledTimes(1);
  });

  it('propagates scheduling failures so application startup cannot silently omit publication jobs', async () => {
    const schedulePublicationJobs = jest.fn().mockRejectedValue(new Error('queue unavailable'));
    const scheduler = new PublicationScheduler({ schedulePublicationJobs } as never);

    await expect(scheduler.onModuleInit()).rejects.toThrow('queue unavailable');
  });
});
