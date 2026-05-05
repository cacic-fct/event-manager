import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MergeCandidate, Person, PersonMergeField } from '../../graphql/models';

export type MergeCandidateDialogResult = {
  targetPersonId: string;
  migrateFields: PersonMergeField[];
};

type MergeFieldControlName =
  | 'migrateName'
  | 'migrateEmail'
  | 'migrateIdentityDocument'
  | 'migrateAcademicId'
  | 'migrateUserId'
  | 'migrateExternalRef';

type MergeFieldOption = {
  key: PersonMergeField;
  controlName: MergeFieldControlName;
  label: string;
  valueAccessor: (person: Person) => string | null | undefined;
};

type MergeCandidateDialogData = {
  candidate: MergeCandidate;
};

const FIELD_OPTIONS: MergeFieldOption[] = [
  {
    key: 'NAME',
    controlName: 'migrateName',
    label: 'Nome',
    valueAccessor: (person) => person.name,
  },
  {
    key: 'EMAIL',
    controlName: 'migrateEmail',
    label: 'Email',
    valueAccessor: (person) => person.email,
  },
  {
    key: 'IDENTITY_DOCUMENT',
    controlName: 'migrateIdentityDocument',
    label: 'CPF / documento',
    valueAccessor: (person) => person.identityDocument,
  },
  {
    key: 'ACADEMIC_ID',
    controlName: 'migrateAcademicId',
    label: 'Matrícula (RA)',
    valueAccessor: (person) => person.academicId,
  },
  {
    key: 'USER_ID',
    controlName: 'migrateUserId',
    label: 'ID do usuário vinculado',
    valueAccessor: (person) => person.userId,
  },
  {
    key: 'EXTERNAL_REF',
    controlName: 'migrateExternalRef',
    label: 'Referência externa',
    valueAccessor: (person) => person.externalRef,
  },
];

