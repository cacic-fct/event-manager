import { Component, computed, model, signal } from '@angular/core';
import { FormField, form, maxLength, minLength, pattern, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { DEMO_ATTENDANCE_CODE, PARTICIPANT_FEATURES, ParticipantFeature } from './showcase.fixtures';
import { ShowcaseStageComponent } from './showcase-stage';
import { WalletDemoComponent } from './wallet-demo';
import { MajorEventSubscriptionDemoComponent } from './major-event-subscription-demo';
import { ReceiptDemoComponent } from './receipt-demo';
import { playShowcaseSequence } from './showcase-animation';
import { NotificationsDemoComponent, ShowcaseNotificationDestination } from './notifications-demo';
import { ParticipationHistoryDemoComponent } from './participation-history-demo';

@Component({
  selector: 'app-landing-participant-showcase',
  imports: [
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    ShowcaseStageComponent,
    WalletDemoComponent,
    MajorEventSubscriptionDemoComponent,
    TwemojiComponent,
    ReceiptDemoComponent,
    NotificationsDemoComponent,
    ParticipationHistoryDemoComponent,
  ],
  templateUrl: './participant-showcase.html',
  styleUrl: './participant-showcase.scss',
})
export class ParticipantShowcaseComponent {
  readonly feature = model<ParticipantFeature>(PARTICIPANT_FEATURES[0].id);
  readonly features = PARTICIPANT_FEATURES;
  readonly activeFeature = computed(() => this.features.find((item) => item.id === this.feature()) ?? this.features[0]);
  readonly demoCode = DEMO_ATTENDANCE_CODE;
  readonly attendanceModel = signal({ code: '' });
  readonly attendanceForm = form(this.attendanceModel, (schema) => {
    required(schema.code);
    minLength(schema.code, 4);
    maxLength(schema.code, 4);
    pattern(schema.code, /^[a-z0-9]{4}$/i);
  });
  readonly attendanceConfirmed = signal(false);
  readonly attendanceError = signal('');
  readonly previewEventId = signal<string | null>(null);
  readonly dayView = signal<'agenda' | 'receipt'>('agenda');
  readonly receiptPending = signal(true);
  readonly dayProgress = signal(72);
  readonly attendanceTyping = signal(false);
  readonly walletView = signal<'cards' | 'transfer' | 'incoming'>('cards');
  readonly historyParticipation = signal<string | null>(null);

  constructor() {
    playShowcaseSequence(() => {
      let frame: number | undefined;
      const startedAt = window.performance.now();
      this.dayProgress.set(18);
      const advance = (now: number) => {
        const progress = Math.max(0, Math.min(1, (now - startedAt) / 1100));
        this.dayProgress.set(18 + 54 * progress);
        if (progress < 1) frame = window.requestAnimationFrame(advance);
      };
      frame = window.requestAnimationFrame(advance);
      return () => {
        if (frame !== undefined) window.cancelAnimationFrame(frame);
        this.dayProgress.set(72);
      };
    }, () => this.feature() === 'day' && this.dayView() === 'agenda');

    playShowcaseSequence((schedule) => {
      if (this.attendanceModel().code) return;
      for (let length = 1; length <= this.demoCode.length; length += 1) {
        schedule(() => this.attendanceModel.set({ code: this.demoCode.slice(0, length) }), 250 + length * 220);
      }
    }, () => this.feature() === 'attendance' && !this.attendanceTyping() && !this.attendanceConfirmed());
  }

  selectFeature(feature: ParticipantFeature): void {
    this.previewEventId.set(null);
    this.dayView.set('agenda');
    this.attendanceTyping.set(false);
    this.walletView.set('cards');
    this.historyParticipation.set(null);
    this.feature.set(feature);
  }

  showNextEventMap(): void {
    this.showEventInfo('interfaces');
  }

  showEventInfo(eventId: string): void {
    this.previewEventId.set(eventId);
    this.feature.set('events');
  }

  openNotification(destination: ShowcaseNotificationDestination): void {
    switch (destination) {
      case 'receipt':
        this.dayView.set('receipt');
        this.feature.set('day');
        break;
      case 'event-info':
        this.showEventInfo('ai');
        break;
      case 'ticket-transfer':
        this.walletView.set('incoming');
        this.feature.set('wallet');
        break;
      case 'certificates':
        this.historyParticipation.set('technology');
        this.feature.set('history');
        break;
      case 'attendance':
        this.feature.set('attendance');
        break;
    }
  }

  confirmAttendance(): void {
    if (this.attendanceForm().invalid()) return;
    if (this.attendanceModel().code.toUpperCase() !== this.demoCode) {
      this.attendanceError.set(`Código não encontrado. Experimente ${this.demoCode}.`);
      return;
    }
    this.attendanceError.set('');
    this.attendanceConfirmed.set(true);
  }

  resetAttendance(): void {
    this.attendanceForm().reset({ code: '' });
    this.attendanceConfirmed.set(false);
    this.attendanceError.set('');
    this.attendanceTyping.set(false);
  }
}
