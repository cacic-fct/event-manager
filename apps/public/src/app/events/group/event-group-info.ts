import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { EventInformationNav } from '../../shared/event-information-nav';
import type { ParticipationEventStatus } from '../../shared/participation-status-icons';
import type { PublicEvent, PublicEventGroup } from '@cacic-fct/event-manager-public-contracts';
import { compareIsoDateAsc, formatDateRange } from '@cacic-fct/shared-utils';
import { CalendarEventListItem } from '../../calendar/event-list/event-list-item';
import { StickyDateHeader } from '../../shared/sticky-date-header';
import { eventProgramDays } from '../../shared/event-program-days';
import { EventDetailHeading } from '../../shared/event-detail-heading';

@Component({
  selector: 'app-event-group-info',
  imports: [
    MatButtonModule,
    MatIconModule,
    RouterLink,
    EventInformationNav,
    CalendarEventListItem,
    EventDetailHeading,
    StickyDateHeader,
  ],
  templateUrl: './event-group-info.html',
  styleUrl: './event-group-info.css',
})
export class EventGroupInfo {
  readonly group = input.required<PublicEventGroup>();
  readonly events = input<PublicEvent[]>([]);
  readonly backUrl = input('/calendar');
  readonly parentMajorEventId = input<string | null>(null);
  readonly parentMajorEventName = computed(
    () => this.events().find((event) => event.majorEvent?.id === this.parentMajorEventId())?.majorEvent?.name,
  );
  readonly isAuthenticated = input(false);
  readonly hasParticipation = input(false);
  readonly participationStatuses = input<Record<string, ParticipationEventStatus>>({});
  readonly participationLoading = input(false);
  readonly participationPending = input(false);
  readonly loading = input(false);
  readonly error = input(false);
  readonly retry = output<void>();

  readonly programDays = computed(() => eventProgramDays(this.events()));

  readonly orderedEvents = computed(() =>
    [...this.events()].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate)),
  );
  readonly returnUrl = computed(() => `/event-group/${this.group().id}`);
  readonly dateLabel = computed(() => {
    const events = this.orderedEvents();
    if (!events.length) return null;
    const end = events.reduce(
      (latest, event) => (compareIsoDateAsc(event.endDate, latest) > 0 ? event.endDate : latest),
      events[0].endDate,
    );
    return formatDateRange(events[0].startDate, end);
  });
  readonly workloadLabel = computed(() => {
    const events = this.events();
    if (!events.length || events.some((event) => event.creditMinutes == null)) return null;
    const minutes = events.reduce((total, event) => total + (event.creditMinutes ?? 0), 0);
    if (minutes <= 0) return null;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return [hours ? `${hours}h` : '', remainder ? `${remainder}min` : ''].filter(Boolean).join(' ');
  });
}
