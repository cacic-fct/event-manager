import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  DEFAULT_SPORTS_OVERLAY_PERIOD_WORD,
  normalizeSportsOverlayPeriodWord,
  SPORTS_OVERLAY_PERIOD_WORDS,
  type SportsOverlayPeriodWord,
} from '@cacic-fct/shared-frontend-types';

type SportsOverlayTeam = 'both' | 'home' | 'away';

@Component({
  selector: 'lib-sports-match-overlay-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    ReactiveFormsModule,
  ],
  template: `
    <section class="overlay-builder" aria-labelledby="overlay-builder-title">
      <div>
        <h4 id="overlay-builder-title">Placar para transmissão</h4>
        <p>Abra o link em uma fonte de navegador do OBS. O placar acompanha a partida ao vivo.</p>
      </div>
      <form [formGroup]="overlayForm" class="overlay-builder-form">
        <mat-form-field subscriptSizing="dynamic"
          ><mat-label>Equipe exibida</mat-label
          ><mat-select formControlName="team"
            ><mat-option value="both">As duas equipes</mat-option
            ><mat-option value="home">{{ homeTeamName() }}</mat-option
            ><mat-option value="away">{{ awayTeamName() }}</mat-option></mat-select
          ></mat-form-field
        >
        <mat-form-field subscriptSizing="dynamic"
          ><mat-label>Palavra para rodada/turno</mat-label
          ><mat-select formControlName="periodWord">
            @for (periodWord of overlayPeriodWords; track periodWord) {
              <mat-option [value]="periodWord">{{ periodWord }}</mat-option>
            }</mat-select
          ><mat-hint>Escolha uma palavra permitida para o período</mat-hint></mat-form-field
        >
        <mat-slide-toggle formControlName="showTeamName">Exibir nome da equipe</mat-slide-toggle
        ><mat-slide-toggle formControlName="showTeamIcon">Exibir ícone da equipe</mat-slide-toggle
        ><mat-slide-toggle formControlName="showScore">Exibir placar</mat-slide-toggle
        ><mat-slide-toggle formControlName="showStopwatch">Exibir cronômetro</mat-slide-toggle
        ><mat-slide-toggle formControlName="showPeriod">Exibir rodada/turno</mat-slide-toggle
        ><mat-slide-toggle formControlName="showState">Exibir estado da partida</mat-slide-toggle>
      </form>
      <div class="overlay-url">
        <mat-form-field class="overlay-url-field" subscriptSizing="dynamic"
          ><mat-label>Link do overlay</mat-label
          ><input matInput [value]="overlayUrl()" readonly aria-describedby="overlay-url-help"
        /></mat-form-field>
        <div class="overlay-url-actions">
          <button mat-flat-button type="button" [disabled]="!overlayUrl()" (click)="copyOverlayUrl()">
            <mat-icon>content_copy</mat-icon>Copiar link</button
          ><a mat-stroked-button [href]="overlayUrl()" target="_blank" rel="noopener">Abrir teste</a>
        </div>
      </div>
      <p id="overlay-url-help" class="overlay-help">
        Para personalizar cores ou a fonte no OBS, use o campo de CSS personalizado da fonte de navegador. A fonte
        padrão é a Inter.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .overlay-builder {
      display: grid;
      gap: 1rem;
    }
    .overlay-builder h4,
    .overlay-builder p {
      margin: 0;
    }
    .overlay-builder h4 {
      margin-bottom: 0.25rem;
    }
    .overlay-builder-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: center;
      gap: 0.35rem 1rem;
    }
    .overlay-builder-form mat-form-field {
      min-width: 0;
    }
    .overlay-url {
      display: flex;
      align-items: start;
      gap: 0.75rem;
    }
    .overlay-url-field {
      flex: 1 1 auto;
      min-width: 0;
    }
    .overlay-url-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      padding-block-start: 0.25rem;
    }
    .overlay-help {
      font-size: 0.875rem;
    }
    .overlay-help code {
      padding: 0.1rem 0.3rem;
      border-radius: 4px;
      background: var(--mat-sys-surface-container);
      font-size: 0.9em;
    }
    @media (max-width: 700px) {
      .overlay-builder-form {
        grid-template-columns: 1fr;
      }
      .overlay-url {
        display: grid;
      }
      .overlay-url-actions {
        padding-block-start: 0;
      }
      .overlay-url-actions button,
      .overlay-url-actions a {
        flex: 1 1 auto;
      }
    }
  `,
})
export class SportsMatchOverlayBuilderComponent {
  readonly matchId = input.required<string>();
  readonly homeTeamName = input('Equipe da casa');
  readonly awayTeamName = input('Equipe visitante');
  readonly overlayPeriodWords = SPORTS_OVERLAY_PERIOD_WORDS;
  readonly overlayForm = new FormGroup({
    team: new FormControl<SportsOverlayTeam>('both', { nonNullable: true }),
    showTeamName: new FormControl(true, { nonNullable: true }),
    showTeamIcon: new FormControl(true, { nonNullable: true }),
    showScore: new FormControl(true, { nonNullable: true }),
    showStopwatch: new FormControl(true, { nonNullable: true }),
    showPeriod: new FormControl(true, { nonNullable: true }),
    showState: new FormControl(true, { nonNullable: true }),
    periodWord: new FormControl<SportsOverlayPeriodWord>(DEFAULT_SPORTS_OVERLAY_PERIOD_WORD, {
      nonNullable: true,
      validators: Validators.required,
    }),
  });
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly snackbar = inject(MatSnackBar);
  private readonly overlayFormRevision = signal(0);
  readonly overlayUrl = computed(() => {
    this.overlayFormRevision();
    const value = this.overlayForm.getRawValue();
    const query = new URLSearchParams({
      team: value.team,
      teamName: value.showTeamName ? '1' : '0',
      teamIcon: value.showTeamIcon ? '1' : '0',
      score: value.showScore ? '1' : '0',
      stopwatch: value.showStopwatch ? '1' : '0',
      period: value.showPeriod ? '1' : '0',
      state: value.showState ? '1' : '0',
      periodWord: normalizeSportsOverlayPeriodWord(value.periodWord),
    });
    const path = `/api/sports/public/matches/${encodeURIComponent(this.matchId())}/overlay?${query.toString()}`;
    if (!this.isBrowser) {
      return path;
    }
    try {
      return new URL(path, this.document.baseURI).toString();
    } catch {
      return new URL(path, window.location.origin).toString();
    }
  });
  constructor() {
    this.overlayForm.valueChanges.subscribe(() => this.overlayFormRevision.update((revision) => revision + 1));
  }
  async copyOverlayUrl(): Promise<void> {
    if (!this.isBrowser || !navigator.clipboard) {
      this.snackbar.open('Copie o link exibido manualmente para usar no OBS.', 'Fechar', { duration: 5000 });
      return;
    }
    try {
      await navigator.clipboard.writeText(this.overlayUrl());
      this.snackbar.open('Link do overlay copiado.', 'Fechar', { duration: 2500 });
    } catch {
      this.snackbar.open('Não foi possível copiar o link. Selecione-o e copie manualmente.', 'Fechar', {
        duration: 5000,
      });
    }
  }
}