@Component({
  selector: 'app-merge-candidate-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatTabsModule,
  ],
  template: `
    <h2 mat-dialog-title>Unificar pessoas duplicadas</h2>
    <div mat-dialog-content [formGroup]="form" class="content">
      <header class="dialog-header">
        <p>
          Cada aba mostra quem será mantido como cadastro principal. Marque
          apenas os campos que devem ser copiados do cadastro que será removido.
        </p>
      </header>

      <mat-tab-group
        animationDuration="160ms"
        mat-stretch-tabs="false"
        [selectedIndex]="selectedTargetIndex"
        (selectedIndexChange)="selectTargetIndex($event)"
      >
        <mat-tab>
          <ng-template mat-tab-label>
            <span class="tab-label">
              Manter
              <strong>{{ personA.name }}</strong>
            </span>
          </ng-template>
          <ng-template
            [ngTemplateOutlet]="mergePreview"
            [ngTemplateOutletContext]="{ target: personA, source: personB }"
          />
        </mat-tab>

        <mat-tab>
          <ng-template mat-tab-label>
            <span class="tab-label">
              Manter
              <strong>{{ personB.name }}</strong>
            </span>
          </ng-template>
          <ng-template
            [ngTemplateOutlet]="mergePreview"
            [ngTemplateOutletContext]="{ target: personB, source: personA }"
          />
        </mat-tab>
      </mat-tab-group>

      <ng-template #mergePreview let-target="target" let-source="source">
        <section class="merge-summary" aria-label="Resumo da unificação">
          <div class="person-panel kept">
            <span class="panel-kicker">Será mantido</span>
            <strong>{{ target.name }}</strong>
            <span>{{ target.id }}</span>
          </div>

          <div class="person-panel removed">
            <span class="panel-kicker">Será removido</span>
            <strong>{{ source.name }}</strong>
            <span>{{ source.id }}</span>
          </div>
        </section>

        <section class="field-grid" aria-label="Campos para copiar">
          <header class="field-header">
            <span>Campo</span>
            <span>Valor mantido agora</span>
            <span>Valor do removido</span>
            <span>Ação</span>
          </header>

          @for (field of fieldOptions; track field.key) {
            <div
              class="field-row"
              [class.selected-field-row]="isFieldSelected(field)"
            >
              <mat-checkbox [formControlName]="field.controlName" />
              <span class="field-name">{{ field.label }}</span>
              <span class="value kept-value">
                {{ displayValue(field.valueAccessor(target)) }}
              </span>
              <span class="value source-value">
                {{ displayValue(field.valueAccessor(source)) }}
              </span>
              <span class="field-action">
                @if (isFieldSelected(field)) {
                  Copiar do removido
                } @else {
                  Manter valor atual
                }
              </span>
            </div>
          }
        </section>
      </ng-template>
    </div>
    <div mat-dialog-actions>
      <button mat-button mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        (click)="confirmMerge()"
        [disabled]="form.invalid"
      >
        Unificar
      </button>
    </div>
  `,
  styles: [
    `
      .content {
        display: grid;
        gap: 1rem;
        min-width: min(48rem, calc(100vw - 3rem));
      }

      .dialog-header p {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }

      .tab-label {
        display: inline-flex;
        min-width: 0;
        align-items: center;
        gap: 0.35rem;
      }

      .tab-label strong {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .merge-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        padding: 1rem 0;
      }

      .person-panel {
        display: grid;
        min-width: 0;
        gap: 0.25rem;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        padding: 0.875rem;
      }

      .person-panel strong,
      .person-panel span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .kept {
        background: color-mix(in srgb, var(--mat-sys-primary) 9%, transparent);
        border-color: color-mix(
          in srgb,
          var(--mat-sys-primary) 42%,
          var(--mat-sys-outline-variant)
        );
      }

      .removed {
        background: color-mix(
          in srgb,
          var(--mat-sys-error-container) 32%,
          transparent
        );
      }

      .panel-kicker,
      .field-header,
      .field-action {
        color: var(--mat-sys-on-surface-variant);
        font: var(--mat-sys-body-small);
      }

      .field-grid {
        display: grid;
        gap: 0.375rem;
      }

      .field-header,
      .field-row {
        display: grid;
        grid-template-columns:
          auto minmax(8rem, 0.75fr) minmax(9rem, 1fr) minmax(9rem, 1fr)
          minmax(8rem, 0.85fr);
        gap: 0.75rem;
        align-items: center;
      }

      .field-header {
        grid-template-columns:
          minmax(8rem, 0.75fr) minmax(9rem, 1fr) minmax(9rem, 1fr)
          minmax(8rem, 0.85fr);
        padding: 0 0.875rem 0.25rem 3.5rem;
      }

      .field-row {
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        padding: 0.625rem 0.875rem;
      }

      .selected-field-row {
        background: color-mix(in srgb, var(--mat-sys-primary) 7%, transparent);
        border-color: color-mix(
          in srgb,
          var(--mat-sys-primary) 35%,
          var(--mat-sys-outline-variant)
        );
      }

      .field-name,
      .value,
      .field-action {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .field-name {
        font-weight: 500;
      }

      .source-value {
        color: var(--mat-sys-primary);
      }

      @media (max-width: 760px) {
        .content {
          min-width: 0;
        }

        .merge-summary {
          grid-template-columns: 1fr;
        }

        .field-header {
          display: none;
        }

        .field-row {
          grid-template-columns: auto 1fr;
        }

        .value,
        .field-action {
          grid-column: 2;
        }

        .kept-value::before {
          content: 'Atual: ';
          color: var(--mat-sys-on-surface-variant);
        }

        .source-value::before {
          content: 'Removido: ';
          color: var(--mat-sys-on-surface-variant);
        }
      }
    `,
  ],
})
export class MergeCandidateDialogComponent {
  private readonly data = inject<MergeCandidateDialogData>(MAT_DIALOG_DATA);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dialogRef = inject(
    MatDialogRef<
      MergeCandidateDialogComponent,
      MergeCandidateDialogResult | null
    >,
  );

