import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import type {
  PublicEvent,
  PublicEventForm,
  PublicMajorEvent,
} from '@cacic-fct/event-manager-public-contracts';
import {
  EventFormRendererComponent,
  EventFormDescriptionContentComponent,
  answerValue,
  isRequiredFormAnswerMissing,
  parseFormElementsJson,
} from '@cacic-fct/shared-angular';
import { compareIsoDateAsc } from '@cacic-fct/shared-utils';
import { type FormElement, type FormResponseAnswer } from '@cacic-fct/form-contracts';
import { isSameDay, isSameMonth, parseISO } from 'date-fns';
import { EmojiService } from '../../../shared/emoji.service';
import {
  subscriptionFormKey,
  toSubscriptionFormAnswers,
  type SubscriptionFlowDraft,
  type SubscriptionFormAnswer,
  type SubscriptionFormContext,
} from './subscription-flow.models';

export type { SubscriptionFormAnswer, SubscriptionFormContext } from './subscription-flow.models';

export interface ConfirmSubscriptionDialogResult {
  confirmed: boolean;
  answers: SubscriptionFormAnswer[];
  imageLicenseAgreementAccepted: boolean;
}

export interface ConfirmSubscriptionDialogData {
  majorEvent?: PublicMajorEvent;
  event?: PublicEvent;
  events: PublicEvent[];
  forms: SubscriptionFormContext[];
  imageLicenseAgreement?: {
    required: boolean;
    accepted: boolean;
  };
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
  imports: [
    DatePipe,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    EventFormRendererComponent,
    EventFormDescriptionContentComponent,
  ],
  templateUrl: './confirm-dialog.html',
  styleUrl: './confirm-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmSubscriptionDialog {
  private readonly dialogRef = inject(MatDialogRef<ConfirmSubscriptionDialog>);
  readonly data = inject<ConfirmSubscriptionDialogData>(MAT_DIALOG_DATA);
  readonly emoji = inject(EmojiService);
  readonly answersByKey = signal<Record<string, FormResponseAnswer[]>>(
    Object.fromEntries(this.data.forms.map((form) => [this.formKey(form), form.initialAnswers])),
  );
  readonly imageLicenseAgreementAccepted = signal(this.data.imageLicenseAgreement?.accepted ?? false);

  readonly groupedEvents = computed(() => this.groupByMonthAndDay(this.data.events));
  readonly canConfirm = computed(
    () =>
      this.data.forms.every((form) => !this.hasMissingRequired(form)) &&
      (!this.data.imageLicenseAgreement?.required || this.imageLicenseAgreementAccepted()),
  );
  readonly subscriptionTarget = computed(() => this.data.majorEvent ?? this.data.event ?? this.data.events[0]);

  confirm(): void {
    const draft: SubscriptionFlowDraft = {
      answersByKey: this.answersByKey(),
      imageLicenseAgreementAccepted: this.imageLicenseAgreementAccepted(),
    };

    this.dialogRef.close({
      confirmed: true,
      answers: toSubscriptionFormAnswers(this.data.forms, draft),
      imageLicenseAgreementAccepted: this.imageLicenseAgreementAccepted(),
    } satisfies ConfirmSubscriptionDialogResult);
  }

  close(): void {
    this.dialogRef.close({
      confirmed: false,
      answers: [],
      imageLicenseAgreementAccepted: false,
    } satisfies ConfirmSubscriptionDialogResult);
  }

  formElements(form: PublicEventForm): FormElement[] {
    return parseFormElementsJson(form.elementsJson);
  }

  updateFormAnswers(form: SubscriptionFormContext, answers: FormResponseAnswer[]): void {
    this.answersByKey.update((current) => ({
      ...current,
      [this.formKey(form)]: answers,
    }));
  }

  hasMissingRequired(form: SubscriptionFormContext): boolean {
    if (!form.requiredInSubscriptionFlow) {
      return false;
    }

    const answers = this.answersByKey()[this.formKey(form)] ?? [];
    return this.formElements(form.form).some((element) => {
      return isRequiredFormAnswerMissing(element, answerValue(answers, element.id));
    });
  }

  formKey(form: SubscriptionFormContext): string {
    return subscriptionFormKey(form);
  }

  private groupByMonthAndDay(events: PublicEvent[]): ConfirmSubscriptionListMonth[] {
    const sortedEvents = [...events].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate));
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
