import { Component, ElementRef, Injector, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { AdminMcpCommand, AdminMcpCommandPreview } from '@cacic-fct/event-manager-mcp-contracts';
import { ReviewTextComparisonComponent } from '../../shared/review-queue/review-text-comparison.component';
import { mcpErrorMessage } from '../mcp-api.service';
import { adminOperationArgumentLabel } from './admin-operation-labels';
import { CommandTargetsComponent } from './command-targets.component';
import { AdminOperationsApi } from './admin-operations-api.service';

interface ArgumentField {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'boolean' | 'json';
  required: boolean;
  locked: boolean;
  included: boolean;
  control: FormControl<string>;
}
function argumentKind(value: unknown): ArgumentField['kind'] {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'text';
  return 'json';
}

export function serializeArgument(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'Sem valor';
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
    ReviewTextComparisonComponent,
    CommandTargetsComponent,
  ],
  template: `
    <h2 mat-dialog-title>{{ command.operationLabel }}</h2>
    <mat-dialog-content>
      <p>{{ command.effects }}</p>
      <app-command-targets [targets]="command.targets ?? []" />
      <p>Confira os argumentos enviados pelo aplicativo. Os identificadores do destino permanecem fixos.</p>
      @if (error()) {
        <p #alert role="alert" tabindex="-1">{{ error() }}</p>
      }
      @for (field of fields; track field.key) {
        <section>
          <h3>{{ field.label }}</h3>
          <app-review-text-comparison
            beforeLabel="Enviado pelo aplicativo"
            afterLabel="Revisado por você"
            [before]="serialize(command.arguments[field.key])"
            [after]="field.included ? field.control.value : 'Não incluir'" />
          @if (!field.required && !field.locked) {
            <mat-checkbox [checked]="field.included" [disabled]="busy()" (change)="include(field, $event.checked)"
              >Incluir {{ field.label }}</mat-checkbox
            >
          }
          @if (field.included) {
            @if (field.kind === 'boolean') {
              <mat-checkbox
                [checked]="field.control.value === 'true'"
                [disabled]="field.locked || busy()"
                (change)="changeBoolean(field, $event.checked)"
                >{{ field.label }} para aplicar</mat-checkbox
              >
            } @else {
              <mat-form-field appearance="outline">
                <mat-label
                  >{{ field.label }} para aplicar{{ field.kind === 'json' ? ' (JSON avançado)' : '' }}</mat-label
                >
                <textarea
                  matInput
                  [formControl]="field.control"
                  [readonly]="field.locked || busy()"
                  rows="3"></textarea>
                @if (field.kind === 'json') {
                  <mat-hint>Objeto, lista ou valor JSON. A validação final ocorre no servidor.</mat-hint>
                }
              </mat-form-field>
            }
          }
        </section>
      }
      @if (preview(); as final) {
        <section aria-label="Confirmação final">
          <h3>Será aplicado</h3>
          <p>{{ final.effects }}</p>
          <app-review-text-comparison
            beforeLabel="Enviado pelo aplicativo"
            afterLabel="Argumentos finais validados"
            [before]="serialize(command.arguments)"
            [after]="serialize(final.arguments)" />
          <p>Aprovar executa esta operação uma única vez com os argumentos finais acima.</p>
        </section>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close [disabled]="busy()">Cancelar</button>
      @if (preview()) {
        <button mat-flat-button [disabled]="busy()" (click)="approve()">Aprovar e executar</button>
      } @else {
        <button mat-flat-button [disabled]="busy() || executionAttempted() || !hasArguments()" (click)="prepare()">
          Conferir argumentos finais
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: `
    mat-form-field {
      width: 100%;
      margin-top: 0.75rem;
    }
    section + section {
      border-top: 1px solid var(--mat-sys-outline-variant);
      margin-top: 1rem;
      padding-top: 0.75rem;
    }
    h3 {
      font: var(--mat-sys-title-medium);
    }
    [role='alert'] {
      color: var(--mat-sys-error);
    }
  `,
})
export class CommandReviewDialogComponent {
  readonly command = inject<AdminMcpCommand>(MAT_DIALOG_DATA);
  private readonly api = inject(AdminOperationsApi);
  private readonly dialog = inject<MatDialogRef<CommandReviewDialogComponent, boolean>>(MatDialogRef);
  private readonly injector = inject(Injector);
  private readonly alert = viewChild<ElementRef<HTMLParagraphElement>>('alert');
  readonly preview = signal<AdminMcpCommandPreview | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly executionAttempted = signal(false);
  readonly serialize = serializeArgument;
  private revision = 0;
  readonly fields = this.buildFields();

  private buildFields(): ArgumentField[] {
    const schema = this.command.inputSchema;
    const properties = schema['properties'];
    const required = Array.isArray(schema['required']) ? schema['required'] : [];
    return Object.entries(this.command.arguments).map(([key, value]) => {
      const definition =
        properties && typeof properties === 'object' ? (properties as Record<string, unknown>)[key] : null;
      const info = definition && typeof definition === 'object' ? (definition as Record<string, unknown>) : {};
      const kind = argumentKind(value);
      const control = new FormControl(kind === 'text' ? String(value) : serializeArgument(value), {
        nonNullable: true,
      });
      control.valueChanges.subscribe(() => this.invalidate());
      return {
        key,
        label: typeof info['title'] === 'string' ? info['title'] : adminOperationArgumentLabel(key),
        kind,
        required: required.includes(key),
        locked: /(^id$|Id$|Ids$)/.test(key),
        included: true,
        control,
      };
    });
  }
  invalidate(): void {
    this.revision++;
    this.preview.set(null);
  }
  include(field: ArgumentField, included: boolean): void {
    field.included = included;
    this.invalidate();
  }
  changeBoolean(field: ArgumentField, value: boolean): void {
    field.control.setValue(String(value));
  }
  hasArguments(): boolean {
    return !this.fields.length || this.fields.some((field) => field.included);
  }
  async prepare(): Promise<void> {
    if (this.busy() || this.executionAttempted()) return;
    this.error.set('');
    this.preview.set(null);
    const revision = this.revision;
    this.busy.set(true);
    try {
      const args = Object.fromEntries(
        this.fields
          .filter((field) => field.included)
          .map((field) => [
            field.key,
            field.kind === 'text' ? field.control.value : (JSON.parse(field.control.value) as unknown),
          ]),
      );
      const preview = await this.api.review(this.command.id, {
        arguments: args,
        expectedFingerprint: this.command.fingerprint,
      });
      if (revision === this.revision) this.preview.set(preview);
    } catch (error) {
      this.showError(error, 'Não foi possível validar. Confira os valores e o JSON e tente novamente.');
    } finally {
      this.busy.set(false);
    }
  }
  async approve(): Promise<void> {
    const review = this.preview();
    if (!review || this.busy()) return;
    this.busy.set(true);
    this.dialog.disableClose = true;
    this.executionAttempted.set(true);
    try {
      const result = await this.api.decide(this.command.id, {
        decision: 'APPROVE',
        expectedFingerprint: this.command.fingerprint,
        review,
      });
      if (result?.state === 'UNCERTAIN' || result?.state === 'APPLYING') {
        this.preview.set(null);
        this.showError(
          new Error('O resultado é incerto. Não repita a operação; feche esta revisão e confira o histórico.'),
          '',
        );
        return;
      }
      this.dialog.close(true);
    } catch (error) {
      this.preview.set(null);
      this.showError(
        error,
        'A execução não foi confirmada. Feche esta revisão e confira o estado da fila e o histórico antes de agir.',
      );
    } finally {
      this.busy.set(false);
      this.dialog.disableClose = false;
    }
  }
  private showError(error: unknown, fallback: string): void {
    this.error.set(mcpErrorMessage(error, fallback));
    afterNextRender(() => this.alert()?.nativeElement.focus(), { injector: this.injector });
  }
}
