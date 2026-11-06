import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { runSerializablePrismaTransaction } from '../common/serializable-prisma-transaction';
import type { PrismaService } from '../prisma/prisma.service';
import { EventSubscriptionCountersService } from './subscription-counters.service';
import { subscriptionCountersFixtureSql } from './subscription-counters.testing';

const databaseUrl = process.env['SUBSCRIPTION_COUNTERS_TEST_DATABASE_URL'];

describe('subscription counters with overlapping PostgreSQL transactions', () => {
  it('retries serialization conflicts and counts both committed subscriptions', async () => {
    const url = new URL(databaseUrl ?? '');
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/fct_app_subscription_counters_test' ||
      url.search ||
      url.hash
    ) {
      throw new Error('Use a loopback fct_app_subscription_counters_test database.');
    }
    const schema = `counters_${randomUUID().replaceAll('-', '')}`;
    const admin = new Pool({ connectionString: databaseUrl });
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl, options: `-c search_path=${schema}`, max: 2 }),
    });
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      // SQL fixtures only: no application migrations or application tables are changed.
      const setup = await admin.connect();
      try {
        await setup.query(`SET search_path TO "${schema}"`);
        await setup.query(subscriptionCountersFixtureSql);
        await setup.query(`INSERT INTO events VALUES ('concurrent', 5, 0, 5)`);
      } finally {
        setup.release();
      }
      let arrivals = 0;
      let release: () => void = () => undefined;
      const bothSnapshotsEstablished = new Promise<void>((resolve) => {
        release = resolve;
      });
      const attempts = [0, 0];
      const service = new EventSubscriptionCountersService();
      const subscribe = (index: number) =>
        runSerializablePrismaTransaction(
          prisma as PrismaService,
          async (tx) => {
            attempts[index] += 1;
            // Establish both serializable snapshots before either transaction changes counters.
            await tx.$queryRaw`SELECT id FROM events WHERE id = 'concurrent'`;
            if (attempts[index] === 1) {
              arrivals += 1;
              if (arrivals === 2) release();
              await bothSnapshotsEstablished;
            }
            await tx.$executeRaw`INSERT INTO event_subscriptions ("eventId") VALUES ('concurrent')`;
            await tx.$executeRaw`
            INSERT INTO major_event_subscription_event_selections ("eventId", "subscriptionId")
            VALUES ('concurrent', ${index === 0 ? 'pending' : 'review'})
          `;
            await service.refresh(tx, ['concurrent']);
          },
          { timeout: 5_000 },
        );
      // Wait for both operations even if one fails, so cleanup cannot race an active transaction.
      const results = await Promise.allSettled([subscribe(0), subscribe(1)]);
      expect(results).toEqual([
        { status: 'fulfilled', value: undefined },
        { status: 'fulfilled', value: undefined },
      ]);
      expect(arrivals).toBe(2);
      expect(attempts.sort()).toEqual([1, 2]);
      expect(
        await prisma.$queryRaw`
        SELECT "queueCount", "slotsAvailable" FROM events WHERE id = 'concurrent'
      `,
      ).toEqual([{ queueCount: 2, slotsAvailable: 3 }]);
      expect(
        await prisma.$queryRaw`
        SELECT COUNT(*)::integer AS count FROM event_subscriptions WHERE "eventId" = 'concurrent'
      `,
      ).toEqual([{ count: 2 }]);
    } finally {
      await prisma.$disconnect();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  }, 15_000);
});
