import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { formatDateTime } from '@cacic-fct/shared-utils';

export interface ParticipationEventStatus {
  isSubscribed: boolean;
  attendanceAt?: string | null;
}

export interface ParticipationStatusIcon {
  label: string;
  icon: string;
  showLabel?: boolean;
  visibleTimestamp?: string;
}

export function getParticipationStatusItems(statusLine: string): ParticipationStatusIcon[] {
  return statusLine
    .split(', ')
    .filter(Boolean)
    .map((label) => ({ label, icon: participationStatusIcon(label) }));
}

function participationStatusIcon(label: string): string {
  if (label.startsWith('Presença registrada')) {
    return 'how_to_reg';
  }

  switch (label) {
    case 'Inscrito':
      return 'event_available';
    case 'Palestrante':
      return 'record_voice_over';
    case 'Gestão esportiva':
      return 'sports';
    case 'Certificado emitido':
      return 'workspace_premium';
    case 'Comprovante pendente':
      return 'receipt_long';
    case 'Em análise':
      return 'hourglass_top';
    case 'Comprovante inválido':
      return 'error';
    case 'Sem vagas':
      return 'event_busy';
    case 'Conflito de horário':
      return 'schedule';
    case 'Inscrição rejeitada':
      return 'cancel';
    case 'Inscrição cancelada':
    case 'Não inscrito':
      return 'event_busy';
    case 'Sem inscrição':
    case 'Sem presença registrada':
      return 'person_off';
    default:
      return 'info';
  }
}

@Component({
  selector: 'app-participation-status-icons',
  imports: [MatIconModule, MatTooltipModule],
  template: `
    <span class="status-icons" [class.status-icons--event]="eventStatus()">
      @for (status of statuses(); track status.label) {
        <span class="status-row">
          @if (status.showLabel) {
            <span class="status-icon" aria-hidden="true">
              <mat-icon>{{ status.icon }}</mat-icon>
            </span>
            <span>{{ status.label }}</span>
          } @else {
            <span class="status-icon" role="img" [attr.aria-label]="status.label" [matTooltip]="status.label">
              <mat-icon aria-hidden="true">{{ status.icon }}</mat-icon>
            </span>
          }
          @if (status.visibleTimestamp) {
            <span class="status-timestamp" aria-hidden="true">{{ status.visibleTimestamp }}</span>
          }
        </span>
      }
    </span>
  `,
  styles: `
    .status-icons {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 0.25rem;
    }

    .status-icons--event {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.125rem;
    }

    .status-row {
      align-items: center;
      display: inline-flex;
      gap: 0.25rem;
    }

    .status-icon {
      align-items: center;
      color: var(--mat-sys-primary);
      display: inline-flex;
      justify-content: center;
      padding: 0.125rem;
    }

    .status-icon[role='img'] {
      cursor: help;
    }

    .status-icon mat-icon {
      font-size: 1.25rem;
      height: 1.25rem;
      width: 1.25rem;
    }
  `,
})
export class ParticipationStatusIcons {
  readonly statusLine = input('');
  readonly eventStatus = input<ParticipationEventStatus | null>(null);
  readonly showSubscriptionLabel = input(false);
  readonly statuses = computed(() => {
    const eventStatus = this.eventStatus();
    if (!eventStatus) {
      return getParticipationStatusItems(this.statusLine());
    }

    const visibleTimestamp = eventStatus.attendanceAt ? formatDateTime(eventStatus.attendanceAt) : undefined;
    const attendance = visibleTimestamp ? `Presença registrada em ${visibleTimestamp}` : 'Sem presença registrada';
    const subscription = eventStatus.isSubscribed ? 'Inscrito' : 'Não inscrito';
    return [
      { label: attendance, icon: participationStatusIcon(attendance), visibleTimestamp },
      { label: subscription, icon: participationStatusIcon(subscription), showLabel: this.showSubscriptionLabel() },
    ];
  });
}
