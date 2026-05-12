import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import type { PublicEvent, PublicMajorEvent } from '@cacic-fct/shared-utils';
import { isSameDay, isSameMonth, parseISO } from 'date-fns';
import { EmojiService } from '../../profile/attendances/emoji.service';

export interface ConfirmSubscriptionDialogData {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
}

interface ConfirmSubscriptionListMonth {
  key: string;
  label: string;
  days: ConfirmSubscriptionListDay[];
}

interface ConfirmSubscriptionListDay {
  key: string;
  label: string;
  events: PublicEvent[];
}

@Component({
  selector: 'app-confirm-subscription-dialog',
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatListModule],
  templateUrl: './confirm-subscription-dialog.html',
  styleUrl: './confirm-subscription-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmSubscriptionDialog {
  private readonly dialogRef = inject(MatDialogRef<ConfirmSubscriptionDialog>);
  readonly data = inject<ConfirmSubscriptionDialogData>(MAT_DIALOG_DATA);
  readonly emoji = inject(EmojiService);

  readonly groupedEvents = computed(() => this.groupByMonthAndDay(this.data.events));

  confirm(): void {
    this.dialogRef.close(true);
  }

  close(): void {
    this.dialogRef.close(false);
  }

  private groupByMonthAndDay(events: PublicEvent[]): ConfirmSubscriptionListMonth[] {
    const sortedEvents = [...events].sort(
      (left, right) => Date.parse(left.startDate) - Date.parse(right.startDate),
    );
    const months: ConfirmSubscriptionListMonth[] = [];

    for (const event of sortedEvents) {
      const eventDate = parseISO(event.startDate);
      let month = months.at(-1);

      if (!month || !isSameMonth(parseISO(month.key), eventDate)) {
        month = {
          key: event.startDate,
          label: this.capitalize(formatDate(event.startDate, "MMMM 'de' yyyy", 'pt-BR')),
          days: [],
        };
        months.push(month);
      }

      let day = month.days.at(-1);
      if (!day || !isSameDay(parseISO(day.key), eventDate)) {
        day = {
          key: event.startDate,
          label: this.capitalize(formatDate(event.startDate, "EEEE, dd 'de' MMMM 'de' yyyy", 'pt-BR')),
          events: [],
        };
        month.days.push(day);
      }

      day.events.push(event);
    }

    return months;
  }

  private capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
