import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CalendarFeedReenableChoice, CalendarFeedReenableDialogComponent } from '@cacic-fct/shared-angular';
import { Observable, catchError, finalize, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import {
  CalendarPreferencesApiService,
  CurrentUserCalendarFeedSettings,
} from './calendar-preferences-api.service';

type CalendarPreferencesState =
  | { status: 'loading' }
  | { status: 'ready'; settings: CurrentUserCalendarFeedSettings }
  | { status: 'error'; message: string };

const STALE_LOGIN_DISABLED_REASON = 'STALE_LOGIN';

@Component({
  selector: 'app-calendar-preferences',
  imports: [
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatToolbarModule,
    MatTooltipModule,
  ],
  templateUrl: './calendar-preferences.html',
  styleUrl: './calendar-preferences.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarPreferences {
  private readonly api = inject(CalendarPreferencesApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly snackBar = inject(MatSnackBar);
  private readonly reloadCounter = signal(0);
  private readonly settingsOverride = signal<CurrentUserCalendarFeedSettings | null>(null);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly loadedSettingsState = toSignal(this.createSettingsState(), {
    initialValue: { status: 'loading' } satisfies CalendarPreferencesState,
  });

  readonly isSaving = signal(false);
  readonly isRotating = signal(false);
  readonly settingsState = computed(() => {
    const state = this.loadedSettingsState();
    const settings = this.settingsOverride();
    return state.status === 'ready' && settings ? ({ status: 'ready', settings } satisfies CalendarPreferencesState) : state;
  });
  readonly feedUrl = computed(() => {
    const state = this.settingsState();
    if (state.status !== 'ready' || !state.settings.enabled || !state.settings.feedPath) {
      return null;
    }

    return new URL(state.settings.feedPath, this.baseOrigin()).toString();
  });

  reload(): void {
    this.settingsOverride.set(null);
    this.reloadCounter.update((value) => value + 1);
  }

  async setEnabled(change: MatSlideToggleChange): Promise<void> {
    if (this.isSaving()) {
      return;
    }

    const reenableChoice = change.checked && this.shouldConfirmReenable() ? await this.getReenableChoice() : 'keep';
    if (!reenableChoice) {
      change.source.checked = false;
      return;
    }

    this.isSaving.set(true);
    this.setEnabledRequest(change.checked, reenableChoice)
      .pipe(
        finalize(() => this.isSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.settingsOverride.set(settings);
          this.snackBar.open(change.checked ? 'Feed do calendário ativado.' : 'Feed do calendário desativado.', 'OK', {
            duration: 3000,
          });
        },
        error: (error: unknown) => {
          change.source.checked = !change.checked;
          this.showError(error);
        },
      });
  }

  rotateKey(): void {
    if (this.isRotating()) {
      return;
    }

    this.isRotating.set(true);
    this.api
      .rotateKey()
      .pipe(
        finalize(() => this.isRotating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.settingsOverride.set(settings);
          this.snackBar.open('Chave do calendário rotacionada.', 'OK', { duration: 3000 });
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  async copyFeedUrl(): Promise<void> {
    const url = this.feedUrl();
    if (!url || !this.isBrowser || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      this.snackBar.open('Link do calendário copiado.', 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open('Não foi possível copiar o link do calendário.', 'OK', { duration: 5000 });
    }
  }

  disabledReasonMessage(settings: CurrentUserCalendarFeedSettings): string | null {
    if (settings.disabledReason === STALE_LOGIN_DISABLED_REASON) {
      return 'O feed foi desativado automaticamente porque sua última entrada excedia dois anos.';
    }

    return null;
  }

  private createSettingsState(): Observable<CalendarPreferencesState> {
    return toObservable(this.reloadCounter).pipe(
      switchMap(() =>
        this.api.getSettings().pipe(
          map(
            (settings): CalendarPreferencesState => ({
              status: 'ready',
              settings,
            }),
          ),
          startWith({ status: 'loading' } satisfies CalendarPreferencesState),
          catchError((error: unknown) =>
            of({
              status: 'error',
              message: error instanceof Error ? error.message : 'Não foi possível carregar as preferências.',
            } satisfies CalendarPreferencesState),
          ),
        ),
      ),
    );
  }

  private getReenableChoice(): Promise<CalendarFeedReenableChoice | null> {
    return firstValueFrom(
      this.dialog
        .open(CalendarFeedReenableDialogComponent, {
          data: {
            feedName: 'o feed do calendário',
          },
          width: '520px',
        })
        .afterClosed(),
    ).then((choice: unknown) =>
      choice === 'rotate' || choice === 'keep' ? choice : null,
    );
  }

  private setEnabledRequest(enabled: boolean, reenableChoice: CalendarFeedReenableChoice): Observable<CurrentUserCalendarFeedSettings> {
    if (!enabled) {
      return this.api.setEnabled(false);
    }

    if (reenableChoice === 'rotate') {
      return this.api.rotateKey().pipe(switchMap(() => this.api.setEnabled(true)));
    }

    return this.api.setEnabled(true);
  }

  private shouldConfirmReenable(): boolean {
    const state = this.settingsState();
    return state.status === 'ready' && !state.settings.enabled && Boolean(state.settings.disabledAt);
  }

  private baseOrigin(): string {
    if (this.isBrowser) {
      return window.location.origin;
    }

    return this.document.baseURI || 'https://eventos.cacic.dev.br';
  }

  private showError(error: unknown): void {
    this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível concluir.', 'OK', {
      duration: 5000,
    });
  }
}
