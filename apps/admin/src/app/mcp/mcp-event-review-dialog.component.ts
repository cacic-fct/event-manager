import { TextFieldModule } from '@angular/cdk/text-field';
import { Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import type {
  McpAdminProposal,
  McpEventReviewField,
  McpEventReviewFieldValue,
  McpEventReviewPreview,
  McpEventReviewSelection,
} from '@cacic-fct/event-manager-mcp-contracts';
import { ReviewTextComparisonComponent } from '../shared/review-queue/review-text-comparison.component';
import { McpApi, mcpErrorMessage } from './mcp-api.service';

interface ReviewField extends McpEventReviewFieldValue {
  selected: boolean;
  before: string | null | undefined;
  input: string;
  invalid: boolean;
}

const TEXTAREAS = new Set<McpEventReviewField>([
  'description',
  'shortDescription',
  'locationDescription',
  'lecturerInformation',
  'collectorInformation',
]);

@Component({
  imports: [
    TextFieldModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    ReviewTextComparisonComponent,
  ],
  templateUrl: './mcp-event-review-dialog.component.html',
  styleUrl: './mcp-event-review-dialog.component.scss',
})
export class McpEventReviewDialogComponent {
  readonly proposal = inject<McpAdminProposal>(MAT_DIALOG_DATA);
  private readonly dialog = inject<MatDialogRef<McpEventReviewDialogComponent, boolean>>(MatDialogRef);
  private readonly api = inject(McpApi);
  private readonly injector = inject(Injector);
  private readonly stage = viewChild<ElementRef<HTMLElement>>('stage');
  private readonly alert = viewChild<ElementRef<HTMLElement>>('alert');
  private readonly operation = this.proposal.operation ?? 'EVENT_DESCRIPTION';
  private readonly revision = {
    expectedOperation: this.operation,
    expectedUpdatedAt: this.proposal.baseUpdatedAt,
  };

  readonly fields = signal<ReviewField[]>(
    (this.proposal.reviewFields ?? []).map((field) => ({
      ...field,
      input: String(field.proposedValue ?? ''),
      selected: true,
      before: this.proposal.changes
        ? this.proposal.changes.find((change) => change.field === field.field)?.before
        : field.field === 'description'
          ? this.proposal.descriptionBefore
          : undefined,
      invalid: false,
    })),
  );
  readonly busy = signal(false);
  readonly error = signal('');
  readonly preview = signal<(McpEventReviewPreview & { selections: McpEventReviewSelection[] }) | null>(null);
  readonly hasSelection = computed(() => this.fields().some(({ selected }) => selected));

  select(field: McpEventReviewField, selected: boolean): void {
    this.updateField(field, { selected });
  }

  isEdited(field: ReviewField): boolean {
    return field.invalid || field.input !== String(field.proposedValue ?? '');
  }

  restore(field: ReviewField): void {
    this.changeValue(field.field, String(field.proposedValue ?? ''));
  }

  changeValue(field: McpEventReviewField, input: string, invalid = false): void {
    this.updateField(field, { input, invalid });
  }

  changeText(field: McpEventReviewField, editor: HTMLTextAreaElement): void {
    if (field === 'name' && editor.value.includes('\n')) {
      const { selectionStart, selectionEnd } = editor;
      editor.value = editor.value.replaceAll('\n', ' ');
      editor.setSelectionRange(selectionStart, selectionEnd);
    }
    this.changeValue(field, editor.value);
  }

  isLongText(field: McpEventReviewField): boolean {
    return TEXTAREAS.has(field);
  }

  isCoordinate(field: McpEventReviewField): boolean {
    return field === 'latitude' || field === 'longitude';
  }

  isRequired(field: McpEventReviewField): boolean {
    return field === 'name' || this.operation === 'EVENT_DESCRIPTION';
  }

  async prepare(): Promise<void> {
    if (this.busy() || this.preview() || !this.hasSelection()) return;
    this.error.set('');
    const selected = this.fields().filter(({ selected }) => selected);
    if (selected.some(({ invalid }) => invalid)) {
      this.showError('Informe coordenadas válidas.');
      return;
    }
    const selections = selected.map((field) => this.selection(field));
    this.setBusy(true);
    try {
      const preview = await this.api.prepareReview(this.proposal.id, { ...this.revision, selections });
      this.preview.set({ ...preview, selections });
      this.focusStage();
    } catch (error) {
      this.showError(mcpErrorMessage(error, 'Não foi possível preparar as alterações. Tente novamente.'));
    } finally {
      this.setBusy(false);
    }
  }

  back(): void {
    this.preview.set(null);
    this.error.set('');
    this.focusStage();
  }

  async approve(): Promise<void> {
    const preview = this.preview();
    if (!preview || this.busy()) return;
    this.error.set('');
    this.setBusy(true);
    try {
      await this.api.decide(this.proposal.id, {
        ...this.revision,
        decision: 'APPROVE',
        review: { token: preview.token, selections: preview.selections },
      });
      this.dialog.close(true);
    } catch (error) {
      this.setBusy(false);
      this.showError(mcpErrorMessage(error, 'Não foi possível aprovar. Tente novamente.'));
    }
  }

  private selection(row: ReviewField): McpEventReviewSelection {
    const { field, input } = row;
    const editing = this.isEdited(row);
    if (field === 'isVirtual') return { field, value: editing ? input === 'true' : undefined };
    if (field === 'latitude' || field === 'longitude') {
      return { field, value: editing ? (input === '' ? null : Number(input)) : undefined };
    }
    if (field === 'name') return { field, value: editing ? input : undefined };
    return { field, value: editing ? (this.isRequired(field) ? input : input.trim() || null) : undefined };
  }

  private updateField(
    field: McpEventReviewField,
    patch: Partial<Pick<ReviewField, 'selected' | 'input' | 'invalid'>>,
  ): void {
    this.fields.update((fields) => fields.map((row) => (row.field === field ? { ...row, ...patch } : row)));
  }

  private setBusy(value: boolean): void {
    this.busy.set(value);
    this.dialog.disableClose = value;
  }

  private focusStage(): void {
    afterNextRender(() => this.stage()?.nativeElement.focus(), { injector: this.injector });
  }

  private showError(message: string): void {
    this.error.set(message);
    afterNextRender(() => this.alert()?.nativeElement.focus(), { injector: this.injector });
  }
}
