import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TwemojiComponent } from '@cacic-fct/shared-angular';

export interface SportsCloneTournamentDialogData {
  sourceMajorEventId: string;
  sourceName: string;
  destinations: readonly { id: string; name: string; emoji: string }[];
}

export interface SportsCloneTournamentDialogResult {
  destinationMajorEventId: string;
  parts: {
    categories: boolean;
    teams: boolean;
    registrations: boolean;
    venues: boolean;
    officials: boolean;
    rules: boolean;
  };
}

@Component({
  selector: 'app-sports-clone-tournament-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    TwemojiComponent,
  ],
  template: `
    <h2 mat-dialog-title>Duplicar torneio</h2>
    <div mat-dialog-content class="content">
      <p>
        Crie uma estrutura revisável em outro grande evento. Resultados ao vivo e histórico operacional
        nunca são copiados.
      </p>
      <section class="source">
        <mat-icon>emoji_events</mat-icon>
        <span><small>Origem</small><strong>{{ data.sourceName }}</strong></span>
      </section>
      <form [formGroup]="form">
        <mat-form-field>
          <mat-label>Grande evento de destino</mat-label>
          <mat-select formControlName="destinationMajorEventId">
            @for (destination of data.destinations; track destination.id) {
              <mat-option [value]="destination.id">
                <app-twemoji [emoji]="destination.emoji" /> {{ destination.name }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
        <fieldset>
          <legend>Partes reutilizáveis</legend>
          <mat-checkbox formControlName="categories">Modalidades e divisões</mat-checkbox>
          <mat-checkbox formControlName="teams">Equipes</mat-checkbox>
          <mat-checkbox formControlName="registrations">Inscrições aprovadas</mat-checkbox>
          <mat-checkbox formControlName="venues">Locais esportivos</mat-checkbox>
          <mat-checkbox formControlName="officials">Oficiais</mat-checkbox>
          <mat-checkbox formControlName="rules">Regras e presets</mat-checkbox>
        </fieldset>
        @if (form.controls.registrations.value && !form.controls.teams.value) {
          <p class="warning">Para copiar inscrições, copie também as equipes.</p>
        }
      </form>
    </div>
    <div mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancelar</button>
      <button mat-flat-button type="button" [disabled]="form.invalid" (click)="submit()">
        <mat-icon>content_copy</mat-icon>
        Duplicar
      </button>
    </div>
  `,
  styles: `
    .content,
    form,
    fieldset {
      display: grid;
      gap: 0.75rem;
    }
    .content {
      min-width: min(34rem, calc(100vw - 3rem));
    }
    .content > p {
      color: var(--mat-sys-on-surface-variant);
      margin-top: 0;
    }
    .source {
      align-items: center;
      background: var(--mat-sys-surface-container);
      border-radius: 12px;
      display: flex;
      gap: 0.75rem;
      padding: 0.75rem;
    }
    .source span {
      display: grid;
    }
    fieldset {
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 0;
      padding: 0.75rem;
    }
    legend {
      font-weight: 600;
      padding-inline: 0.35rem;
    }
    .warning {
      background: var(--mat-sys-error-container);
      border-radius: 10px;
      color: var(--mat-sys-on-error-container);
      margin: 0;
      padding: 0.65rem;
    }
    @media (max-width: 560px) {
      fieldset {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class SportsCloneTournamentDialogComponent {
  readonly data = inject<SportsCloneTournamentDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(
    MatDialogRef<SportsCloneTournamentDialogComponent, SportsCloneTournamentDialogResult>,
  );
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    destinationMajorEventId: ['', Validators.required],
    categories: [true],
    teams: [true],
    registrations: [true],
    venues: [true],
    officials: [true],
    rules: [true],
  });

  protected submit(): void {
    if (this.form.invalid) {
      return;
    }
    const raw = this.form.getRawValue();
    if (raw.registrations && !raw.teams) {
      this.form.controls.teams.setValue(true);
    }
    this.dialogRef.close({
      destinationMajorEventId: raw.destinationMajorEventId,
      parts: {
        categories: raw.categories,
        teams: raw.registrations ? true : raw.teams,
        registrations: raw.registrations,
        venues: raw.venues,
        officials: raw.officials,
        rules: raw.rules,
      },
    });
  }
}
