import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { AdminMcpCommand } from '@cacic-fct/event-manager-mcp-contracts';
import { normalizeOperationSearch } from './admin-operation-labels';
import { argumentDisplay, serializeArgument, type CommandArgument } from './command-arguments';

export interface CommandArgumentEdit {
  field: CommandArgument;
  targets: AdminMcpCommand['targets'];
}
export interface CommandArgumentEditResult {
  value: unknown;
}

@Component({
  selector: 'app-command-review-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Editar {{ field.label }}</h2>
    <mat-dialog-content>
      <p>O valor será usado nesta revisão. A operação só será executada após sua confirmação na página.</p>
      @if (field.value === null) {
        <mat-checkbox [checked]="keepNull()" (change)="keepNull.set($event.checked)">Manter sem valor</mat-checkbox>
      }
      @if (keepNull()) {
        <p>Este campo continuará sem valor.</p>
      } @else if (kind === 'resources') {
        <mat-form-field appearance="outline">
          <mat-label>Buscar {{ field.label }}</mat-label>
          <input matInput type="search" [formControl]="search" />
        </mat-form-field>
        <p>Selecione entre os destinos enviados pelo aplicativo.</p>
        <div role="group" [attr.aria-label]="field.label" class="resource-options">
          @for (option of filteredOptions(); track option) {
            <mat-checkbox [checked]="selection().includes(option)" (change)="toggle(option, $event.checked)">
              {{ display(option) }}
            </mat-checkbox>
          } @empty {
            <p>Nenhum destino encontrado. Revise a busca.</p>
          }
        </div>
        <p role="status">{{ selection().length }} destinos selecionados.</p>
      } @else if (kind === 'boolean') {
        <mat-checkbox [checked]="booleanValue()" (change)="booleanValue.set($event.checked)">{{
          field.label
        }}</mat-checkbox>
      } @else if (kind === 'enum') {
        <mat-form-field appearance="outline">
          <mat-label>{{ field.label }}</mat-label>
          <mat-select [formControl]="control">
            @for (option of enumOptions; track $index) {
              <mat-option [value]="option">{{ display(option) }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <mat-form-field appearance="outline">
          <mat-label>{{ field.label }}</mat-label>
          @if (kind === 'number') {
            <input
              matInput
              type="number"
              [formControl]="control"
              [attr.min]="field.schema['minimum'] ?? null"
              [attr.max]="field.schema['maximum'] ?? null"
              [step]="field.schema['type'] === 'integer' ? 1 : 'any'" />
          } @else if (kind === 'date') {
            <input matInput type="datetime-local" step="0.001" [formControl]="control" />
          } @else {
            <textarea matInput rows="5" [formControl]="control"></textarea>
            @if (kind === 'json') {
              <mat-hint>Lista estruturada em JSON. Os valores serão validados antes da execução.</mat-hint>
            }
          }
          @if (kind === 'date') {
            <mat-hint>Horário local. O fuso será convertido ao salvar a revisão.</mat-hint>
          }
        </mat-form-field>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button (click)="save()">Salvar revisão</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-form-field {
      width: 100%;
      margin-top: 0.75rem;
    }
    .resource-options {
      display: grid;
      max-height: 20rem;
      overflow: auto;
    }
    p,
    mat-checkbox {
      overflow-wrap: anywhere;
    }
    [role='alert'] {
      color: var(--mat-sys-error);
    }
  `,
})
export class CommandReviewDialogComponent {
  readonly data = inject<CommandArgumentEdit>(MAT_DIALOG_DATA);
  private readonly dialog = inject<MatDialogRef<CommandReviewDialogComponent, CommandArgumentEditResult>>(MatDialogRef);
  readonly field = this.data.field;
  readonly enumOptions = Array.isArray(this.field.schema['enum']) ? this.field.schema['enum'] : [];
  readonly kind = this.editorKind();
  readonly control = new FormControl<string | number>(this.initialValue(), { nonNullable: true });
  readonly booleanValue = signal(this.field.value === true);
  readonly selection = signal<string[]>(Array.isArray(this.field.value) ? [...this.field.value] : []);
  readonly search = new FormControl('', { nonNullable: true });
  private readonly query = toSignal(this.search.valueChanges, { initialValue: '' });
  readonly filteredOptions = computed(() => {
    const query = normalizeOperationSearch(this.query());
    const options = Array.isArray(this.field.original)
      ? this.field.original.filter((item): item is string => typeof item === 'string')
      : [];
    return options.filter((option) => normalizeOperationSearch(`${this.display(option)} ${option}`).includes(query));
  });
  readonly error = signal('');
  readonly keepNull = signal(this.field.value === null);
  readonly display = (value: unknown) => argumentDisplay(value, this.data.targets);

  private editorKind(): 'resources' | 'enum' | 'boolean' | 'number' | 'date' | 'json' | 'text' {
    if (/Ids$/.test(this.field.key) && Array.isArray(this.field.original)) return 'resources';
    if (this.enumOptions.length) return 'enum';
    if (typeof this.field.value === 'boolean' || this.field.schema['type'] === 'boolean') return 'boolean';
    if (typeof this.field.value === 'number' || ['number', 'integer'].includes(String(this.field.schema['type']))) {
      return 'number';
    }
    if (this.field.schema['format'] === 'date-time') return 'date';
    return this.field.value !== null && typeof this.field.value === 'object' ? 'json' : 'text';
  }
  private initialValue(): string {
    if (this.kind === 'date' && typeof this.field.value === 'string') {
      const date = new Date(this.field.value);
      if (!Number.isNaN(date.getTime()))
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, -1);
    }
    return this.kind === 'json' ? serializeArgument(this.field.value) : String(this.field.value ?? '');
  }
  toggle(id: string, checked: boolean): void {
    this.selection.update((ids) => (checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id)));
  }
  save(): void {
    if (this.field.locked || this.field.children.length) return;
    try {
      if (this.keepNull()) {
        this.dialog.close({ value: null });
        return;
      }
      const input = String(this.control.value);
      let value: unknown = this.control.value;
      if (this.kind === 'resources') value = this.selection();
      if (this.kind === 'boolean') value = this.booleanValue();
      if (this.kind === 'json') value = JSON.parse(input) as unknown;
      if (this.kind === 'number') {
        value = Number(input);
        if (!input.trim() || !Number.isFinite(value)) throw new Error('Informe um número válido.');
      }
      if (this.kind === 'date') value = new Date(input).toISOString();
      this.dialog.close({ value });
    } catch {
      this.error.set('Valor inválido. Confira o campo antes de salvar.');
    }
  }
}
