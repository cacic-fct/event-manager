import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  type FormAnswerValue,
  type FormElement,
  type FormResponseAnswer,
  type FormSchedulingAnswer,
  type FormSchedulingInvitee,
} from '@cacic-fct/form-contracts';
import {
  answerValue,
  createSchedulingSlots,
  EVENT_FORM_ELEMENT_LABELS,
  isRequiredFormAnswerMissing,
  setAnswerValue,
} from './event-form-utils';

@Component({
  selector: 'lib-event-form-renderer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <form class="event-form-renderer" (submit)="submit($event)">
      @if (elements().length === 0) {
        <p class="empty-state">Nenhum item foi adicionado a este formulário.</p>
      }

      @for (element of elements(); track element.id) {
        <section class="form-item" [class.form-item--section]="element.type === 'section'">
          @if (element.type === 'section') {
            <h2>{{ element.title }}</h2>
            @if (element.description) {
              <p>{{ element.description }}</p>
            }
          } @else if (element.type === 'statement') {
            <p class="statement">{{ element.title }}</p>
            @if (element.description) {
              <p class="description">{{ element.description }}</p>
            }
          } @else {
            <div class="question-heading">
              <div>
                <h3>{{ element.title }}</h3>
                @if (element.description) {
                  <p class="description">{{ element.description }}</p>
                }
              </div>
              @if (element.required) {
                <span class="required">Obrigatória</span>
              }
            </div>

            @if (readOnly()) {
              <p class="answer-preview">{{ answerDisplay(element) }}</p>
            } @else {
              @switch (element.type) {
                @case ('shortText') {
                  <mat-form-field appearance="outline">
                    <mat-label>Resposta</mat-label>
                    <input
                      matInput
                      [value]="stringAnswer(element.id)"
                      (input)="setStringAnswer(element.id, $event)"
                    />
                  </mat-form-field>
                }
                @case ('longText') {
                  <mat-form-field appearance="outline">
                    <mat-label>Resposta</mat-label>
                    <textarea
                      matInput
                      rows="4"
                      [value]="stringAnswer(element.id)"
                      (input)="setStringAnswer(element.id, $event)"
                    ></textarea>
                  </mat-form-field>
                }
                @case ('singleChoice') {
                  <mat-radio-group
                    class="option-list"
                    [value]="stringAnswer(element.id)"
                    (change)="setAnswer(element.id, $event.value)"
                  >
                    @for (option of element.options; track option.id) {
                      <mat-radio-button [value]="option.id">{{ option.label }}</mat-radio-button>
                    }
                  </mat-radio-group>
                }
                @case ('multipleChoice') {
                  <div class="option-list">
                    @for (option of element.options; track option.id) {
                      <mat-checkbox
                        [checked]="isOptionChecked(element.id, option.id)"
                        (change)="toggleMultipleAnswer(element.id, option.id, $event.checked)"
                      >
                        {{ option.label }}
                      </mat-checkbox>
                    }
                  </div>
                }
                @case ('selectionDropdown') {
                  <mat-form-field appearance="outline">
                    <mat-label>Selecione</mat-label>
                    <mat-select
                      [value]="stringAnswer(element.id)"
                      (selectionChange)="setAnswer(element.id, $event.value)"
                    >
                      @for (option of element.options; track option.id) {
                        <mat-option [value]="option.id">{{ option.label }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                }
                @case ('singleSelectionGrid') {
                  <div class="grid-answer">
                    <div class="grid-row grid-row--header">
                      <span></span>
                      @for (column of element.settings?.grid?.columns ?? []; track column.id) {
                        <span>{{ column.label }}</span>
                      }
                    </div>
                    @for (row of element.settings?.grid?.rows ?? []; track row.id) {
                      <div class="grid-row">
                        <strong>{{ row.label }}</strong>
                        @for (column of element.settings?.grid?.columns ?? []; track column.id) {
                          <mat-radio-button
                            [name]="element.id + '-' + row.id"
                            [checked]="gridStringAnswer(element.id, row.id) === column.id"
                            (change)="setGridStringAnswer(element.id, row.id, column.id)"
                          />
                        }
                      </div>
                    }
                  </div>
                }
                @case ('multipleSelectionGrid') {
                  <div class="grid-answer">
                    <div class="grid-row grid-row--header">
                      <span></span>
                      @for (column of element.settings?.grid?.columns ?? []; track column.id) {
                        <span>{{ column.label }}</span>
                      }
                    </div>
                    @for (row of element.settings?.grid?.rows ?? []; track row.id) {
                      <div class="grid-row">
                        <strong>{{ row.label }}</strong>
                        @for (column of element.settings?.grid?.columns ?? []; track column.id) {
                          <mat-checkbox
                            [checked]="isGridOptionChecked(element.id, row.id, column.id)"
                            (change)="toggleGridMultipleAnswer(element.id, row.id, column.id, $event.checked)"
                          />
                        }
                      </div>
                    }
                  </div>
                }
                @case ('linearScale') {
                  <div class="scale-answer">
                    <span>{{ element.settings?.linearScale?.minLabel }}</span>
                    @for (value of linearScaleValues(element); track value) {
                      <button
                        mat-stroked-button
                        type="button"
                        [class.selected-value]="numberAnswer(element.id) === value"
                        (click)="setAnswer(element.id, value)"
                      >
                        {{ value }}
                      </button>
                    }
                    <span>{{ element.settings?.linearScale?.maxLabel }}</span>
                  </div>
                }
                @case ('starRating') {
                  <div class="rating-answer">
                    @for (value of starValues(element); track value) {
                      <button
                        mat-icon-button
                        type="button"
                        [class.selected-star]="numberAnswer(element.id) >= value"
                        [matTooltip]="value + ' estrela' + (value === 1 ? '' : 's')"
                        (click)="setAnswer(element.id, value)"
                      >
                        <mat-icon>{{ numberAnswer(element.id) >= value ? 'star' : 'star_border' }}</mat-icon>
                      </button>
                    }
                  </div>
                }
                @case ('date') {
                  <mat-form-field appearance="outline">
                    <mat-label>Data</mat-label>
                    <input
                      matInput
                      type="date"
                      [value]="stringAnswer(element.id)"
                      (input)="setStringAnswer(element.id, $event)"
                    />
                  </mat-form-field>
                }
                @case ('time') {
                  <mat-form-field appearance="outline">
                    <mat-label>Hora</mat-label>
                    <input
                      matInput
                      type="time"
                      [value]="stringAnswer(element.id)"
                      (input)="setStringAnswer(element.id, $event)"
                    />
                  </mat-form-field>
                }
                @case ('scheduling') {
                  <div class="scheduling-answer">
                    <mat-form-field appearance="outline">
                      <mat-label>Horário</mat-label>
                      <mat-select
                        [value]="schedulingAnswer(element.id)?.slotId ?? ''"
                        (selectionChange)="setSchedulingSlot(element.id, $event.value)"
                      >
                        @for (slot of schedulingSlots(element); track slot.id) {
                          <mat-option [value]="slot.id">{{ slot.label }}</mat-option>
                        }
                      </mat-select>
                    </mat-form-field>

                    @if (element.settings?.scheduling?.inviteeMode !== 'none') {
                      <div class="invitees">
                        @for (invitee of schedulingInvitees(element.id); track $index) {
                          <mat-form-field appearance="outline">
                            <mat-label>Nome do convidado</mat-label>
                            <input
                              matInput
                              [value]="invitee.name"
                              (input)="setSchedulingInviteeName(element.id, $index, $event)"
                            />
                          </mat-form-field>
                          <mat-form-field appearance="outline">
                            <mat-label>E-mail</mat-label>
                            <input
                              matInput
                              type="email"
                              [value]="invitee.email ?? ''"
                              (input)="setSchedulingInviteeEmail(element.id, $index, $event)"
                            />
                          </mat-form-field>
                        }
                        <button
                          mat-button
                          type="button"
                          [disabled]="isSchedulingInviteeLimitReached(element)"
                          (click)="addSchedulingInvitee(element)"
                        >
                          <mat-icon>person_add</mat-icon>
                          Convidado
                        </button>
                      </div>
                    }
                  </div>
                }
              }

              @if (showMissingRequired() && isMissingRequired(element)) {
                <p class="validation">Esta pergunta é obrigatória.</p>
              }
            }
          }
        </section>
      }

      @if (!readOnly() && showSubmit()) {
        <div class="actions">
          <button mat-flat-button type="submit">
            <mat-icon>send</mat-icon>
            {{ submitLabel() }}
          </button>
        </div>
      }
    </form>
  `,
  styles: `
    .event-form-renderer {
      display: grid;
      gap: 16px;
    }

    .empty-state,
    .description,
    .answer-preview {
      color: var(--mat-sys-on-surface-variant);
    }

    .form-item {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 16px;
      background: var(--mat-sys-surface);
    }

    .form-item--section {
      border-color: transparent;
      padding-inline: 0;
    }

    h2,
    h3,
    p {
      margin-block: 0;
    }

    h3 {
      font-size: 1rem;
      font-weight: 600;
    }

    .statement {
      font-weight: 500;
    }

    .question-heading {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }

    .required {
      color: var(--mat-sys-primary);
      font-size: 0.75rem;
      font-weight: 600;
      white-space: nowrap;
    }

    mat-form-field {
      width: 100%;
    }

    .option-list {
      display: grid;
      gap: 8px;
    }

    .grid-answer {
      display: grid;
      gap: 8px;
      overflow-x: auto;
    }

    .grid-row {
      display: grid;
      grid-template-columns: minmax(140px, 1fr) repeat(auto-fit, minmax(88px, 1fr));
      align-items: center;
      gap: 8px;
      min-width: 420px;
    }

    .grid-row--header {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.8125rem;
      font-weight: 600;
    }

    .scale-answer,
    .rating-answer,
    .actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }

    .selected-value {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .selected-star {
      color: var(--mat-sys-primary);
    }

    .invitees {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
    }

    .validation {
      color: var(--mat-sys-error);
      font-size: 0.8125rem;
      margin-top: 8px;
    }
  `,
})
export class EventFormRendererComponent {
  readonly elements = input<readonly FormElement[]>([]);
  readonly initialAnswers = input<readonly FormResponseAnswer[]>([]);
  readonly readOnly = input(false);
  readonly showSubmit = input(true);
  readonly submitLabel = input('Enviar respostas');
  readonly formSubmitted = output<FormResponseAnswer[]>();
  readonly answersChange = output<FormResponseAnswer[]>();

  readonly answers = signal<FormResponseAnswer[]>([]);
  readonly showMissingRequired = signal(false);
  readonly valid = computed(() => this.elements().every((element) => !this.isMissingRequired(element)));

  constructor() {
    effect(() => {
      this.answers.set([...this.initialAnswers()]);
    });
  }

  submit(event: Event): void {
    event.preventDefault();
    this.showMissingRequired.set(true);
    if (this.valid()) {
      this.formSubmitted.emit(this.answers());
    }
  }

  setAnswer(elementId: string, value: FormAnswerValue): void {
    this.answers.update((answers) => setAnswerValue(answers, elementId, value));
    this.answersChange.emit(this.answers());
  }

  setStringAnswer(elementId: string, event: Event): void {
    const value = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement ? event.target.value : '';
    this.setAnswer(elementId, value);
  }

  stringAnswer(elementId: string): string {
    const value = answerValue(this.answers(), elementId);
    return typeof value === 'string' ? value : '';
  }

  numberAnswer(elementId: string): number {
    const value = answerValue(this.answers(), elementId);
    return typeof value === 'number' ? value : 0;
  }

  isOptionChecked(elementId: string, optionId: string): boolean {
    const value = answerValue(this.answers(), elementId);
    return Array.isArray(value) && value.includes(optionId);
  }

  toggleMultipleAnswer(elementId: string, optionId: string, checked: boolean): void {
    const current = answerValue(this.answers(), elementId);
    const values = Array.isArray(current) ? current.filter((value) => typeof value === 'string') : [];
    const next = checked ? [...new Set([...values, optionId])] : values.filter((value) => value !== optionId);
    this.setAnswer(elementId, next);
  }

  gridStringAnswer(elementId: string, rowId: string): string {
    const value = answerValue(this.answers(), elementId);
    const record = this.isRecord(value) ? (value as Record<string, unknown>) : null;
    return typeof record?.[rowId] === 'string' ? record[rowId] : '';
  }

  setGridStringAnswer(elementId: string, rowId: string, columnId: string): void {
    const current = answerValue(this.answers(), elementId);
    const next: Record<string, string> = this.isRecord(current)
      ? { ...(current as Record<string, string>) }
      : {};
    next[rowId] = columnId;
    this.setAnswer(elementId, next as Record<string, string>);
  }

  isGridOptionChecked(elementId: string, rowId: string, columnId: string): boolean {
    const value = answerValue(this.answers(), elementId);
    const record = this.isRecord(value) ? (value as Record<string, unknown>) : null;
    const rowValue = record?.[rowId] ?? null;
    return Array.isArray(rowValue) && rowValue.includes(columnId);
  }

  toggleGridMultipleAnswer(elementId: string, rowId: string, columnId: string, checked: boolean): void {
    const current = answerValue(this.answers(), elementId);
    const next: Record<string, string[]> = this.isRecord(current)
      ? { ...(current as Record<string, string[]>) }
      : {};
    const rowValue = Array.isArray(next[rowId]) ? [...next[rowId]] : [];
    next[rowId] = checked ? [...new Set([...rowValue, columnId])] : rowValue.filter((value) => value !== columnId);
    this.setAnswer(elementId, next as Record<string, string[]>);
  }

  linearScaleValues(element: FormElement): number[] {
    const min = element.settings?.linearScale?.min ?? 1;
    const max = element.settings?.linearScale?.max ?? 5;
    return this.range(min, max);
  }

  starValues(element: FormElement): number[] {
    return this.range(1, element.settings?.starRating?.max ?? 5);
  }

  schedulingSlots(element: FormElement) {
    return createSchedulingSlots(element.settings?.scheduling);
  }

  schedulingAnswer(elementId: string): FormSchedulingAnswer | null {
    const value = answerValue(this.answers(), elementId);
    return this.isSchedulingAnswer(value) ? value : null;
  }

  setSchedulingSlot(elementId: string, slotId: string): void {
    const current = this.schedulingAnswer(elementId);
    this.setAnswer(elementId, {
      slotId,
      invitees: current?.invitees ?? [],
    });
  }

  schedulingInvitees(elementId: string): FormSchedulingInvitee[] {
    return this.schedulingAnswer(elementId)?.invitees ?? [];
  }

  isSchedulingInviteeLimitReached(element: FormElement): boolean {
    const maxInvitees = element.settings?.scheduling?.maxInvitees ?? 0;
    return this.schedulingInvitees(element.id).length >= maxInvitees;
  }

  addSchedulingInvitee(element: FormElement): void {
    if (this.isSchedulingInviteeLimitReached(element)) {
      return;
    }
    const current = this.schedulingAnswer(element.id) ?? { slotId: '', invitees: [] };
    this.setAnswer(element.id, {
      ...current,
      invitees: [...current.invitees, { name: '' }],
    });
  }

  setSchedulingInviteeName(elementId: string, index: number, event: Event): void {
    this.updateSchedulingInvitee(elementId, index, {
      name: event.target instanceof HTMLInputElement ? event.target.value : '',
    });
  }

  setSchedulingInviteeEmail(elementId: string, index: number, event: Event): void {
    this.updateSchedulingInvitee(elementId, index, {
      email: event.target instanceof HTMLInputElement ? event.target.value : '',
    });
  }

  answerDisplay(element: FormElement): string {
    const value = answerValue(this.answers(), element.id);
    if (value === null || value === undefined || value === '') {
      return 'Sem resposta';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (typeof value === 'string') {
      return this.optionLabel(element, value);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.optionLabel(element, item)).join(', ');
    }

    if (this.isSchedulingAnswer(value)) {
      const slot = this.schedulingSlots(element).find((item) => item.id === value.slotId);
      return slot?.label ?? value.slotId;
    }

    if (this.isRecord(value)) {
      return Object.entries(value)
        .map(([rowId, answer]) => `${this.gridRowLabel(element, rowId)}: ${this.gridAnswerLabel(element, answer)}`)
        .join('; ');
    }

    return 'Sem resposta';
  }

  isMissingRequired(element: FormElement): boolean {
    return isRequiredFormAnswerMissing(element, answerValue(this.answers(), element.id));
  }

  protected readonly labels = EVENT_FORM_ELEMENT_LABELS;

  private updateSchedulingInvitee(elementId: string, index: number, patch: Partial<FormSchedulingInvitee>): void {
    const current = this.schedulingAnswer(elementId) ?? { slotId: '', invitees: [] };
    const invitees = [...current.invitees];
    invitees[index] = {
      ...(invitees[index] ?? { name: '' }),
      ...patch,
    };
    this.setAnswer(elementId, { ...current, invitees });
  }

  private optionLabel(element: FormElement, optionId: string): string {
    return element.options.find((option) => option.id === optionId)?.label ?? optionId;
  }

  private gridRowLabel(element: FormElement, rowId: string): string {
    return element.settings?.grid?.rows.find((row) => row.id === rowId)?.label ?? rowId;
  }

  private gridAnswerLabel(element: FormElement, value: unknown): string {
    if (typeof value === 'string') {
      return element.settings?.grid?.columns.find((column) => column.id === value)?.label ?? value;
    }
    if (Array.isArray(value)) {
      return value
        .map((entry) =>
          typeof entry === 'string'
            ? (element.settings?.grid?.columns.find((column) => column.id === entry)?.label ?? entry)
            : '',
        )
        .filter(Boolean)
        .join(', ');
    }
    return '';
  }

  private range(min: number, max: number): number[] {
    const start = Math.min(min, max);
    const end = Math.max(min, max);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  }

  private isSchedulingAnswer(value: unknown): value is FormSchedulingAnswer {
    return this.isRecord(value) && typeof value['slotId'] === 'string' && Array.isArray(value['invitees']);
  }
}
