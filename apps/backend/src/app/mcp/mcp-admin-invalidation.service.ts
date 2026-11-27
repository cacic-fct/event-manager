import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';

@Injectable()
export class McpAdminInvalidationService {
  private readonly logger = new Logger(McpAdminInvalidationService.name);

  constructor(private readonly realtime: RealtimeInvalidationService) {}

  scope(userId: string): string {
    return this.realtime.scope('admin-mcp', userId);
  }

  async publish(userId: string): Promise<void> {
    try {
      // New commits need distinct replay cursors; no proposal content crosses SSE.
      await this.realtime.publish(this.scope(userId), { type: 'MCP_QUEUE_INVALIDATED', revision: randomUUID() });
    } catch {
      // The shared client refreshes on reconnect; a committed decision remains successful.
      this.logger.warn('MCP queue invalidation could not be delivered; reconnect refresh will recover.');
    }
  }
}
