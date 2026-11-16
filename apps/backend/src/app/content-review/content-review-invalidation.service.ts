import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RealtimeInvalidationService } from '../realtime/realtime-invalidation.service';

@Injectable()
export class ContentReviewInvalidationService {
  constructor(private readonly realtime: RealtimeInvalidationService) {}

  scope(): string {
    return this.realtime.scope('admin-content-reviews');
  }

  async publish(eventId: string | null): Promise<void> {
    // Replay deduplicates identical payloads. Distinct commits need distinct cursors.
    await this.realtime.publish(this.scope(), { eventId, revision: randomUUID() });
  }
}
