import { DOCUMENT, DatePipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Observable, catchError, finalize, map, of, startWith, switchMap } from 'rxjs';
import {
  CalendarFeedSettingsApiService,
  CurrentUserCalendarFeedSettings,
} from './calendar-feed-settings-api.service';

type CalendarFeedSettingsState =
  | { status: 'loading' }
  | { status: 'ready'; settings: CurrentUserCalendarFeedSettings }
  | { status: 'error'; message: string };

const STALE_LOGIN_DISABLED_REASON = 'STALE_LOGIN';

@Component({
  selector: 'app-calendar-feed-preferences',
  imports: [
    DatePipe,
    RouterLink,
    MatButtonModule,
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
  templateUrl: './calendar-feed-preferences.html',
  styleUrl: './calendar-feed-preferences.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarFeedPreferences {
  private readonly api = inject(CalendarFeedSettingsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly snackBar = inject(MatSnackBar);
  private readonly reloadCounter = signal(0);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly isSaving = signal(false);
  readonly isRotating = signal(false);
  readonly settingsState = toSignal(this.createSettingsState(), {
    initialValue: { status: 'loading' } satisfies CalendarFeedSettingsState,
  });
  readonly feedUrl = computed(() => {
    const state = this.settingsState();
    if (state.status !== 'ready' || !state.settings.feedPath) {
      return null;
    }

    return new URL(state.settings.feedPath, this.baseOrigin()).toString();
  });

  reload(): void {
    this.reloadCounter.update((value) => value + 1);
  }

  setEnabled(change: MatSlideToggleChange): void {
    if (this.isSaving()) {
      return;
    }

    this.isSaving.set(true);
    this.api
      .setEnabled(change.checked)
      .pipe(
        finalize(() => this.isSaving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.snackBar.open(change.checked ? 'Feed do calendário ativado.' : 'Feed do calendário desativado.', 'OK', {
            duration: 3000,
          });
          this.reload();
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
        next: () => {
          this.snackBar.open('Chave do calendário rotacionada.', 'OK', { duration: 3000 });
          this.reload();
        },
        error: (error: unknown) => this.showError(error),
      });
  }

  copyFeedUrl(): void {
    const url = this.feedUrl();
    if (!url || !this.isBrowser || !navigator.clipboard) {
      return;
    }

    void navigator.clipboard.writeText(url);
    this.snackBar.open('Link do calendário copiado.', 'OK', { duration: 3000 });
  }

  disabledReasonMessage(settings: CurrentUserCalendarFeedSettings): string | null {
    if (settings.disabledReason === STALE_LOGIN_DISABLED_REASON) {
      return 'O feed foi desativado automaticamente porque sua última entrada excedia dois anos.';
    }

    return null;
  }

  private createSettingsState(): Observable<CalendarFeedSettingsState> {
    return toObservable(this.reloadCounter).pipe(
      switchMap(() =>
        this.api.getSettings().pipe(
          map(
            (settings): CalendarFeedSettingsState => ({
              status: 'ready',
              settings,
            }),
          ),
          startWith({ status: 'loading' } satisfies CalendarFeedSettingsState),
          catchError((error: unknown) =>
            of({
              status: 'error',
              message: error instanceof Error ? error.message : 'Não foi possível carregar as preferências.',
            } satisfies CalendarFeedSettingsState),
          ),
        ),
      ),
    );
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
