import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { formatTimeRange, getEventTypeLabel } from '@cacic-fct/shared-utils';
import { EmojiService } from '../../shared/emoji.service';
import { formatPublicTimeRange } from '../../shared/public-local-date';
import { ParticipationStatusIcons, type ParticipationEventStatus } from '../../shared/participation-status-icons';

export interface CalendarListItemData {
  id: string;
  name: string;
  emoji: string;
  startDate: string | Date;
  endDate: string | Date;
  contextLine: string;
  contextLines?: readonly string[];
  eventType?: string | null;
  secondaryLines?: readonly string[];
  participationStatus?: ParticipationEventStatus | null;
  locationDescription?: string | null;
  expiresAt?: string | null;
  expiresLabel?: string;
  route: string | Array<string | number> | null;
  returnUrl?: string | null;
  /** Optional action hint; visible row text remains the accessible link name. */
  ariaLabel?: string;
}

@Component({
  selector: 'app-calendar-list-item',
  imports: [DatePipe, MatListModule, MatIconModule, RouterLink, ParticipationStatusIcons],
  templateUrl: './calendar-list-item.html',
  styleUrl: './calendar-list-item.css',
})
export class CalendarListItem {
  readonly item = input.required<CalendarListItemData>();
  readonly usePublicTimeZone = input(false);
  readonly iconPosition = input<'leading' | 'top'>('leading');
  readonly emoji = inject(EmojiService);

  readonly queryParams = computed(() => {
    const returnUrl = this.item().returnUrl;
    return returnUrl ? { returnUrl } : null;
  });

  readonly contextLines = computed(() => {
    const item = this.item();
    const candidates = item.contextLines?.length ? item.contextLines : [item.contextLine];
    return candidates.filter((line, index) => line && line !== item.name && candidates.indexOf(line) === index);
  });

  readonly timeRangeLabel = computed(() => {
    const item = this.item();
    if (this.usePublicTimeZone()) {
      return formatPublicTimeRange(new Date(item.startDate), new Date(item.endDate));
    }
    const start = item.startDate instanceof Date ? item.startDate.toISOString() : item.startDate;
    const end = item.endDate instanceof Date ? item.endDate.toISOString() : item.endDate;
    return formatTimeRange(start, end);
  });
  readonly hasSubtitle = computed(() => {
    const item = this.item();
    return Boolean(this.contextLines().length > 0 || item.eventType || item.secondaryLines?.length || item.expiresAt);
  });

  eventTypeLabel(type: string): string {
    return getEventTypeLabel(type);
  }
}
