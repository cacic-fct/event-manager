import { LgpdStorageCleanupProcessor } from './lgpd-storage-cleanup.processor';

describe('LgpdStorageCleanupProcessor', () => {
  it('rejects unknown and malformed jobs', async () => {
    const cleanup = { reconcile: jest.fn(), process: jest.fn() };
    const processor = new LgpdStorageCleanupProcessor(cleanup as never);

    await expect(processor.process({ name: 'unknown', data: {} } as never)).rejects.toThrow('Unsupported');
    await expect(processor.process({ name: 'delete-object', data: {} } as never)).rejects.toThrow('Malformed');
  });

  it('dispatches reconcile and valid object jobs', async () => {
    const cleanup = {
      reconcile: jest.fn().mockResolvedValue(undefined),
      process: jest.fn().mockResolvedValue(undefined),
    };
    const processor = new LgpdStorageCleanupProcessor(cleanup as never);

    await processor.process({ name: 'reconcile', data: {} } as never);
    await processor.process({ name: 'delete-object', data: { outboxId: 'outbox-1' } } as never);

    expect(cleanup.reconcile).toHaveBeenCalledTimes(1);
    expect(cleanup.process).toHaveBeenCalledWith({ outboxId: 'outbox-1' });
  });
});
