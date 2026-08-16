import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import type { SportsLossReason, SportsMatchActionType } from '@cacic-fct/shared-data-types';

type EventualCorrectionKind = 'SCORE_DELTA' | 'SCORE' | 'RESULT' | 'OCCURRENCE' | 'CANCEL';

export interface SportsMatchCorrectionDialogData {
  mode: 'ACTION' | 'RESULT' | 'HISTORY';
  actionType: SportsMatchActionType;
  payloadJson: string;
  homeRegistrationId: string | null;
  awayRegistrationId: string | null;
  homeTeamName: string;
  awayTeamName: string;
}

export interface SportsMatchCorrectionDialogResult {
  payloadJson: string;
}

const EVENTUAL_CORRECTION_TYPES = new Set<SportsMatchActionType>([
  'SCORE_DELTA',
  'SCORE_CORRECTION',
  'FINALIZE',
  'FORFEIT',
  'OCCURRENCE',
  'CANCEL',
]);

export function supportsEventualActionCorrection(type: SportsMatchActionType): boolean {
  return EVENTUAL_CORRECTION_TYPES.has(type);
}

@Component({
  selector: 'app-sports-match-correction-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>
      {{
        data.mode === 'RESULT'
          ? 'Corrigir resultado consolidado'
          : data.mode === 'HISTORY'
            ? 'Corrigir ocorrência registrada'
            : 'Corrigir ação pendente'
      }}
    </h2>
    <mat-dialog-content>
      <p class="dialog-intro">
        {{
          data.mode === 'RESULT'
            ? 'A correção será registrada no histórico e recalculará classificação e chave quando necessário.'
            : data.mode === 'HISTORY'
              ? 'A ocorrência manterá sua identidade e a alteração ficará registrada na auditoria.'
              : 'A ação original continuará auditável; a versão corrigida será validada antes da aprovação.'
        }}
      </p>
      <form [formGroup]="form" class="correction-form">
        @switch (kind) {
          @case ('SCORE_DELTA') {
            <mat-form-field>
              <mat-label>Equipe</mat-label>
              <mat-select formControlName="side">
                <mat-option value="HOME">{{ data.homeTeamName }}</mat-option>
                <mat-option value="AWAY">{{ data.awayTeamName }}</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field>
              <mat-label>Ajuste</mat-label>
              <input matInput type="number" step="any" formControlName="amount" />
              <mat-hint>Use valor negativo para remover pontos.</mat-hint>
            </mat-form-field>
          }
          @case ('SCORE') {
            <ng-container [ngTemplateOutlet]="scoreFields" />
          }
          @case ('RESULT') {
            <ng-container [ngTemplateOutlet]="scoreFields" />
            <mat-checkbox formControlName="draw">Resultado empatado</mat-checkbox>
            @if (form.controls.draw.value) {
              <mat-checkbox formControlName="drawWillReschedule">O empate será remarcado</mat-checkbox>
            } @else {
              <fieldset>
                <legend>Equipe perdedora</legend>
                <mat-radio-group formControlName="loserRegistrationId">
                  <mat-radio-button [value]="data.homeRegistrationId">{{ data.homeTeamName }}</mat-radio-button>
                  <mat-radio-button [value]="data.awayRegistrationId">{{ data.awayTeamName }}</mat-radio-button>
                </mat-radio-group>
              </fieldset>
              @if (data.actionType !== 'FORFEIT') {
                <mat-form-field>
                  <mat-label>Motivo</mat-label>
                  <mat-select formControlName="lossReason">
                    <mat-option value="SCORE">Resultado no placar</mat-option>
                    <mat-option value="WALKOVER">W.O. (walkover)</mat-option>
                    <mat-option value="FORFEIT">Desistência</mat-option>
                    <mat-option value="DISQUALIFICATION">Desclassificação</mat-option>
                    <mat-option value="INJURY">Lesão</mat-option>
                    <mat-option value="NO_SHOW">Não comparecimento</mat-option>
                    <mat-option value="OTHER">Outro motivo</mat-option>
                  </mat-select>
                </mat-form-field>
              }
              <mat-form-field class="span-all">
                <mat-label>Detalhe opcional</mat-label>
                <textarea matInput rows="2" maxlength="1000" formControlName="lossReasonDetail"></textarea>
              </mat-form-field>
            }
          }
          @case ('OCCURRENCE') {
            <mat-form-field>
              <mat-label>Tipo</mat-label>
              <mat-select formControlName="occurrenceKind">
                <mat-option value="GENERAL">Anotação geral</mat-option>
                <mat-option value="SUBSTITUTION">Substituição</mat-option>
                <mat-option value="INJURY">Lesão ou atendimento</mat-option>
                <mat-option value="DISCIPLINE">Ocorrência disciplinar</mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field class="span-all">
              <mat-label>Descrição</mat-label>
              <textarea matInput rows="4" maxlength="1000" formControlName="occurrenceNote"></textarea>
            </mat-form-field>
          }
          @case ('CANCEL') {
            <mat-form-field class="span-all">
              <mat-label>Motivo do cancelamento</mat-label>
              <textarea matInput rows="3" maxlength="1000" formControlName="cancelReason"></textarea>
            </mat-form-field>
            <mat-checkbox formControlName="willReschedule">A partida será reagendada</mat-checkbox>
          }
        }
      </form>
      <ng-template #scoreFields>
        <div class="score-fields">
          <mat-form-field>
            <mat-label>{{ data.homeTeamName }}</mat-label>
            <input matInput type="number" min="0" step="any" formControlName="homeScore" />
          </mat-form-field>
          <mat-form-field>
            <mat-label>{{ data.awayTeamName }}</mat-label>
            <input matInput type="number" min="0" step="any" formControlName="awayScore" />
          </mat-form-field>
        </div>
      </ng-template>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="form.invalid" (click)="save()">
        {{
          data.mode === 'RESULT'
            ? 'Salvar resultado corrigido'
            : data.mode === 'HISTORY'
              ? 'Salvar correção'
              : 'Corrigir e aprovar'
        }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-intro {
      color: var(--mat-sys-on-surface-variant);
      margin-block: 0 1rem;
      max-width: 64ch;
    }
    .correction-form,
    .score-fields {
      display: grid;
      gap: 0.75rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .correction-form {
      min-width: min(34rem, 78vw);
    }
    .span-all,
    fieldset,
    mat-checkbox,
    .score-fields {
      grid-column: 1 / -1;
    }
    fieldset {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 10px;
      display: grid;
      gap: 0.5rem;
      margin: 0;
      padding: 0.75rem;
    }
    mat-radio-group {
      display: grid;
      gap: 0.5rem;
    }
    @media (max-width: 640px) {
      .correction-form,
      .score-fields {
        grid-template-columns: 1fr;
        min-width: 0;
      }
    }
  `,
})
export class SportsMatchCorrectionDialogComponent {
  readonly data = inject<SportsMatchCorrectionDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<SportsMatchCorrectionDialogComponent, SportsMatchCorrectionDialogResult>>(MatDialogRef);
  private readonly fb = inject(FormBuilder);
  private readonly payload = this.parsePayload(this.data.payloadJson);
  private readonly scoreboard = this.readRecord(this.payload['scoreboard']);
  readonly kind = this.correctionKind(this.data.actionType);

  readonly form = this.fb.nonNullable.group({
    side: [this.payload['side'] === 'AWAY' ? 'AWAY' : 'HOME', Validators.required],
    amount: [typeof this.payload['amount'] === 'number' ? this.payload['amount'] : 1, Validators.required],
    homeScore: [this.score(this.scoreboard['home']), [Validators.required, Validators.min(0)]],
    awayScore: [this.score(this.scoreboard['away']), [Validators.required, Validators.min(0)]],
    draw: [this.payload['draw'] === true],
    drawWillReschedule: [this.payload['drawWillReschedule'] === true],
    loserRegistrationId: [this.string(this.payload['loserRegistrationId'])],
    lossReason: [this.lossReason(this.payload['lossReason'], this.data.actionType)],
    lossReasonDetail: [this.string(this.payload['lossReasonDetail']), Validators.maxLength(1000)],
    occurrenceKind: [this.string(this.payload['kind']) || 'GENERAL', Validators.required],
    occurrenceNote: [this.string(this.payload['note']), Validators.maxLength(1000)],
    cancelReason: [this.string(this.payload['reason']), Validators.maxLength(1000)],
    willReschedule: [this.payload['willReschedule'] !== false],
  });

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    let corrected: Record<string, unknown>;
    if (this.kind === 'SCORE_DELTA') {
      if (!Number.isFinite(value.amount) || value.amount === 0) {
        this.form.controls.amount.setErrors({ nonZero: true });
        return;
      }
      corrected = { ...this.payload, side: value.side, amount: value.amount };
    } else if (this.kind === 'SCORE') {
      corrected = {
        ...this.payload,
        scoreboard: { ...this.scoreboard, home: value.homeScore, away: value.awayScore },
      };
    } else if (this.kind === 'RESULT') {
      if (!value.draw && !value.loserRegistrationId) {
        this.form.controls.loserRegistrationId.setErrors({ required: true });
        return;
      }
      const winnerRegistrationId =
        value.loserRegistrationId === this.data.homeRegistrationId
          ? this.data.awayRegistrationId
          : this.data.homeRegistrationId;
      corrected = {
        ...this.payload,
        draw: value.draw,
        drawWillReschedule: value.draw ? value.drawWillReschedule : undefined,
        winnerRegistrationId: value.draw ? undefined : winnerRegistrationId,
        loserRegistrationId: value.draw ? undefined : value.loserRegistrationId,
        lossReason: value.draw ? undefined : this.data.actionType === 'FORFEIT' ? 'FORFEIT' : value.lossReason,
        lossReasonDetail: value.draw ? undefined : value.lossReasonDetail || undefined,
        scoreboard: { ...this.scoreboard, home: value.homeScore, away: value.awayScore },
      };
    } else if (this.kind === 'OCCURRENCE') {
      corrected = { ...this.payload, kind: value.occurrenceKind, note: value.occurrenceNote.trim() };
    } else {
      corrected = {
        ...this.payload,
        reason: value.cancelReason.trim() || undefined,
        willReschedule: value.willReschedule,
      };
    }
    this.dialogRef.close({ payloadJson: JSON.stringify(corrected) });
  }

  private correctionKind(type: SportsMatchActionType): EventualCorrectionKind {
    if (type === 'SCORE_DELTA') {
      return 'SCORE_DELTA';
    }
    if (type === 'SCORE_CORRECTION') {
      return 'SCORE';
    }
    if (type === 'FINALIZE' || type === 'FORFEIT') {
      return 'RESULT';
    }
    if (type === 'OCCURRENCE') {
      return 'OCCURRENCE';
    }
    return 'CANCEL';
  }

  private parsePayload(payloadJson: string): Record<string, unknown> {
    try {
      return this.readRecord(JSON.parse(payloadJson));
    } catch {
      return {};
    }
  }

  private readRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }

  private score(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  }

  private string(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private lossReason(value: unknown, type: SportsMatchActionType): SportsLossReason {
    const reasons: SportsLossReason[] = [
      'SCORE',
      'WALKOVER',
      'FORFEIT',
      'DISQUALIFICATION',
      'INJURY',
      'NO_SHOW',
      'OTHER',
    ];
    return type === 'FORFEIT' ? 'FORFEIT' : reasons.find((reason) => reason === value) ?? 'SCORE';
  }
}
