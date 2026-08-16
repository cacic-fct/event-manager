import { Logger } from '@nestjs/common';
import { EventFormsScheduler } from './event-forms.scheduler';

describe('EventFormsScheduler', () => {
  const publishDueScheduledForms = jest.fn<Promise<number>, []>();
  const notifyDueAvailableLinks = jest.fn<Promise<number>, []>();
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    publishDueScheduledForms.mockReset().mockResolvedValue(0);
    notifyDueAvailableLinks.mockReset().mockResolvedValue(0);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('publishes and notifies on startup and every thirty seconds', async () => {
    const scheduler = createScheduler();

    scheduler.onModuleInit();
    await flushPromises();

    expect(publishDueScheduledForms).toHaveBeenCalledTimes(1);
    expect(notifyDueAvailableLinks).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(30_000);

    expect(publishDueScheduledForms).toHaveBeenCalledTimes(2);
    expect(notifyDueAvailableLinks).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
  });

  it('reports singular and plural work without logging empty runs', async () => {
    publishDueScheduledForms.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValue(0);
    notifyDueAvailableLinks.mockResolvedValueOnce(1).mockResolvedValueOnce(2).mockResolvedValue(0);
    const scheduler = createScheduler();

    scheduler.onModuleInit();
    await flushPromises();
    await jest.advanceTimersByTimeAsync(30_000);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(log).toHaveBeenCalledWith('Published 1 scheduled event form.');
    expect(log).toHaveBeenCalledWith('Sent 1 event form availability notification.');
    expect(log).toHaveBeenCalledWith('Published 2 scheduled event forms.');
    expect(log).toHaveBeenCalledWith('Sent 2 event form availability notifications.');
    expect(log).toHaveBeenCalledTimes(4);
    scheduler.onModuleDestroy();
  });

  it('does not overlap runs while publication is still pending', async () => {
    let resolvePublication: ((count: number) => void) | undefined;
    publishDueScheduledForms.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          resolvePublication = resolve;
        }),
    );
    const scheduler = createScheduler();

    scheduler.onModuleInit();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(publishDueScheduledForms).toHaveBeenCalledTimes(1);
    expect(notifyDueAvailableLinks).not.toHaveBeenCalled();

    resolvePublication?.(0);
    await flushPromises();
    await jest.advanceTimersByTimeAsync(30_000);

    expect(publishDueScheduledForms).toHaveBeenCalledTimes(2);
    scheduler.onModuleDestroy();
  });

  it('contains failures and allows the following interval to retry', async () => {
    publishDueScheduledForms.mockRejectedValueOnce(new Error('database unavailable')).mockResolvedValue(0);
    const scheduler = createScheduler();

    scheduler.onModuleInit();
    await flushPromises();

    expect(warn).toHaveBeenCalledWith('Scheduled event form publication failed: database unavailable');
    expect(notifyDueAvailableLinks).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(30_000);

    expect(publishDueScheduledForms).toHaveBeenCalledTimes(2);
    expect(notifyDueAvailableLinks).toHaveBeenCalledTimes(1);
    scheduler.onModuleDestroy();
  });

  it('stops periodic work when the module is destroyed', async () => {
    const scheduler = createScheduler();
    scheduler.onModuleInit();
    await flushPromises();

    scheduler.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(publishDueScheduledForms).toHaveBeenCalledTimes(1);
  });

  function createScheduler(): EventFormsScheduler {
    return new EventFormsScheduler({ publishDueScheduledForms, notifyDueAvailableLinks } as never);
  }
});

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
