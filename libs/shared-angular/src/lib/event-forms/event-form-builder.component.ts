import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  isFormAnswerElementType,
  type FormChoiceOption,
  type FormElement,
  type FormElementType,
  type FormSchedulingInviteeMode,
} from '@cacic-fct/form-contracts';
import {
  cloneFormElements,
  createEventFormElement,
  EVENT_FORM_ELEMENT_LABELS,
  EVENT_FORM_ELEMENT_TYPES,
} from './event-form-utils';

type OptionCollection = 'options' | 'gridRows' | 'gridColumns' | 'availability';

@Component({
  selector: 'lib-event-form-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <div class="form-builder">
      <div class="builder-toolbar">
        <mat-form-field appearance="outline">
          <mat-label>Tipo de item</mat-label>
          <mat-select [value]="addType()" (selectionChange)="addType.set($event.value)">
            @for (type of elementTypes; track type) {
              <mat-option [value]="type">{{ labels[type] }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-flat-button type="button" (click)="addElement()">
          <mat-icon>add</mat-icon>
          Adicionar
        </button>
      </div>

      @if (elements().length === 0) {
        <p class="empty-state">Adicione perguntas, textos ou seções para montar o formulário.</p>
      }

      @for (element of elements(); track element.id; let index = $index) {
        <section class="builder-item">
          <header>
            <div>
              <span>{{ labels[element.type] }}</span>
              <h3>{{ element.title }}</h3>
            </div>
            <div class="item-actions">
              <button mat-icon-button type="button" matTooltip="Mover para cima" [disabled]="index === 0" (click)="move(index, -1)">
                <mat-icon>arrow_upward</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                matTooltip="Mover para baixo"
                [disabled]="index === elements().length - 1"
                (click)="move(index, 1)"
              >
                <mat-icon>arrow_downward</mat-icon>
              </button>
              <button mat-icon-button type="button" matTooltip="Duplicar" (click)="duplicate(index)">
                <mat-icon>content_copy</mat-icon>
              </button>
              <button mat-icon-button type="button" matTooltip="Remover" (click)="remove(element.id)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          </header>

          <div class="item-grid">
            <mat-form-field appearance="outline">
              <mat-label>Título</mat-label>
              <input matInput [value]="element.title" (input)="updateText(element.id, 'title', $event)" />
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Descrição</mat-label>
              <textarea matInput rows="2" [value]="element.description ?? ''" (input)="updateText(element.id, 'description', $event)"></textarea>
            </mat-form-field>

            @if (isAnswerElement(element.type)) {
              <mat-checkbox [checked]="element.required" (change)="updateRequired(element.id, $event.checked)">
                Resposta obrigatória
              </mat-checkbox>
            }
          </div>

          @if (usesOptions(element.type)) {
            <div class="option-editor">
              <h4>Opções</h4>
              @for (option of element.options; track option.id) {
                <div class="option-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Opção</mat-label>
                    <input matInput [value]="option.label" (input)="updateOption(element.id, 'options', option.id, $event)" />
                  </mat-form-field>
                  <button mat-icon-button type="button" matTooltip="Remover opção" (click)="removeOption(element.id, 'options', option.id)">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              }
              <button mat-button type="button" (click)="addOption(element.id, 'options')">
                <mat-icon>add</mat-icon>
                Opção
              </button>
            </div>
          }

          @if (isGrid(element.type)) {
            <div class="grid-editor">
              <div class="option-editor">
                <h4>Linhas</h4>
                @for (row of element.settings?.grid?.rows ?? []; track row.id) {
                  <div class="option-row">
                    <mat-form-field appearance="outline">
                      <mat-label>Linha</mat-label>
                      <input matInput [value]="row.label" (input)="updateOption(element.id, 'gridRows', row.id, $event)" />
                    </mat-form-field>
                    <button mat-icon-button type="button" matTooltip="Remover linha" (click)="removeOption(element.id, 'gridRows', row.id)">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
                <button mat-button type="button" (click)="addOption(element.id, 'gridRows')">
                  <mat-icon>add</mat-icon>
                  Linha
                </button>
              </div>

              <div class="option-editor">
                <h4>Colunas</h4>
                @for (column of element.settings?.grid?.columns ?? []; track column.id) {
                  <div class="option-row">
                    <mat-form-field appearance="outline">
                      <mat-label>Coluna</mat-label>
                      <input matInput [value]="column.label" (input)="updateOption(element.id, 'gridColumns', column.id, $event)" />
                    </mat-form-field>
                    <button mat-icon-button type="button" matTooltip="Remover coluna" (click)="removeOption(element.id, 'gridColumns', column.id)">
                      <mat-icon>close</mat-icon>
                    </button>
                  </div>
                }
                <button mat-button type="button" (click)="addOption(element.id, 'gridColumns')">
                  <mat-icon>add</mat-icon>
                  Coluna
                </button>
              </div>
            </div>
          }

          @if (element.type === 'linearScale') {
            <div class="settings-grid">
              <mat-form-field appearance="outline">
                <mat-label>Mínimo</mat-label>
                <mat-select [value]="element.settings?.linearScale?.min ?? 1" (selectionChange)="updateLinearMin(element.id, $event.value)">
                  <mat-option [value]="0">0</mat-option>
                  <mat-option [value]="1">1</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Máximo</mat-label>
                <input
                  matInput
                  type="number"
                  min="2"
                  [value]="element.settings?.linearScale?.max ?? 5"
                  (input)="updateLinearNumber(element.id, $event)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Rótulo mínimo</mat-label>
                <input
                  matInput
                  [value]="element.settings?.linearScale?.minLabel ?? ''"
                  (input)="updateLinearText(element.id, 'minLabel', $event)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Rótulo máximo</mat-label>
                <input
                  matInput
                  [value]="element.settings?.linearScale?.maxLabel ?? ''"
                  (input)="updateLinearText(element.id, 'maxLabel', $event)"
                />
              </mat-form-field>
            </div>
          }

          @if (element.type === 'starRating') {
            <mat-form-field appearance="outline">
              <mat-label>Quantidade máxima de estrelas</mat-label>
              <input
                matInput
                type="number"
                min="1"
                max="10"
                [value]="element.settings?.starRating?.max ?? 5"
                (input)="updateStarMax(element.id, $event)"
              />
            </mat-form-field>
          }

          @if (element.type === 'scheduling') {
            <div class="settings-grid">
              <mat-form-field appearance="outline">
                <mat-label>Responsável</mat-label>
                <input
                  matInput
                  [value]="element.settings?.scheduling?.hostName ?? ''"
                  (input)="updateSchedulingText(element.id, 'hostName', $event)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Local</mat-label>
                <input
                  matInput
                  [value]="element.settings?.scheduling?.location ?? ''"
                  (input)="updateSchedulingText(element.id, 'location', $event)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Fuso horário</mat-label>
                <input
                  matInput
                  [value]="element.settings?.scheduling?.timezone ?? 'America/Sao_Paulo'"
                  (input)="updateSchedulingText(element.id, 'timezone', $event)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Duração em minutos</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  [value]="element.settings?.scheduling?.durationMinutes ?? 30"
                  (input)="updateSchedulingNumber(element.id, 'durationMinutes', $event)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Intervalo em minutos</mat-label>
                <input
                  matInput
                  type="number"
                  min="1"
                  [value]="element.settings?.scheduling?.slotIntervalMinutes ?? 30"
                  (input)="updateSchedulingNumber(element.id, 'slotIntervalMinutes', $event)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Convidados</mat-label>
                <mat-select
                  [value]="element.settings?.scheduling?.inviteeMode ?? 'none'"
                  (selectionChange)="updateSchedulingInviteeMode(element.id, $event.value)"
                >
                  <mat-option value="none">Não permitir</mat-option>
                  <mat-option value="optional">Opcional</mat-option>
                  <mat-option value="required">Obrigatório</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Máximo de convidados</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  [value]="element.settings?.scheduling?.maxInvitees ?? 0"
                  (input)="updateSchedulingNumber(element.id, 'maxInvitees', $event)"
                />
              </mat-form-field>
            </div>

            <div class="option-editor">
              <h4>Janelas de disponibilidade</h4>
              @for (window of element.settings?.scheduling?.availability ?? []; track window.id) {
                <div class="availability-row">
                  <mat-form-field appearance="outline">
                    <mat-label>Data</mat-label>
                    <input matInput type="date" [value]="window.date" (input)="updateAvailability(element.id, window.id, 'date', $event)" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Início</mat-label>
                    <input matInput type="time" [value]="window.startTime" (input)="updateAvailability(element.id, window.id, 'startTime', $event)" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>Fim</mat-label>
                    <input matInput type="time" [value]="window.endTime" (input)="updateAvailability(element.id, window.id, 'endTime', $event)" />
                  </mat-form-field>
                  <button mat-icon-button type="button" matTooltip="Remover janela" (click)="removeOption(element.id, 'availability', window.id)">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
              }
              <button mat-button type="button" (click)="addOption(element.id, 'availability')">
                <mat-icon>add</mat-icon>
                Janela
              </button>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: `
    .form-builder {
      display: grid;
      gap: 16px;
    }

    .builder-toolbar,
    .item-actions,
    .option-row,
    .availability-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .builder-toolbar mat-form-field {
      max-width: 320px;
      width: 100%;
    }

    .empty-state {
      color: var(--mat-sys-on-surface-variant);
      margin: 0;
    }

    .builder-item {
      display: grid;
      gap: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 8px;
      padding: 16px;
      background: var(--mat-sys-surface);
    }

    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    header span {
      color: var(--mat-sys-primary);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    h3,
    h4 {
      margin: 0;
    }

    h3 {
      font-size: 1rem;
      font-weight: 600;
    }

    h4 {
      font-size: 0.875rem;
      font-weight: 600;
    }

    .item-grid,
    .settings-grid,
    .grid-editor {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .option-editor {
      display: grid;
      gap: 8px;
    }

    .option-row mat-form-field,
    .availability-row mat-form-field {
      flex: 1 1 160px;
    }

    @media (max-width: 720px) {
      header,
      .builder-toolbar,
      .option-row,
      .availability-row {
        align-items: stretch;
        flex-direction: column;
      }

      .item-actions {
        flex-wrap: wrap;
      }
    }
  `,
})
export class EventFormBuilderComponent {
  readonly elements = input<readonly FormElement[]>([]);
  readonly elementsChange = output<FormElement[]>();
  readonly addType = signal<FormElementType>('shortText');

  protected readonly elementTypes = EVENT_FORM_ELEMENT_TYPES;
  protected readonly labels = EVENT_FORM_ELEMENT_LABELS;

  addElement(): void {
    const next = cloneFormElements(this.elements());
    next.push(createEventFormElement(this.addType(), next.length));
    this.elementsChange.emit(next);
  }

  move(index: number, direction: -1 | 1): void {
    const next = cloneFormElements(this.elements());
    const targetIndex = index + direction;
    const item = next[index];
    if (!item || targetIndex < 0 || targetIndex >= next.length) {
      return;
    }
    next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    this.elementsChange.emit(next);
  }

  duplicate(index: number): void {
    const next = cloneFormElements(this.elements());
    const item = next[index];
    if (!item) {
      return;
    }
    next.splice(index + 1, 0, {
      ...cloneFormElements([item])[0],
      id: crypto.randomUUID(),
      title: `${item.title} (cópia)`,
    });
    this.elementsChange.emit(next);
  }

  remove(elementId: string): void {
    this.elementsChange.emit(cloneFormElements(this.elements()).filter((element) => element.id !== elementId));
  }

  updateText(elementId: string, key: 'title' | 'description', event: Event): void {
    const value = this.eventValue(event);
    this.updateElement(elementId, (element) => ({
      ...element,
      [key]: key === 'description' ? value || undefined : value,
    }));
  }

  updateRequired(elementId: string, required: boolean): void {
    this.updateElement(elementId, (element) => ({ ...element, required }));
  }

  addOption(elementId: string, collection: OptionCollection): void {
    this.updateElement(elementId, (element) => this.updateCollection(element, collection, (items) => [...items, this.newOption(collection, items.length)]));
  }

  updateOption(elementId: string, collection: OptionCollection, optionId: string, event: Event): void {
    const value = this.eventValue(event);
    this.updateElement(elementId, (element) =>
      this.updateCollection(element, collection, (items) =>
        items.map((item) => (item.id === optionId ? { ...item, label: value } : item)),
      ),
    );
  }

  removeOption(elementId: string, collection: OptionCollection, optionId: string): void {
    this.updateElement(elementId, (element) =>
      this.updateCollection(element, collection, (items) => items.filter((item) => item.id !== optionId)),
    );
  }

  updateLinearMin(elementId: string, min: 0 | 1): void {
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        linearScale: {
          min,
          max: element.settings?.linearScale?.max ?? 5,
          minLabel: element.settings?.linearScale?.minLabel,
          maxLabel: element.settings?.linearScale?.maxLabel,
        },
      },
    }));
  }

  updateLinearNumber(elementId: string, event: Event): void {
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        linearScale: {
          min: element.settings?.linearScale?.min ?? 1,
          max: Math.max(2, this.eventNumber(event, 5)),
          minLabel: element.settings?.linearScale?.minLabel,
          maxLabel: element.settings?.linearScale?.maxLabel,
        },
      },
    }));
  }

  updateLinearText(elementId: string, key: 'minLabel' | 'maxLabel', event: Event): void {
    const value = this.eventValue(event) || undefined;
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        linearScale: {
          min: element.settings?.linearScale?.min ?? 1,
          max: element.settings?.linearScale?.max ?? 5,
          minLabel: key === 'minLabel' ? value : element.settings?.linearScale?.minLabel,
          maxLabel: key === 'maxLabel' ? value : element.settings?.linearScale?.maxLabel,
        },
      },
    }));
  }

  updateStarMax(elementId: string, event: Event): void {
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        starRating: {
          max: Math.max(1, Math.min(10, this.eventNumber(event, 5))),
        },
      },
    }));
  }

  updateSchedulingText(
    elementId: string,
    key: 'hostName' | 'location' | 'timezone',
    event: Event,
  ): void {
    const value = this.eventValue(event);
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        scheduling: {
          ...this.ensureScheduling(element),
          [key]: value || (key === 'timezone' ? 'America/Sao_Paulo' : undefined),
        },
      },
    }));
  }

  updateSchedulingNumber(
    elementId: string,
    key: 'durationMinutes' | 'slotIntervalMinutes' | 'maxInvitees',
    event: Event,
  ): void {
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        scheduling: {
          ...this.ensureScheduling(element),
          [key]: Math.max(0, this.eventNumber(event, key === 'maxInvitees' ? 0 : 30)),
        },
      },
    }));
  }

  updateSchedulingInviteeMode(elementId: string, inviteeMode: FormSchedulingInviteeMode): void {
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        scheduling: {
          ...this.ensureScheduling(element),
          inviteeMode,
        },
      },
    }));
  }

  updateAvailability(
    elementId: string,
    availabilityId: string,
    key: 'date' | 'startTime' | 'endTime',
    event: Event,
  ): void {
    const value = this.eventValue(event);
    this.updateElement(elementId, (element) => ({
      ...element,
      settings: {
        ...element.settings,
        scheduling: {
          ...this.ensureScheduling(element),
          availability: this.ensureScheduling(element).availability.map((window) =>
            window.id === availabilityId ? { ...window, [key]: value } : window,
          ),
        },
      },
    }));
  }

  usesOptions(type: FormElementType): boolean {
    return type === 'singleChoice' || type === 'multipleChoice' || type === 'selectionDropdown';
  }

  isGrid(type: FormElementType): boolean {
    return type === 'singleSelectionGrid' || type === 'multipleSelectionGrid';
  }

  isAnswerElement(type: FormElementType): boolean {
    return isFormAnswerElementType(type);
  }

  private updateElement(elementId: string, transform: (element: FormElement) => FormElement): void {
    this.elementsChange.emit(
      cloneFormElements(this.elements()).map((element) => (element.id === elementId ? transform(element) : element)),
    );
  }

  private updateCollection(
    element: FormElement,
    collection: OptionCollection,
    transform: (items: FormChoiceOption[]) => FormChoiceOption[],
  ): FormElement {
    if (collection === 'options') {
      return { ...element, options: transform(element.options) };
    }

    if (collection === 'gridRows' || collection === 'gridColumns') {
      const grid = element.settings?.grid ?? { rows: [], columns: [] };
      return {
        ...element,
        settings: {
          ...element.settings,
          grid: {
            rows: collection === 'gridRows' ? transform(grid.rows) : grid.rows,
            columns: collection === 'gridColumns' ? transform(grid.columns) : grid.columns,
          },
        },
      };
    }

    const scheduling = this.ensureScheduling(element);
    return {
      ...element,
      settings: {
        ...element.settings,
        scheduling: {
          ...scheduling,
          availability: transform(
            scheduling.availability.map((window) => ({
              id: window.id,
              label: `${window.date}|${window.startTime}|${window.endTime}`,
            })),
          ).map((option) => {
            const [date, startTime, endTime] = option.label.split('|');
            return {
              id: option.id,
              date: date || new Date().toISOString().slice(0, 10),
              startTime: startTime || '08:00',
              endTime: endTime || '12:00',
            };
          }),
        },
      },
    };
  }

  private newOption(collection: OptionCollection, index: number): FormChoiceOption {
    if (collection === 'availability') {
      return {
        id: crypto.randomUUID(),
        label: `${new Date().toISOString().slice(0, 10)}|08:00|12:00`,
      };
    }

    const labelPrefix = collection === 'gridRows' ? 'Linha' : collection === 'gridColumns' ? 'Coluna' : 'Opção';
    return {
      id: crypto.randomUUID(),
      label: `${labelPrefix} ${index + 1}`,
    };
  }

  private ensureScheduling(element: FormElement) {
    return (
      element.settings?.scheduling ?? {
        timezone: 'America/Sao_Paulo',
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        inviteeMode: 'none' as const,
        maxInvitees: 0,
        availability: [],
      }
    );
  }

  private eventValue(event: Event): string {
    const target = event.target;
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ? target.value : '';
  }

  private eventNumber(event: Event, fallback: number): number {
    const value = Number(this.eventValue(event));
    return Number.isFinite(value) ? value : fallback;
  }
}
