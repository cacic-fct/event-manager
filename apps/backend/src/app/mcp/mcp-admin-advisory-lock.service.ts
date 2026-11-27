import { Injectable } from '@nestjs/common';
import { Client } from 'pg';

@Injectable()
export class McpAdminAdvisoryLockService {
  async run(eventId: string, operation: () => Promise<void>): Promise<void> {
    await this.withLock(`mcp-event-content:${eventId}`, operation);
  }

  runForCommand<T>(id: string, operation: () => Promise<T>): Promise<T | undefined> {
    return this.withLock(`mcp-admin-command:${id}`, operation);
  }

  private async withLock<T>(key: string, operation: () => Promise<T>): Promise<T | undefined> {
    // Use a dedicated session so ownership spans the domain transactions and
    // their awaited side effects. PostgreSQL releases it when the session ends.
    const client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
    client.on('error', () => undefined);
    try {
      await client.connect();
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [key],
      );
      if (result.rows[0]?.acquired) return await operation();
      return undefined;
    } finally {
      // Closing this unpooled session releases its advisory lock, including on failure.
      await client.end();
    }
  }
}
