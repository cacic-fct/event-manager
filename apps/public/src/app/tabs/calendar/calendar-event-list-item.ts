import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { PublicEvent, getEventTypeLabel } from '@cacic-eventos/shared-utils';
import { EmojiService } from '../../profile/attendances/emoji.service';

@Component({
  selector: 'app-calendar-event-list-item',
  imports: [DatePipe, MatListModule, RouterLink],
  templateUrl: './calendar-event-list-item.html',
  styleUrl: './calendar-event-list-item.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarEventListItem {
  readonly event = input.required<PublicEvent>();
  readonly returnUrl = input('/calendar');
  readonly emoji = inject(EmojiService);

  readonly eventTypeLabel = computed(() =>
    getEventTypeLabel(this.event().type),
  );

  readonly contextLine = computed(() => {
    const event = this.event();

    return (
      event.majorEvent?.name ??
      event.eventGroup?.name ??
      event.shortDescription ??
      this.eventTypeLabel()
    );
  });
}
