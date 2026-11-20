import { Injectable } from '@nestjs/common';
import { Client } from 'pg';

@Injectable()
export class McpEventContentSyncLockService {
  async run(eventId: string, operation: () => Promise<void>): Promise<void> {
    // A dedicated session owns this lock until the awaited external write settles.
    // Unlike the recovery lease, it cannot expire while a live worker is writing.
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    client.on('error', () => undefined);
    try {
      await client.connect();
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [`mcp-event-content:${eventId}`],
      );
      if (result.rows[0]?.acquired) await operation();
    } finally {
      // Closing this unpooled session releases its advisory lock, including on failure.
      await client.end();
    }
  }
}
