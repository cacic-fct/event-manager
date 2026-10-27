import type { EventNotificationAudience } from '@cacic-fct/shared-event-preparation';
import { AuditLogActorType } from '@prisma/client';

export const EVENT_MANUAL_NOTIFICATION_QUEUE = 'event-manual-notification';
export interface EventManualNotificationJob {
  audience: EventNotificationAudience;
  eventId: string;
  requestId: string;
  message: string;
  personIds: string[];
  actor: { id: string; name: string; type: AuditLogActorType };
}
