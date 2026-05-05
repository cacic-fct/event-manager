import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  SUBSCRIPTION_STATUS_VALUES,
  getSubscriptionStatusLabel,
} from '@cacic-eventos/shared-utils';
import { startWith } from 'rxjs';
import {
  MajorEventSubscriptionCsvColumnMapping,
  SubscriptionStatus,
} from '../../graphql/models';

export interface SubscriptionCsvColumnDialogData {
  fileName: string;
  headers: string[];
  previewRows: Record<string, string>[];
}

export interface SubscriptionCsvColumnDialogResult {
  columnMapping: MajorEventSubscriptionCsvColumnMapping;
  subscriptionStatus: SubscriptionStatus;
}

type ColumnRole =
  | ''
  | 'emailHeader'
  | 'fullNameHeader'
  | 'enrollmentNumberHeader'
  | 'identityDocumentHeader'
  | 'subscribedEventIdsHeader';

const COLUMN_ROLE_OPTIONS: Array<{ value: ColumnRole; label: string }> = [
  { value: '', label: 'Ignorar coluna' },
  { value: 'emailHeader', label: 'E-mail' },
  { value: 'fullNameHeader', label: 'Nome completo' },
  { value: 'enrollmentNumberHeader', label: 'Matrícula' },
  { value: 'identityDocumentHeader', label: 'Documento de identidade' },
  { value: 'subscribedEventIdsHeader', label: 'IDs dos eventos inscritos' },
];

@Component({
  selector: 'app-subscription-csv-column-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatListModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>Importar inscrições</h2>
    <div mat-dialog-content>
      <p>{{ data.fileName }}</p>
      <form [formGroup]="form" class="column-form">
        <mat-form-field>
          <mat-label>Importar como status</mat-label>
          <mat-select formControlName="subscriptionStatus">
            @for (status of subscriptionStatuses; track status) {
              <mat-option [value]="status">
                {{ statusLabel(status) }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>

        @for (header of data.headers; track header) {
          <mat-form-field>
            <mat-label>{{ header }}</mat-label>
            <mat-select [formControlName]="header">
              @for (option of columnRoleOptions; track option.value) {
                <mat-option
                  [value]="option.value"
                  [disabled]="isRoleUnavailable(option.value, header)"
                >
                  {{ option.label }}
                </mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
      </form>

      @if (previewValues().length > 0) {
        <mat-list>
          @for (value of previewValues(); track value) {
            <mat-list-item>
              <span matListItemTitle>{{ value }}</span>
            </mat-list-item>
          }
        </mat-list>
      }
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        type="button"
        [disabled]="!canConfirm()"
        (click)="confirm()"
      >
        Importar
      </button>
    </div>
  `,
  styleUrl: './subscription-csv-column-dialog.component.scss',
})
export class SubscriptionCsvColumnDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<
      SubscriptionCsvColumnDialogComponent,
      SubscriptionCsvColumnDialogResult | null
    >,
  );
  private readonly formBuilder = inject(FormBuilder);
  readonly data = inject<SubscriptionCsvColumnDialogData>(MAT_DIALOG_DATA);

  readonly columnRoleOptions = COLUMN_ROLE_OPTIONS;
  readonly subscriptionStatuses = SUBSCRIPTION_STATUS_VALUES;

  readonly form = this.formBuilder.nonNullable.group({
    subscriptionStatus: [
      'CONFIRMED' as SubscriptionStatus,
      Validators.required,
    ],
    ...this.data.headers.reduce<Record<string, [ColumnRole]>>(
      (controls, header) => {
        controls[header] = [''];
        return controls;
      },
      {},
    ),
  });

  private readonly formValue = toSignal(
    this.form.valueChanges.pipe(startWith(this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  readonly previewValues = computed(() => {
    const mapping = this.buildColumnMapping();
    const previewHeader = mapping.subscribedEventIdsHeader;
    if (!previewHeader) {
      return [];
    }

    return this.data.previewRows
      .map((row) => row[previewHeader]?.trim() ?? '')
      .filter((value) => value.length > 0)
      .slice(0, 8);
  });

  readonly canConfirm = computed(() => {
    if (this.form.invalid) {
      return false;
    }

    const mapping = this.buildColumnMapping();
    return (
      Boolean(mapping.subscribedEventIdsHeader) &&
      [
        mapping.emailHeader,
        mapping.fullNameHeader,
        mapping.enrollmentNumberHeader,
        mapping.identityDocumentHeader,
      ].some((header) => Boolean(header))
    );
  });

  statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  isRoleUnavailable(role: ColumnRole, currentHeader: string): boolean {
    if (!role) {
      return false;
    }

    const value = this.currentFormValue();
    return this.data.headers.some(
      (header) => header !== currentHeader && value[header] === role,
    );
  }

  confirm(): void {
    if (!this.canConfirm()) {
      this.form.markAllAsTouched();
      return;
    }

    this.dialogRef.close({
      columnMapping: this.buildColumnMapping(),
      subscriptionStatus: this.form.controls.subscriptionStatus.value,
    });
  }

  private buildColumnMapping(): MajorEventSubscriptionCsvColumnMapping {
    const value = this.currentFormValue();
    const mapping = this.data.headers.reduce<
      Partial<MajorEventSubscriptionCsvColumnMapping>
    >((columnMapping, header) => {
      const role = value[header] as ColumnRole;
      if (role) {
        columnMapping[role] = header;
      }
      return columnMapping;
    }, {});

    return {
      emailHeader: mapping.emailHeader ?? null,
      fullNameHeader: mapping.fullNameHeader ?? null,
      enrollmentNumberHeader: mapping.enrollmentNumberHeader ?? null,
      identityDocumentHeader: mapping.identityDocumentHeader ?? null,
      subscribedEventIdsHeader: mapping.subscribedEventIdsHeader ?? '',
    };
  }

  private currentFormValue(): Record<
    string,
    ColumnRole | SubscriptionStatus | undefined
  > {
    return this.formValue() as Record<
      string,
      ColumnRole | SubscriptionStatus | undefined
    >;
  }
}