  readonly candidate = this.data.candidate;
  readonly personA = this.ensurePerson(this.candidate.personA, 'personA');
  readonly personB = this.ensurePerson(this.candidate.personB, 'personB');
  readonly fieldOptions = FIELD_OPTIONS;

  readonly form = this.formBuilder.nonNullable.group({
    targetPersonId: [this.personA.id, [Validators.required]],
    migrateName: [false],
    migrateEmail: [false],
    migrateIdentityDocument: [false],
    migrateAcademicId: [false],
    migrateUserId: [false],
    migrateExternalRef: [false],
  });

  constructor() {
    this.applySuggestedFieldSelection();
    this.form.controls.targetPersonId.valueChanges.subscribe(() => {
      this.applySuggestedFieldSelection();
    });
  }

  get selectedTargetIndex(): number {
    return this.form.controls.targetPersonId.value === this.personB.id ? 1 : 0;
  }

  selectTargetIndex(index: number): void {
    this.form.controls.targetPersonId.setValue(
      index === 1 ? this.personB.id : this.personA.id,
    );
  }

  confirmMerge(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const migrateFields = this.fieldOptions
      .filter((field) => this.readFieldControl(field.controlName, raw))
      .map((field) => field.key);

    this.dialogRef.close({
      targetPersonId: raw.targetPersonId,
      migrateFields,
    });
  }

  displayValue(value: string | null | undefined): string {
    const normalized = value?.trim();
    return normalized || '-';
  }

  isFieldSelected(field: MergeFieldOption): boolean {
    return this.form.controls[field.controlName].value;
  }

  private getTargetPerson(): Person {
    const targetId = this.form.controls.targetPersonId.value;
    return targetId === this.personA.id ? this.personA : this.personB;
  }

  private getSourcePerson(): Person {
    const targetId = this.form.controls.targetPersonId.value;
    return targetId === this.personA.id ? this.personB : this.personA;
  }

  private applySuggestedFieldSelection(): void {
    const target = this.getTargetPerson();
    const source = this.getSourcePerson();

    for (const field of this.fieldOptions) {
      const sourceValue = field.valueAccessor(source)?.trim();
      const targetValue = field.valueAccessor(target)?.trim();
      this.setFieldControl(
        field.controlName,
        !!sourceValue && !targetValue,
        false,
      );
    }
  }

  private ensurePerson(
    person: Person | null | undefined,
    position: string,
  ): Person {
    if (!person) {
      throw new Error(`Candidato de unificação sem ${position}.`);
    }

    return person;
  }

  private readFieldControl(
    controlName: MergeFieldControlName,
    rawValue: ReturnType<typeof this.form.getRawValue>,
  ): boolean {
    if (controlName === 'migrateName') {
      return rawValue.migrateName;
    }
    if (controlName === 'migrateEmail') {
      return rawValue.migrateEmail;
    }
    if (controlName === 'migrateIdentityDocument') {
      return rawValue.migrateIdentityDocument;
    }
    if (controlName === 'migrateAcademicId') {
      return rawValue.migrateAcademicId;
    }
    if (controlName === 'migrateUserId') {
      return rawValue.migrateUserId;
    }
    return rawValue.migrateExternalRef;
  }

  private setFieldControl(
    controlName: MergeFieldControlName,
    value: boolean,
    emitEvent: boolean,
  ): void {
    if (controlName === 'migrateName') {
      this.form.controls.migrateName.setValue(value, { emitEvent });
      return;
    }
    if (controlName === 'migrateEmail') {
      this.form.controls.migrateEmail.setValue(value, { emitEvent });
      return;
    }
    if (controlName === 'migrateIdentityDocument') {
      this.form.controls.migrateIdentityDocument.setValue(value, { emitEvent });
      return;
    }
    if (controlName === 'migrateAcademicId') {
      this.form.controls.migrateAcademicId.setValue(value, { emitEvent });
      return;
    }
    if (controlName === 'migrateUserId') {
      this.form.controls.migrateUserId.setValue(value, { emitEvent });
      return;
    }
    this.form.controls.migrateExternalRef.setValue(value, { emitEvent });
  }
}
