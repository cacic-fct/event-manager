import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { toSVG } from '@bwip-js/browser';
import { startWith } from 'rxjs';
import { isValidErrorCorrectionLevel } from '@cacic-fct/shared-utils';
import {
  DEFAULT_SUBSCRIBER_CSV_BADGE_OPTIONS,
  DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS,
  IdentityDocumentExportMode,
  SubscriberBadgeCodeFileName,
  SubscriberBadgeCodeFormat,
  SubscriberCsvExportDialogOptions,
  SubscriberCsvField,
} from '../../subscriber-csv-export';

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
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <div mat-dialog-content>
      <p>{{ data.recordCount }} registros carregados</p>

      <form [formGroup]="form" class="export-form">
        <div class="export-columns" [class.with-badge-options]="hasBadgeCodes()">
          <section class="csv-options" aria-label="Opções do CSV">
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

            <mat-checkbox class="badge-codes-toggle" formControlName="badgeCodes"> Códigos para crachá </mat-checkbox>
          </section>

          @if (hasBadgeCodes()) {
            <section class="badge-options" aria-labelledby="badge-options-title">
              <div class="badge-options-heading">
                <h3 id="badge-options-title">Códigos Aztec</h3>
                <p>Podem ser usados para a confecção de crachás físicos compatíveis com o sistema.</p>
              </div>

              <div class="badge-preview" role="img" aria-label="Prévia do código Aztec">
                @if (trustedPreviewSvg()) {
                  <div [innerHTML]="trustedPreviewSvg()"></div>
                } @else {
                  <p>Não foi possível gerar a prévia do código.</p>
                }
              </div>

              <p class="barcode-copy">
                Os códigos terão o mesmo conteúdo apresentado na <b>Carteira</b> dos usuários: <code>user:id</code>.
                <br />
                Não é possível personalizar o texto. <br />
                Esta prévia usa <code>{{ previewValue() }}</code
                >.
              </p>

              <mat-form-field>
                <mat-label>Nível de correção de erros</mat-label>
                <input matInput formControlName="badgeErrorCorrectionLevel" inputmode="numeric" />
                <mat-hint>Use um valor inteiro entre 5 e 95.</mat-hint>
                @if (hasInvalidErrorCorrectionLevel()) {
                  <mat-error>Informe um valor inteiro entre 5 e 95.</mat-error>
                }
              </mat-form-field>

              <ul class="error-correction-copy">
                <li>23% é o padrão da especificação;</li>
                <li>30-36% é a faixa recomendada para crachás;</li>
                <li>
                  50% pode ser uma escolha se o crachá precisa sobreviver a condições <i>muito</i> severas e não pode
                  ser substituído.
                </li>
              </ul>

              <p class="error-correction-copy">
                Níveis maiores podem manter o código legível se o crachá sujar ou rasgar, mas a leitura pode levar um
                pouco mais de tempo.
                <br />
                Em níveis muito altos, se o código for impresso em tamanho pequeno, a leitura pode falhar.
                <br />
              </p>

              <mat-form-field>
                <mat-label>Formato dos códigos</mat-label>
                <mat-select formControlName="badgeCodeFormat">
                  <mat-option value="svg">SVG</mat-option>
                  <mat-option value="png">PNG</mat-option>
                </mat-select>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Nome dos arquivos</mat-label>
                <mat-select formControlName="badgeFileName">
                  <mat-option value="id">ID do usuário</mat-option>
                  <mat-option value="fullName">Nome completo</mat-option>
                  <mat-option value="identityDocument">Documento de identidade</mat-option>
                </mat-select>
              </mat-form-field>
            </section>
          }
        </div>
      </form>
    </div>

    <div mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="!canConfirm()" (click)="confirm()">
        {{ hasBadgeCodes() ? 'Baixar ZIP' : 'Baixar CSV' }}
      </button>
    </div>
  `,
  styleUrl: './subscriber-csv-export-dialog.component.scss',
})
export class SubscriberCsvExportDialogComponent {
  private readonly dialogRef = inject(
    MatDialogRef<SubscriberCsvExportDialogComponent, SubscriberCsvExportDialogOptions | null>,
  );
  private readonly formBuilder = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly data = inject<SubscriberCsvExportDialogData>(MAT_DIALOG_DATA);
  readonly fieldConfigs = FIELD_CONFIGS;
  private readonly previewUserId = this.createPreviewUserId();

  readonly form = this.formBuilder.nonNullable.group({
    fullName: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('fullName')],
    email: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('email')],
    identityDocument: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('identityDocument')],
    enrollmentNumber: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('enrollmentNumber')],
    unespRole: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('unespRole')],
    phone: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.fields.includes('phone')],
    identityDocumentMode: [DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS.identityDocumentMode],
    badgeCodes: [DEFAULT_SUBSCRIBER_CSV_BADGE_OPTIONS.enabled],
    badgeErrorCorrectionLevel: [
      DEFAULT_SUBSCRIBER_CSV_BADGE_OPTIONS.errorCorrectionLevel,
      [Validators.required, Validators.pattern(/^(?:[5-9]|[1-8]\d|9[0-5])$/)],
    ],
    badgeCodeFormat: [DEFAULT_SUBSCRIBER_CSV_BADGE_OPTIONS.format],
    badgeFileName: [DEFAULT_SUBSCRIBER_CSV_BADGE_OPTIONS.fileName],
  });

  private readonly formValue = toSignal(this.form.valueChanges.pipe(startWith(this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });

  readonly isIdentityDocumentSelected = computed(() => Boolean(this.formValue().identityDocument));
  readonly hasBadgeCodes = computed(() => this.formValue().badgeCodes);
  readonly hasInvalidErrorCorrectionLevel = computed(() => {
    this.formValue();
    return this.form.controls.badgeErrorCorrectionLevel.invalid;
  });
  readonly previewValue = computed(() => (this.previewUserId ? `user:${this.previewUserId}` : 'user:id'));
  readonly trustedPreviewSvg = computed<SafeHtml | ''>(() => {
    const errorCorrectionLevel = this.formValue().badgeErrorCorrectionLevel;
    if (!this.previewUserId || !isValidErrorCorrectionLevel(errorCorrectionLevel)) {
      return '';
    }

    try {
      return this.sanitizer.bypassSecurityTrustHtml(
        toSVG({
          bcid: 'azteccode',
          text: this.previewValue(),
          height: 300,
          width: 300,
          includetext: false,
          textxalign: 'center',
          // @ts-expect-error - bwip-js supports eclevel for azteccode.
          eclevel: Number(errorCorrectionLevel),
        }),
      );
    } catch {
      return '';
    }
  });

  readonly canConfirm = computed(
    () => this.selectedFields().length > 0 && (!this.hasBadgeCodes() || !this.hasInvalidErrorCorrectionLevel()),
  );

  confirm(): void {
    if (!this.canConfirm()) {
      return;
    }

    this.dialogRef.close({
      fields: this.selectedFields(),
      identityDocumentMode: this.form.controls.identityDocumentMode.value as IdentityDocumentExportMode,
      badgeCodes: {
        enabled: this.hasBadgeCodes(),
        errorCorrectionLevel: this.form.controls.badgeErrorCorrectionLevel.value,
        format: this.form.controls.badgeCodeFormat.value as SubscriberBadgeCodeFormat,
        fileName: this.form.controls.badgeFileName.value as SubscriberBadgeCodeFileName,
      },
    });
  }

  private createPreviewUserId(): string {
    return this.isBrowser && typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : '';
  }

  private selectedFields(): SubscriberCsvField[] {
    const value = this.formValue();
    return FIELD_CONFIGS.filter((config) => Boolean(value[config.field])).map((config) => config.field);
  }
}
