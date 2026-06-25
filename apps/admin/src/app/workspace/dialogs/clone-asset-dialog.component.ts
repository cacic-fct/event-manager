import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

export type CloneAssetPartKey =
  | 'lecturers'
  | 'certificateConfig'
  | 'subscriptionSettings'
  | 'attendanceSettings'
  | 'place'
  | 'visibility'
  | 'paymentSettings';

export type CloneAssetPartOption = {
  key: CloneAssetPartKey;
  label: string;
  description: string;
  defaultSelected?: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

export type CloneAssetDialogData = {
  title: string;
  sourceLabel: string;
  sourceName: string;
  defaultName: string;
  parts: CloneAssetPartOption[];
};

export type CloneAssetDialogResult = {
  name: string;
  parts: Partial<Record<CloneAssetPartKey, boolean>>;
};

@Component({
  selector: 'app-clone-asset-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <div mat-dialog-content class="content">
      <header class="dialog-header">
        <p>Crie um novo cadastro usando somente as partes reutilizáveis selecionadas.</p>
      </header>

      <section class="clone-summary" aria-label="Resumo da duplicação">
        <div class="asset-panel source">
          <span class="panel-kicker">Origem</span>
          <strong>{{ data.sourceName }}</strong>
          <span>{{ data.sourceLabel }}</span>
        </div>

        <div class="asset-panel clone">
          <span class="panel-kicker">Novo cadastro</span>
          <strong>{{ form.controls.name.value || data.defaultName }}</strong>
          <span>Dados operacionais não serão copiados.</span>
        </div>
      </section>

      <form [formGroup]="form" class="name-form">
        <mat-form-field>
          <mat-label>Nome do novo cadastro</mat-label>
          <input matInput formControlName="name" />
        </mat-form-field>
      </form>

      <section class="field-grid" aria-label="Partes para copiar">
        <header class="field-header">
          <span>Parte</span>
          <span>Como será usada</span>
          <span>Ação</span>
        </header>

        @for (part of data.parts; track part.key) {
          <div
            class="field-row"
            [class.selected-field-row]="partControl(part.key).value"
            [class.disabled-field-row]="part.disabled">
            <mat-checkbox [formControl]="partControl(part.key)" />
            <span class="field-name">{{ part.label }}</span>
            <span class="field-description">
              {{ part.disabled ? part.disabledReason : part.description }}
            </span>
            <span class="field-action">
              @if (part.disabled) {
                Indisponível
              } @else if (partControl(part.key).value) {
                Copiar configuração
              } @else {
                Usar padrão novo
              }
            </span>
          </div>
        }
      </section>
    </div>
    <div mat-dialog-actions>
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" (click)="confirmClone()" [disabled]="form.invalid">
        <mat-icon>content_copy</mat-icon>
        Duplicar
      </button>
    </div>
  `,
  styles: [
    `
      .content {
        display: grid;
        gap: 1rem;
        min-width: min(50rem, calc(100vw - 3rem));
      }

      .dialog-header p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }

      .clone-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
      }

      .asset-panel {
        display: grid;
        min-width: 0;
        gap: 0.25rem;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        padding: 0.875rem;
      }

      .asset-panel strong,
      .asset-panel span {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .source {
        background: color-mix(in srgb, var(--mat-sys-surface-container-high) 68%, transparent);
      }

      .clone {
        background: color-mix(in srgb, var(--mat-sys-primary) 9%, transparent);
        border-color: color-mix(in srgb, var(--mat-sys-primary) 42%, var(--mat-sys-outline-variant));
      }

      .panel-kicker,
      .field-header,
      .field-action,
      .field-description {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }

      .name-form {
        display: grid;
      }

      .field-grid {
        display: grid;
        gap: 0.375rem;
      }

      .field-header,
      .field-row {
        display: grid;
        grid-template-columns: minmax(10rem, 0.75fr) minmax(14rem, 1fr) minmax(8rem, 0.65fr);
        gap: 0.75rem;
        align-items: center;
      }

      .field-header {
        padding: 0 0.875rem 0.25rem 3.5rem;
      }

      .field-row {
        grid-template-columns: auto minmax(10rem, 0.75fr) minmax(14rem, 1fr) minmax(8rem, 0.65fr);
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        padding: 0.625rem 0.875rem;
      }

      .field-row span {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .field-name {
        font-weight: 500;
      }

      .selected-field-row {
        background: color-mix(in srgb, var(--mat-sys-primary) 7%, transparent);
      }

      .disabled-field-row {
        opacity: 0.72;
      }

      @media (max-width: 760px) {
        .content {
          min-width: 0;
        }

        .clone-summary {
          grid-template-columns: 1fr;
        }

        .field-header {
          display: none;
        }

        .field-row {
          grid-template-columns: auto 1fr;
        }

        .field-description,
        .field-action {
          grid-column: 2;
        }
      }
    `,
  ],
})
export class CloneAssetDialogComponent {
  protected readonly data = inject<CloneAssetDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CloneAssetDialogComponent, CloneAssetDialogResult | null>);

  protected readonly form = new FormGroup({
    name: new FormControl(this.data.defaultName, {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  private readonly partControls = this.buildPartControls();

  protected partControl(key: CloneAssetPartKey): FormControl<boolean> {
    const control = this.partControls.get(key);
    if (!control) {
      throw new Error(`Clone option ${key} is not available.`);
    }
    return control;
  }

  protected confirmClone(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const parts: Partial<Record<CloneAssetPartKey, boolean>> = {};
    for (const part of this.data.parts) {
      parts[part.key] = !part.disabled && this.partControl(part.key).value;
    }

    this.dialogRef.close({
      name: this.form.controls.name.value.trim(),
      parts,
    });
  }

  private buildPartControls(): Map<CloneAssetPartKey, FormControl<boolean>> {
    return new Map(
      this.data.parts.map((part) => [
        part.key,
        new FormControl(
          {
            value: Boolean(part.defaultSelected) && !part.disabled,
            disabled: Boolean(part.disabled),
          },
          {
            nonNullable: true,
          },
        ),
      ]),
    );
  }
}
