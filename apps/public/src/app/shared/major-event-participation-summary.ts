import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { formatDateTime } from '@cacic-fct/shared-utils';

export interface GroupParticipationCounts {
  subscribed: number;
  attended: number;
}

@Component({
  selector: 'app-major-event-participation-summary',
  imports: [MatIconModule],
  template: `
    <section aria-labelledby="major-participation-heading">
      <h2 id="major-participation-heading">Sua participação</h2>
      @if (subscriptionLabel(); as label) {
        <p>
          <mat-icon aria-hidden="true">event_available</mat-icon>
          <span>{{ label }}</span>
        </p>
      }
      @if (groupCounts(); as counts) {
        @if (counts.attended > 0) {
          <p>
            <mat-icon aria-hidden="true">how_to_reg</mat-icon>
            <span>{{ groupAttendanceLabel() }}.</span>
          </p>
        }
      } @else if (attendanceLabel(); as label) {
        <p>
          <mat-icon aria-hidden="true">how_to_reg</mat-icon>
          <span
            >Presença registrada em <time [attr.datetime]="attendanceAt()">{{ label }}</time></span
          >
        </p>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    h2 {
      margin: 0 0 12px;
      font: var(--mat-sys-title-large);
    }
    p {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      max-width: 65ch;
      margin: 8px 0 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-medium);
    }
    mat-icon {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      font-size: 20px;
      color: var(--mat-sys-primary);
    }
  `,
})
export class MajorEventParticipationSummary {
  readonly majorEventName = input<string | null>(null);
  readonly isSubscribed = input(false);
  readonly attendanceAt = input<string | null>(null);
  readonly groupCounts = input<GroupParticipationCounts | null>(null);

  protected readonly subscriptionLabel = computed(() => {
    const name = this.majorEventName();
    const registration = name ? `na sua inscrição em ${name}` : 'na sua inscrição';
    const counts = this.groupCounts();
    if (!counts) {
      return this.isSubscribed() ? `Este evento está incluído ${registration}.` : null;
    }
    if (!counts.subscribed) return null;
    const events =
      counts.subscribed === 1 ? '1 evento do grupo incluído' : `${counts.subscribed} eventos do grupo incluídos`;
    return `${events} ${registration}.`;
  });
  protected readonly groupAttendanceLabel = computed(() => {
    const attended = this.groupCounts()?.attended ?? 0;
    return attended === 1 ? 'Presença registrada em 1 evento' : `Presença registrada em ${attended} eventos`;
  });
  protected readonly attendanceLabel = computed(() => {
    const attendanceAt = this.attendanceAt();
    return attendanceAt ? formatDateTime(attendanceAt) : null;
  });
}
