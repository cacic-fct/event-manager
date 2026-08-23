import { LegacyRepeatableJobsMigrationService } from './legacy-repeatable-jobs-migration.service';

describe('LegacyRepeatableJobsMigrationService', () => {
  it('regenerates weather schedulers before removing all legacy repeatable metadata', async () => {
    const queues = Array.from({ length: 7 }, () => ({
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(true),
    }));
    queues[1].getRepeatableJobs.mockResolvedValue([{ key: 'certificate-legacy' }]);
    queues[6].getRepeatableJobs.mockResolvedValue([{ key: 'weather-legacy' }]);
    const weather = { scheduleUpcomingEventRefreshes: jest.fn().mockResolvedValue(undefined) };
    const service = new LegacyRepeatableJobsMigrationService(
      queues[0] as never,
      queues[1] as never,
      queues[2] as never,
      queues[3] as never,
      queues[4] as never,
      queues[5] as never,
      queues[6] as never,
      weather as never,
    );

    await service.onApplicationBootstrap();

    expect(weather.scheduleUpcomingEventRefreshes).toHaveBeenCalledTimes(1);
    expect(queues[1].removeRepeatableByKey).toHaveBeenCalledWith('certificate-legacy');
    expect(queues[6].removeRepeatableByKey).toHaveBeenCalledWith('weather-legacy');
  });

  it('is inert after the v6 upgrade removes the legacy queue methods', async () => {
    const queues = Array.from({ length: 7 }, () => ({}));
    const weather = { scheduleUpcomingEventRefreshes: jest.fn() };
    const service = new LegacyRepeatableJobsMigrationService(
      queues[0] as never,
      queues[1] as never,
      queues[2] as never,
      queues[3] as never,
      queues[4] as never,
      queues[5] as never,
      queues[6] as never,
      weather as never,
    );

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    expect(weather.scheduleUpcomingEventRefreshes).not.toHaveBeenCalled();
  });
});
