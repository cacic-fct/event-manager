import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { PublicEvent } from '@cacic-fct/shared-utils';
import { getEventTypeLabel } from '@cacic-fct/shared-utils';
import { isSameDay, isSameMonth, parseISO } from 'date-fns';
import { EmojiService } from '../../profile/attendances/emoji.service';
import type { PublicEventSubscriptionSummary } from './subscription-api.service';

interface SubscriptionListMonth {
  key: string;
  label: string;
  days: SubscriptionListDay[];
}

interface SubscriptionListDay {
  key: string;
  label: string;
  groups: SubscriptionListGroup[];
}

interface SubscriptionListGroup {
  key: string;
  label?: string;
  events: PublicEvent[];
}

@Component({
  selector: 'app-subscription-event-list',
  imports: [DatePipe, MatButtonModule, MatCheckboxModule, MatIconModule, MatListModule, MatTooltipModule],
  templateUrl: './subscription-event-list.html',
  styleUrl: './subscription-event-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionEventList {
  readonly events = input.required<PublicEvent[]>();
  readonly summariesByEventId = input.required<Map<string, PublicEventSubscriptionSummary>>();
  readonly selectedEventIds = input.required<ReadonlySet<string>>();
  readonly autoSelectedEventIds = input.required<ReadonlySet<string>>();
  readonly disabledReasons = input.required<ReadonlyMap<string, string>>();
  readonly toggleEvent = output<PublicEvent>();
  readonly openInfo = output<PublicEvent>();

  readonly emoji = inject(EmojiService);

  readonly groupedEvents = computed(() => this.groupByMonthDayAndGroup());

  isSelected(event: PublicEvent): boolean {
    return this.selectedEventIds().has(event.id);
  }

  isDisabled(event: PublicEvent): boolean {
    return this.disabledReasons().has(event.id);
  }

  isAutoSelected(event: PublicEvent): boolean {
    return this.autoSelectedEventIds().has(event.id);
  }

  eventTypeLabel(event: PublicEvent): string {
    return getEventTypeLabel(event.type);
  }

  slotsLine(event: PublicEvent): string {
    const summary = this.summariesByEventId().get(event.id);
    if (!summary?.hasAvailableSlots) {
      return 'Sem vagas disponíveis';
    }

    return 'Vagas disponíveis';
  }

  onItemClick(event: PublicEvent): void {
    if (this.isDisabled(event) || this.isAutoSelected(event)) {
      return;
    }

    this.toggleEvent.emit(event);
  }

  private groupByMonthDayAndGroup(): SubscriptionListMonth[] {
    const sortedEvents = [...this.events()].sort(
      (left, right) => Date.parse(left.startDate) - Date.parse(right.startDate),
    );
    const months: SubscriptionListMonth[] = [];

    for (const event of sortedEvents) {
      const eventDate = parseISO(event.startDate);
      const lastMonth = months.at(-1);
      let month = lastMonth;

      if (!month || !isSameMonth(parseISO(month.key), eventDate)) {
        month = {
          key: event.startDate,
          label: this.formatMonth(event.startDate),
          days: [],
        };
        months.push(month);
      }

      const lastDay = month.days.at(-1);
      let day = lastDay;

      if (!day || !isSameDay(parseISO(day.key), eventDate)) {
        day = {
          key: event.startDate,
          label: this.formatDay(event.startDate),
          groups: [],
        };
        month.days.push(day);
      }

      const groupKey = event.eventGroupId ?? event.id;
      let group = day.groups.find((item) => item.key === groupKey);
      if (!group) {
        group = {
          key: groupKey,
          label: event.eventGroup?.name,
          events: [],
        };
        day.groups.push(group);
      }

      group.events.push(event);
    }

    return months;
  }

  private formatMonth(date: string): string {
    const formatted = formatDate(date, 'MMMM', 'pt-BR');
    return this.capitalize(formatted);
  }

  private formatDay(date: string): string {
    const formatted = formatDate(date, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR');
    return this.capitalize(formatted);
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
