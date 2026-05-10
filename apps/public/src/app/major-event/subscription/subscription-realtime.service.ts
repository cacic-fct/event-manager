import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { RealtimeEventsService } from '../../shared/realtime-events.service';
import type { PublicEventSubscriptionSummary } from './subscription-api.service';
import { z } from 'zod';

const subscriptionDeltaSchema = z.object({
  subscriptionSummaries: z.array(
    z.object({
      eventId: z.string(),
      slots: z.number().nullable().optional(),
      availableSlots: z.number().nullable().optional(),
      hasAvailableSlots: z.boolean(),
      queueCount: z.number(),
    }),
  ),
});

export interface MajorEventSubscriptionRealtimeDelta {
  subscriptionSummaries: PublicEventSubscriptionSummary[];
}

interface MajorEventSubscriptionRealtimeMessage {
  type?: string;
  channel?: string;
  event?: string;
  majorEventId?: string;
  payload?: MajorEventSubscriptionRealtimeDelta;
}

const MAJOR_EVENT_SUBSCRIPTION_CHANNEL = 'public.major-event-subscription';

@Injectable({ providedIn: 'root' })
export class MajorEventSubscriptionRealtimeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly realtime = inject(RealtimeEventsService);

  watch(majorEventId: string): Observable<MajorEventSubscriptionRealtimeDelta> {
    return new Observable((subscriber) => {
      if (!isPlatformBrowser(this.platformId)) {
        subscriber.complete();
        return undefined;
      }

      const subscription = this.realtime
        .watchMajorEvent(majorEventId)
        .pipe(
          filter(
            (
              message,
            ): message is MajorEventSubscriptionRealtimeMessage & {
              payload: MajorEventSubscriptionRealtimeDelta;
            } =>
              message.type === 'event' &&
              message.channel === MAJOR_EVENT_SUBSCRIPTION_CHANNEL &&
              message.event === 'majorEventSubscriptionChanged' &&
              message.majorEventId === majorEventId &&
              subscriptionDeltaSchema.safeParse(message.payload).success,
          ),
          map((message) => message.payload),
        )
        .subscribe(subscriber);

      return () => subscription.unsubscribe();
    });
  }
}
