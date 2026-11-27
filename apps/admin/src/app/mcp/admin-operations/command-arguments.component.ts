import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { AdminMcpCommand } from '@cacic-fct/event-manager-mcp-contracts';
import { adminOperationArgumentLabel } from './admin-operation-labels';
import { argumentDisplay, type CommandArgument } from './command-arguments';

@Component({
  selector: 'app-command-arguments',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule, MatTooltipModule],
  template: `
    @for (field of visibleFields(); track field.key) {
      <section class="argument" [class.omitted]="!field.included">
        <div class="argument-heading">
          @if (!field.required && !field.locked) {
            <mat-checkbox
              [checked]="field.included"
              [disabled]="disabled() || finalValues() !== null"
              (change)="include.emit({ field, included: $event.checked })"
              >Incluir {{ field.label }}</mat-checkbox
            >
          } @else {
            <h4>
              {{ field.label }}
              <span>{{
                field.locked ? (field.children.length ? 'Contém destinos fixos' : 'Destino fixo') : 'Obrigatório'
              }}</span>
            </h4>
          }
          @if (!field.locked && !field.children.length) {
            <button
              mat-icon-button
              [attr.aria-label]="'Editar ' + field.label"
              [matTooltip]="'Editar ' + field.label"
              [disabled]="disabled() || !field.included || finalValues() !== null"
              (click)="edit.emit({ field, event: $event })">
              <mat-icon>edit</mat-icon>
            </button>
          }
        </div>
        @if (field.children.length && (field.included || hasFinal(field.key))) {
          <app-command-arguments
            [fields]="field.children"
            [targets]="targets()"
            [disabled]="disabled()"
            [finalValues]="nestedFinal(field.key)"
            (include)="include.emit($event)"
            (edit)="edit.emit($event)" />
        } @else if (!field.children.length) {
          @if (changed(field) || finalValues() !== null) {
            <dl class="comparison">
              <div>
                <dt>Enviado pelo aplicativo</dt>
                <dd>{{ display(field.original) }}</dd>
              </div>
              <div>
                <dt>{{ finalValues() !== null ? 'Validado para execução' : 'Sua revisão' }}</dt>
                <dd>
                  {{
                    finalValues() !== null
                      ? finalDisplay(field)
                      : field.included
                        ? display(field.value)
                        : 'Não será aplicado'
                  }}
                </dd>
              </div>
            </dl>
          } @else {
            <p class="value">{{ display(field.value) }}</p>
          }
        } @else {
          <p class="value">Não será aplicado</p>
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .argument {
      display: grid;
      grid-template-columns: minmax(12rem, 0.6fr) minmax(0, 1fr) 3rem;
      align-items: center;
      gap: 0.5rem 1rem;
      padding-block: 0.5rem;
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .argument-heading {
      display: contents;
    }
    .argument-heading > h4,
    .argument-heading > mat-checkbox {
      grid-column: 1;
      grid-row: 1;
    }
    .argument-heading > button {
      grid-column: 3;
      grid-row: 1;
    }
    .value,
    .comparison {
      grid-column: 2;
      grid-row: 1;
    }
    h4 {
      margin: 0;
      font: var(--mat-sys-title-small);
      overflow-wrap: anywhere;
    }
    h4 span {
      display: block;
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .value {
      margin: 0.25rem 0 0.5rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .omitted .value {
      color: var(--mat-sys-on-surface-variant);
    }
    .comparison {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1rem;
      margin: 0.25rem 0 0.5rem;
    }
    dt {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0.25rem 0 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    app-command-arguments {
      grid-column: 1 / -1;
      margin-inline-start: 1rem;
    }
    @media (max-width: 640px) {
      .argument {
        grid-template-columns: minmax(0, 1fr) 3rem;
        gap: 0.25rem;
      }
      .argument-heading > button {
        grid-column: 2;
      }
      .value,
      .comparison {
        grid-column: 1 / -1;
        grid-row: 2;
      }
      .comparison {
        grid-template-columns: minmax(0, 1fr);
        gap: 0.5rem;
      }
    }
  `,
})
export class CommandArgumentsComponent {
  readonly fields = input.required<CommandArgument[]>();
  readonly targets = input<AdminMcpCommand['targets']>([]);
  readonly disabled = input(false);
  readonly finalValues = input<Record<string, unknown> | null>(null);
  readonly visibleFields = computed(() => {
    const fields = this.fields();
    const values = this.finalValues();
    if (values === null) return fields;
    const extra = Object.entries(values).filter(([key]) => !fields.some((field) => field.key === key));
    function normalizedField(key: string, value: unknown): CommandArgument {
      return {
        key,
        label: adminOperationArgumentLabel(key),
        schema: {},
        original: undefined,
        value,
        required: true,
        locked: false,
        included: true,
        children:
          value && typeof value === 'object' && !Array.isArray(value)
            ? Object.entries(value).map(([key, item]) => normalizedField(key, item))
            : [],
      };
    }
    return [...fields, ...extra.map(([key, value]) => normalizedField(key, value))];
  });
  readonly include = output<{ field: CommandArgument; included: boolean }>();
  readonly edit = output<{ field: CommandArgument; event: Event }>();
  display(value: unknown): string {
    return argumentDisplay(value, this.targets());
  }
  changed(field: CommandArgument): boolean {
    return !field.included || JSON.stringify(field.original) !== JSON.stringify(field.value);
  }
  finalDisplay(field: CommandArgument): string {
    const values = this.finalValues();
    return values && Object.hasOwn(values, field.key) ? this.display(values[field.key]) : 'Não será aplicado';
  }
  hasFinal(key: string): boolean {
    return Object.hasOwn(this.finalValues() ?? {}, key);
  }
  nestedFinal(key: string): Record<string, unknown> | null {
    const value = this.finalValues()?.[key];
    return this.finalValues() === null
      ? null
      : value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
  }
}
