import { EventSubscriptionCountersService } from './subscription-counters.service';
import { PGlite } from '@electric-sql/pglite';
import { subscriptionCountersFixtureSql } from './subscription-counters.testing';
const { jest } = import.meta;

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

  it('refreshes unique event ids in one parameterized statement', async () => {
    const { service, tx } = createService();

    await service.refresh(tx as never, ['event-1', 'event-2', 'event-1', '']);

    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [firstStrings, ...firstValues] = tx.$executeRaw.mock.calls[0];

    expect(firstValues).toEqual([['event-1', 'event-2']]);
    expect(firstStrings.join('${value}')).toContain('UPDATE "events" event');
    expect(firstStrings.join('${value}')).toContain('"queueCount"');
    expect(firstStrings.join('${value}')).toContain('"slotsAvailable"');
    expect(firstStrings.join('${value}')).toContain('"subscriptionStatus" NOT IN');
    expect(firstStrings.join('${value}')).toContain('FOR NO KEY UPDATE');
    expect(firstStrings.join('${value}')).toContain('IS DISTINCT FROM');
  });

  it('preserves queue and slot semantics and skips unchanged rows in PostgreSQL', async () => {
    const database = new PGlite();
    try {
      await database.exec(subscriptionCountersFixtureSql);
      const affectedRows: number[] = [];
      const tx = {
        $executeRaw: jest.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const sql = strings.reduce(
            (text, part, index) => text + part + (index < values.length ? `$${index + 1}` : ''),
            '',
          );
          const result = await database.query(sql, values);
          affectedRows.push(result.affectedRows ?? 0);
          return result.affectedRows ?? 0;
        }),
      };
      const service = new EventSubscriptionCountersService();
      const ids = ['unlimited', 'limited', 'overbooked', 'limited', 'missing'];

      await service.refresh(tx as never, ids);
      await service.refresh(tx as never, ids);

      expect(affectedRows).toEqual([3, 0]);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
      const { rows } = await database.query('SELECT id, "queueCount", "slotsAvailable" FROM events ORDER BY id');
      expect(rows).toEqual([
        { id: 'limited', queueCount: 2, slotsAvailable: 3 },
        { id: 'overbooked', queueCount: 1, slotsAvailable: -1 },
        { id: 'unlimited', queueCount: 1, slotsAvailable: null },
        { id: 'untouched', queueCount: 99, slotsAvailable: 88 },
      ]);
    } finally {
      await database.close();
    }
  }, 15_000);
});
