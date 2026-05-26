import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { startWith } from 'rxjs';
import {
  DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS,
  IdentityDocumentExportMode,
  SubscriberCsvExportOptions,
  SubscriberCsvField,
} from '../../shared/subscriber-csv-export';

export interface SubscriberCsvExportDialogData {
  title: string;
  recordCount: number;
}

type SubscriberCsvFieldConfig = {
  field: SubscriberCsvField;
  label: string;
};

const FIELD_CONFIGS: SubscriberCsvFieldConfig[] = [
  { field: 'fullName', label: 'Nome completo' },
  { field: 'email', label: 'E-mail' },
  { field: 'identityDocument', label: 'Documento de identidade' },
  { field: 'enrollmentNumber', label: 'Matrícula' },
  { field: 'unespRole', label: 'Vínculo Unesp' },
  { field: 'phone', label: 'Telefone' },
];

@Component({
  selector: 'app-subscriber-csv-export-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <div mat-dialog-content>
      <p>{{ data.recordCount }} registros carregados</p>

      <form [formGroup]="form" class="export-form">
        <div class="field-list">
          @for (config of fieldConfigs; track config.field) {
            <mat-checkbox [formControlName]="config.field">
              {{ config.label }}
            </mat-checkbox>

            @if (config.field === 'identityDocument' && isIdentityDocumentSelected()) {
              <mat-form-field class="identity-document-options">
                <mat-label>Formato do documento</mat-label>
                <mat-select formControlName="identityDocumentMode">
                  <mat-option value="masked">Censurado (•••.000.000-••)</mat-option>
                  <mat-option value="complete">Completo</mat-option>
                </mat-select>
              </mat-form-field>
            }
          }
        </div>
      </form>
    </div>

    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="!canConfirm()" (click)="confirm()">Baixar CSV</button>
    </div>
  `,
  styleUrl: './subscriber-csv-export-dialog.component.scss',
})
export class SubscriberCsvExportDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<SubscriberCsvExportDialogComponent, SubscriberCsvExportOptions | null>,
  );
  private readonly formBuilder = inject(FormBuilder);
  readonly data = inject<SubscriberCsvExportDialogData>(MAT_DIALOG_DATA);
  readonly fieldConfigs = FIELD_CONFIGS;

  readonly form = this.formBuilder.nonNullable.group({
    fullName: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('fullName')],
    email: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('email')],
    identityDocument: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('identityDocument')],
    enrollmentNumber: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('enrollmentNumber')],
    unespRole: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('unespRole')],
    phone: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('phone')],
    identityDocumentMode: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.identityDocumentMode],
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isIdentityDocumentSelected = computed(() => Boolean(this.formValue().identityDocument));
  readonly canConfirm = computed(() => this.selectedFields().length > 0);

  confirm(): void {
    if (!this.canConfirm()) {
      return;
    }

    this.dialogRef.close({
      fields: this.selectedFields(),
      identityDocumentMode: this.form.controls.identityDocumentMode.value as IdentityDocumentExportMode,
    });
  }

  private selectedFields(): SubscriberCsvField[] {
    const value = this.formValue();
    return FIELD_CONFIGS.filter((config) => Boolean(value[config.field])).map((config) => config.field);
  }
}
