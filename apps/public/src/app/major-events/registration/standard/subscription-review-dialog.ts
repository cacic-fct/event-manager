import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import type { PublicEvent, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import {
  isFormAnswerElementType,
  type FormAnswerValue,
  type FormElement,
  type FormResponseAnswer,
  type FormSchedulingAnswer,
} from '@cacic-fct/form-contracts';
import { answerValue, createSchedulingSlots, parseFormElementsJson } from '@cacic-fct/shared-angular';
import { formatDateOnlyForDisplay } from '@cacic-fct/shared-utils';
import { EmojiService } from '../../../shared/emoji.service';
import {
  subscriptionFormKey,
  type SubscriptionFlowDraft,
  type SubscriptionFormContext,
} from './subscription-flow.models';

export interface SubscriptionReviewDialogData {
  majorEvent: PublicMajorEvent;
  events: PublicEvent[];
  forms: readonly SubscriptionFormContext[];
  draft: SubscriptionFlowDraft;
  paymentTier: string | null;
  requireImageLicenseAgreement: boolean;
}

export interface SubscriptionReviewDialogResult {
  confirmed: boolean;
}

interface SubscriptionReviewAnswerRow {
  elementId: string;
  question: string;
  answer: string;
}

@Component({
  selector: 'app-subscription-review-dialog',
  imports: [DatePipe, MatButtonModule, MatDialogModule, MatIconModule],
  templateUrl: './subscription-review-dialog.html',
  styleUrl: './subscription-review-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SubscriptionReviewDialog {
  private readonly dialogRef = inject(MatDialogRef<SubscriptionReviewDialog>);
  readonly data = inject<SubscriptionReviewDialogData>(MAT_DIALOG_DATA);
  readonly emoji = inject(EmojiService);

  close(): void {
    this.dialogRef.close({ confirmed: false } satisfies SubscriptionReviewDialogResult);
  }

  confirm(): void {
    this.dialogRef.close({ confirmed: true } satisfies SubscriptionReviewDialogResult);
  }

  answerRows(form: SubscriptionFormContext): SubscriptionReviewAnswerRow[] {
    const answers = this.data.draft.answersByKey[subscriptionFormKey(form)] ?? [];
    return parseFormElementsJson(form.form.elementsJson)
      .filter((element) => isFormAnswerElementType(element.type))
      .map((element) => ({
        elementId: element.id,
        question: element.title,
        answer: this.answerDisplay(element, answers),
      }));
  }

  private answerDisplay(element: FormElement, answers: readonly FormResponseAnswer[]): string {
    const value = answerValue(answers, element.id);
    if (value === null || value === undefined || value === '') {
      return 'Sem resposta';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'string') {
      if (element.type === 'date') {
        return formatDateOnlyForDisplay(value) ?? value;
      }
      return this.optionLabel(element, value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.optionLabel(element, item)).join(', ');
    }

    if (this.isSchedulingAnswer(value)) {
      const slot = createSchedulingSlots(element.settings?.scheduling).find((item) => item.id === value.slotId);
      const invitees = value.invitees.map((invitee) => invitee.name).filter(Boolean);
      return invitees.length > 0
        ? `${slot?.label ?? value.slotId} · ${invitees.join(', ')}`
        : (slot?.label ?? value.slotId);
    }

    return Object.entries(value)
      .map(([rowId, rowValue]) => `${this.gridRowLabel(element, rowId)}: ${this.gridAnswerLabel(element, rowValue)}`)
      .join('; ');
  }

  private optionLabel(element: FormElement, optionId: string): string {
    return element.options.find((option) => option.id === optionId)?.label ?? optionId;
  }

  private gridRowLabel(element: FormElement, rowId: string): string {
    return element.settings?.grid?.rows.find((row) => row.id === rowId)?.label ?? rowId;
  }

  private gridAnswerLabel(element: FormElement, value: FormAnswerValue | unknown): string {
    if (typeof value === 'string') {
      return element.settings?.grid?.columns.find((column) => column.id === value)?.label ?? value;
    }
    if (Array.isArray(value)) {
      return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => element.settings?.grid?.columns.find((column) => column.id === entry)?.label ?? entry)
        .join(', ');
    }
    return '';
  }

  private isSchedulingAnswer(value: FormAnswerValue): value is FormSchedulingAnswer {
    return (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      'slotId' in value &&
      typeof value.slotId === 'string' &&
      'invitees' in value &&
      Array.isArray(value.invitees)
    );
  }
}
