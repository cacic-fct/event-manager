import { EventSubscriptionCountersService } from './subscription-counters.service';

describe('EventSubscriptionCountersService', () => {
  function createService() {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const service = new EventSubscriptionCountersService();

    return { service, tx };
  }

  it('does not run an update when there are no event ids', async () => {
    const { service, tx } = createService();

    await expect(service.refresh(tx as never, [])).resolves.toBeUndefined();
    await expect(service.refresh(tx as never, ['', undefined as unknown as string])).resolves.toBeUndefined();

    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('refreshes each unique event id with queue and slot counters', async () => {
    const { service, tx } = createService();

    await service.refresh(tx as never, ['event-1', 'event-2', 'event-1', '']);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const [firstStrings, ...firstValues] = tx.$executeRaw.mock.calls[0];
    const [, ...secondValues] = tx.$executeRaw.mock.calls[1];

    expect(firstValues).toEqual(['event-1', 'event-1', 'event-1']);
    expect(secondValues).toEqual(['event-2', 'event-2', 'event-2']);
    expect(firstStrings.join('${value}')).toContain('UPDATE "events" event');
    expect(firstStrings.join('${value}')).toContain('"queueCount"');
    expect(firstStrings.join('${value}')).toContain('"slotsAvailable"');
    expect(firstStrings.join('${value}')).toContain('"subscriptionStatus" NOT IN');
  });
});
