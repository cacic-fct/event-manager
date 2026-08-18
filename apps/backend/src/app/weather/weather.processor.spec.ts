import { WeatherProcessor } from './weather.processor';

describe('WeatherProcessor', () => {
  const refreshEventWeatherById = jest.fn().mockResolvedValue(undefined);
  const scheduleUpcomingEventRefreshes = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes weather for the requested event', async () => {
    const processor = createProcessor();

    await processor.process({ name: 'refresh-event-weather', data: { eventId: 'event-1' } } as never);

    expect(refreshEventWeatherById).toHaveBeenCalledWith('event-1');
  });

  it('does not refresh weather when the event identifier is missing', async () => {
    const processor = createProcessor();

    await processor.process({ name: 'refresh-event-weather', data: {} } as never);

    expect(refreshEventWeatherById).not.toHaveBeenCalled();
  });

  it('schedules upcoming event refreshes', async () => {
    const processor = createProcessor();

    await processor.process({ name: 'schedule-upcoming-event-weather', data: {} } as never);

    expect(scheduleUpcomingEventRefreshes).toHaveBeenCalledTimes(1);
  });

  it('ignores unrelated queue jobs', async () => {
    const processor = createProcessor();

    await processor.process({ name: 'unknown', data: {} } as never);

    expect(refreshEventWeatherById).not.toHaveBeenCalled();
    expect(scheduleUpcomingEventRefreshes).not.toHaveBeenCalled();
  });

  function createProcessor(): WeatherProcessor {
    return new WeatherProcessor({ refreshEventWeatherById, scheduleUpcomingEventRefreshes } as never);
  }
});
