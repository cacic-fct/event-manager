import { Service, inject } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import type { EventTargetType } from '@cacic-fct/event-manager-public-contracts';
import {
  buildDetailViewModel,
  type EventDetails,
  type EventGroupDetails,
  type MajorEventDetails,
} from '@cacic-fct/shared-utils';
import { catchError, defer, from, map, of, switchMap, throwError } from 'rxjs';
import type { EventPageData } from '../events/detail/event-api.service';
import { AttendancesApiService } from '../profile/attendance/attendances-api.service';
import { NetworkStatusService } from './network-status.service';

/** Keeps historical and saved participation readable when the public catalog is unavailable. */
@Service()
export class EventInformationFallbackService {
  private readonly auth = inject(AuthService);
  private readonly api = inject(AttendancesApiService);
  private readonly offline = inject(PublicDataAccessService);
  private readonly network = inject(NetworkStatusService);

  eventPage(eventId: string, originalError: unknown) {
    return this.savedDetails('event', eventId).pipe(
      switchMap((saved) => {
        if (saved?.eventType === 'event') return of(saved.details);
        return this.network.isOnline() && this.auth.user()?.sub
          ? this.api.getEventDetails(eventId)
          : throwError(() => originalError);
      }),
      map((details: EventDetails): EventPageData => {
        const event = details.subscription?.event ?? details.event;
        if (!event || !buildDetailViewModel({ eventType: 'event', details })) throw originalError;
        return {
          event,
          currentUserSubscription: details.subscription,
          currentUserAttendance: details.attendance,
          subscriptionSummary: {
            eventId,
            hasAvailableSlots: false,
            availableSlots: null,
            projectedQueuePosition: 0,
          },
          weather: null,
        };
      }),
    );
  }

  majorEvent(majorEventId: string, originalError: unknown) {
    return this.savedDetails('major-event', majorEventId).pipe(
      switchMap((saved) => {
        if (saved?.eventType === 'major-event') return of(saved.details);
        return this.network.isOnline() && this.auth.user()?.sub
          ? this.api.getMajorEventDetails(majorEventId)
          : throwError(() => originalError);
      }),
      map((details: MajorEventDetails) => {
        const event = details.subscription?.majorEvent ?? details.majorEvent;
        if (!event || !buildDetailViewModel({ eventType: 'major-event', details })) throw originalError;
        return { event, details };
      }),
    );
  }

  eventGroup(eventGroupId: string, originalError: unknown) {
    return this.savedDetails('event-group', eventGroupId).pipe(
      switchMap((saved) => {
        if (saved?.eventType === 'event-group') return of(saved.details);
        return this.network.isOnline() && this.auth.user()?.sub
          ? this.api.getEventGroupDetails(eventGroupId)
          : throwError(() => originalError);
      }),
      map((details: EventGroupDetails) => {
        const group = details.subscription?.eventGroup ?? details.eventGroup;
        if (!group || !buildDetailViewModel({ eventType: 'event-group', details })) throw originalError;
        return { group, events: details.subscription?.events ?? details.events ?? [] };
      }),
    );
  }

  private savedDetails(targetType: EventTargetType, targetId: string) {
    return defer(() => {
      const userId = this.auth.user()?.sub;
      if (!userId) return of(null);
      return from(this.offline.getAttendanceDetail(userId, targetType, targetId));
    }).pipe(catchError(() => of(null)));
  }
}
