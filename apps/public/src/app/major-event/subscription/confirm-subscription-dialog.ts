import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import type {
  EventFormTargetType,
  PublicEvent,
  PublicEventForm,
  PublicMajorEvent,
} from '@cacic-fct/event-manager-public-contracts';
import {
  EventFormRendererComponent,
  answerValue,
  isRequiredFormAnswerMissing,
  parseFormElementsJson,
} from '@cacic-fct/shared-angular';
import { compareIsoDateAsc } from '@cacic-fct/shared-utils';
import { type FormElement, type FormResponseAnswer } from '@cacic-fct/form-contracts';
import { isSameDay, isSameMonth, parseISO } from 'date-fns';
import { EmojiService } from '../../shared/emoji.service';

export interface SubscriptionFormContext {
  form: PublicEventForm;
  targetType: EventFormTargetType;
  targetId: string;
  targetName: string;
  linkId: string | null;
  requiredInSubscriptionFlow: boolean;
  enforceRequiredAnswers: boolean;
}

export interface SubscriptionFormAnswer {
  formId: string;
  linkId: string | null;
  targetType: EventFormTargetType;
  targetId: string;
  answers: FormResponseAnswer[];
}

export interface ConfirmSubscriptionDialogResult {
  confirmed: boolean;
  answers: SubscriptionFormAnswer[];
}

export interface ConfirmSubscriptionDialogData {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  forms: SubscriptionFormContext[];
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
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule, MatListModule, EventFormRendererComponent],
  templateUrl: './confirm-subscription-dialog.html',
  styleUrl: './confirm-subscription-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmSubscriptionDialog {
  private readonly dialogRef = inject(MatDialogRef<ConfirmSubscriptionDialog>);
  readonly data = inject<ConfirmSubscriptionDialogData>(MAT_DIALOG_DATA);
  readonly emoji = inject(EmojiService);
  readonly answersByKey = signal<Record<string, FormResponseAnswer[]>>({});

  readonly groupedEvents = computed(() => this.groupByMonthAndDay(this.data.events));
  readonly canConfirm = computed(() => this.data.forms.every((form) => !this.hasMissingRequired(form)));

  confirm(): void {
    const answers = this.data.forms
      .map((form) => ({
        form,
        answers: this.answersByKey()[this.formKey(form)] ?? [],
      }))
      .filter(({ form, answers }) => form.requiredInSubscriptionFlow || answers.length > 0)
      .map(({ form, answers }) => ({
        formId: form.form.id,
        linkId: form.linkId,
        targetType: form.targetType,
        targetId: form.targetId,
        answers,
      }));

    this.dialogRef.close({
      confirmed: true,
      answers,
    } satisfies ConfirmSubscriptionDialogResult);
  }

  close(): void {
    this.dialogRef.close({ confirmed: false, answers: [] } satisfies ConfirmSubscriptionDialogResult);
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
    if (!form.requiredInSubscriptionFlow || !form.enforceRequiredAnswers) {
      return false;
    }

    const answers = this.answersByKey()[this.formKey(form)] ?? [];
    return this.formElements(form.form).some((element) => {
      return isRequiredFormAnswerMissing(element, answerValue(answers, element.id));
    });
  }

  formKey(form: SubscriptionFormContext): string {
    return `${form.form.id}:${form.linkId ?? 'sem-vinculo'}:${form.targetType}:${form.targetId}`;
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
