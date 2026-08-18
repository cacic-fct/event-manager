import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import type {
  SportsApplication,
  SportsCategorySummary,
  SportsTeamSummary,
  SportsTournamentRead,
} from './sports.models';

export interface SportsApplicationEditDialogData {
  application: SportsApplication;
  teams: SportsTeamSummary[];
  categories: SportsCategorySummary[];
  teamSummaries: SportsTournamentRead['teamSummaries'];
  paymentTiers: { name: string; value: number }[];
  allowNoTeam: boolean;
  allowNoCategory: boolean;
  paymentRequired: boolean;
}

export interface SportsApplicationEditDialogResult {
  requestedTeamId: string | null;
  categoryIds: string[];
  paymentTier: string | null;
}

const ELIGIBLE_REGISTRATION_STATUSES = new Set(['APPROVED', 'WAITING_PAYMENT', 'ACTIVE']);
const AVAILABLE_CATEGORY_STATUSES = new Set(['REGISTRATION_OPEN', 'ACTIVE']);

@Component({
  selector: 'app-sports-application-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CurrencyPipe, MatButtonModule, MatDialogModule, MatFormFieldModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>Corrigir dados da inscrição</h2>
    <mat-dialog-content>
      <p class="dialog-intro">
        Ajuste apenas os dados operacionais. Aceites legais permanecem vinculados à ação da própria pessoa.
      </p>
      <form [formGroup]="form" class="application-edit-form">
        <mat-form-field>
          <mat-label>Equipe atribuída</mat-label>
          <mat-select formControlName="requestedTeamId" (selectionChange)="teamChanged($event.value)">
            @if (data.allowNoTeam) {
              <mat-option value="">Sem equipe específica</mat-option>
            }
            @for (team of data.teams; track team.id) {
              <mat-option [value]="team.id">
                {{ team.name }}{{ team.institution ? ' · ' + team.institution : '' }}
              </mat-option>
            }
          </mat-select>
          @if (form.controls.requestedTeamId.hasError('required')) {
            <mat-error>Selecione uma equipe.</mat-error>
          }
        </mat-form-field>

        <mat-form-field>
          <mat-label>Modalidades</mat-label>
          <mat-select formControlName="categoryIds" multiple>
            @for (category of availableCategories(); track category.id) {
              <mat-option [value]="category.id">
                {{ category.name }}{{ category.division ? ' · ' + category.division : '' }}
              </mat-option>
            }
          </mat-select>
          @if (form.controls.categoryIds.hasError('required')) {
            <mat-error>Selecione pelo menos uma modalidade.</mat-error>
          }
          @if (availableCategories().length === 0) {
            <mat-hint>Nenhuma modalidade elegível para a equipe escolhida.</mat-hint>
          }
        </mat-form-field>

        @if (data.paymentRequired && paymentTiers().length) {
          <mat-form-field>
            <mat-label>Faixa de pagamento</mat-label>
            <mat-select formControlName="paymentTier">
              @for (tier of paymentTiers(); track tier.name) {
                <mat-option [value]="tier.name">
                  {{ tier.name }}{{ tier.value >= 0 ? ' · ' : '' }}
                  @if (tier.value >= 0) {
                    {{ tier.value / 100 | currency: 'BRL' }}
                  }
                </mat-option>
              }
            </mat-select>
            @if (form.controls.paymentTier.hasError('required')) {
              <mat-error>Selecione a faixa de pagamento.</mat-error>
            }
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [disabled]="form.invalid" (click)="save()">Salvar correção</button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-intro {
      color: var(--mat-sys-on-surface-variant);
      margin-block: 0 1rem;
      max-width: 62ch;
    }
    .application-edit-form {
      display: grid;
      gap: 0.75rem;
      min-width: min(32rem, 75vw);
    }
    @media (max-width: 640px) {
      .application-edit-form {
        min-width: 0;
      }
    }
  `,
})
export class SportsApplicationEditDialogComponent {
  readonly data = inject<SportsApplicationEditDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<SportsApplicationEditDialogComponent, SportsApplicationEditDialogResult>>(MatDialogRef);
  private readonly fb = inject(FormBuilder);
  private readonly selectedTeamId = signal(this.data.application.requestedTeam?.id ?? '');

  readonly form = this.fb.nonNullable.group({
    requestedTeamId: [
      this.data.application.requestedTeam?.id ?? '',
      this.data.allowNoTeam ? [] : [Validators.required],
    ],
    categoryIds: [
      this.data.application.categories.map((category) => category.id),
      this.data.allowNoCategory ? [] : [Validators.required],
    ],
    paymentTier: [
      this.data.application.paymentTier ?? '',
      this.data.paymentRequired && this.data.paymentTiers.length ? [Validators.required] : [],
    ],
  });

  readonly availableCategories = computed(() => {
    const selectedTeamId = this.selectedTeamId();
    const eligibleIds = selectedTeamId
      ? new Set(
          this.data.teamSummaries
            .find((summary) => summary.team.id === selectedTeamId)
            ?.registrations.filter((registration) => ELIGIBLE_REGISTRATION_STATUSES.has(registration.status))
            .map((registration) => registration.categoryId) ?? [],
        )
      : null;
    return this.data.categories.filter(
      (category) => AVAILABLE_CATEGORY_STATUSES.has(category.status) && (!eligibleIds || eligibleIds.has(category.id)),
    );
  });

  readonly paymentTiers = computed(() => {
    const current = this.data.application.paymentTier;
    if (!current || this.data.paymentTiers.some((tier) => tier.name === current)) {
      return this.data.paymentTiers;
    }
    return [...this.data.paymentTiers, { name: current, value: -1 }];
  });

  teamChanged(teamId: string): void {
    this.selectedTeamId.set(teamId);
    const availableIds = new Set(this.availableCategories().map((category) => category.id));
    this.form.controls.categoryIds.setValue(
      this.form.controls.categoryIds.value.filter((categoryId) => availableIds.has(categoryId)),
    );
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({
      requestedTeamId: value.requestedTeamId || null,
      categoryIds: value.categoryIds,
      paymentTier: value.paymentTier || null,
    });
  }
}
