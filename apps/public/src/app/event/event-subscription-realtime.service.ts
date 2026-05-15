import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, filter, map } from 'rxjs';
import { z } from 'zod';
import { RealtimeEventsService } from '../shared/realtime-events.service';

const eventSubscriptionAvailabilitySchema = z.object({
  eventId: z.string(),
  hasAvailableSlots: z.boolean(),
});

export interface EventSubscriptionAvailability {
  eventId: string;
  hasAvailableSlots: boolean;
}

interface EventSubscriptionRealtimeMessage {
  type?: string;
  channel?: string;
  event?: string;
  eventId?: string;
  payload?: EventSubscriptionAvailability;
}

const EVENT_SUBSCRIPTION_CHANNEL = 'current-user.event-subscription';

@Injectable({ providedIn: 'root' })
export class EventSubscriptionRealtimeService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly realtime = inject(RealtimeEventsService);

  watch(eventId: string): Observable<EventSubscriptionAvailability> {
    return new Observable((subscriber) => {
      if (!isPlatformBrowser(this.platformId)) {
        subscriber.complete();
        return undefined;
      }

      const subscription = this.realtime
        .watchEvent(eventId)
        .pipe(
          filter(
            (
              message,
            ): message is EventSubscriptionRealtimeMessage & {
              payload: EventSubscriptionAvailability;
            } =>
              message.type === 'event' &&
              message.channel === EVENT_SUBSCRIPTION_CHANNEL &&
              message.event === 'eventSubscriptionAvailabilityChanged' &&
              message.eventId === eventId &&
              eventSubscriptionAvailabilitySchema.safeParse(message.payload).success,
          ),
          map((message) => message.payload),
        )
        .subscribe(subscriber);

      return () => subscription.unsubscribe();
    });
  }
}
