import { Component, computed, input } from '@angular/core';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { getEventTypeLabel } from '@cacic-fct/shared-utils';
import { CalendarListItem } from './calendar-list-item';

@Component({
  selector: 'app-calendar-event-list-item',
  imports: [CalendarListItem],
  templateUrl: './event-list-item.html',
  styleUrl: './event-list-item.css',
})
export class CalendarEventListItem {
  readonly event = input.required<PublicEvent>();
  readonly isSubscribed = input(false);
  readonly participationStatus = input<string | null>(null);
  readonly returnUrl = input('/calendar');
  readonly showMajorEventContext = input(true);
  readonly showEventGroupContext = input(true);
  readonly iconPosition = input<'leading' | 'top'>('top');
  readonly eventTypeLabel = computed(() => getEventTypeLabel(this.event().type));
  readonly detailRoute = computed(() => {
    const sportsMatchId = this.event().sportsMatch?.id;
    return sportsMatchId ? ['/sports/match', sportsMatchId] : ['/event', this.event().id];
  });

  readonly contextLines = computed(() => {
    const event = this.event();
    return [
      this.showMajorEventContext() ? event.majorEvent?.name : null,
      this.showEventGroupContext() ? event.eventGroup?.name : null,
      event.shortDescription,
    ].filter((line): line is string => Boolean(line));
  });

  readonly secondaryLines = computed(() => {
    const status = this.participationStatus();
    return status ? [status] : this.isSubscribed() ? ['Inscrito'] : [];
  });

  readonly listItem = computed(() => ({
    id: this.event().id,
    name: this.event().name,
    emoji: this.event().emoji,
    startDate: this.event().startDate,
    endDate: this.event().endDate,
    contextLine: this.contextLines()[0] ?? '',
    contextLines: this.contextLines(),
    eventType: this.event().type,
    secondaryLines: this.secondaryLines(),
    locationDescription: this.event().isVirtual
      ? 'Online'
      : this.event().locationName?.trim() || this.event().locationDescription?.trim(),
    route: this.detailRoute(),
    returnUrl: this.returnUrl(),
    ariaLabel: `Abrir evento ${this.event().name}`,
  }));
}
