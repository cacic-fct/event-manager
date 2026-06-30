import { DOCUMENT, DatePipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import {
  CalendarFeedReenableChoice,
  CalendarFeedReenableDialogComponent,
} from '@cacic-fct/shared-angular/calendar-feed';
import { EventManagerKeycloakRole } from '@cacic-fct/shared-permissions';
import { Observable, catchError, combineLatest, finalize, firstValueFrom, map, of, startWith, switchMap } from 'rxjs';
import {
  AdminCalendarFeedSettingsApiService,
  CurrentUserAdminCalendarFeedSettings,
  SuperAdminCalendarFeedSettings,
} from '../../../graphql/admin-calendar-feed-settings-api.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog.component';
import { getErrorMessage } from '../../../shared/error-message';

type PersonalFeedState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'ready'; settings: CurrentUserAdminCalendarFeedSettings }
  | { status: 'error'; message: string };

type SuperAdminFeedState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'ready'; settings: SuperAdminCalendarFeedSettings }
  | { status: 'error'; message: string };

const NO_CURRENT_TARGETS_DISABLED_REASON = 'NO_CURRENT_ADMIN_TARGETS';
const STALE_ADMIN_ACCESS_DISABLED_REASON = 'STALE_ADMIN_ACCESS';

@Component({
  selector: 'app-workspace-preferences-tab',
  imports: [
    DatePipe,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './workspace-preferences-tab.component.html',
  styleUrl: '../workspace-tab.shared.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkspacePreferencesTabComponent {
  private readonly api = inject(AdminCalendarFeedSettingsApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly snackBar = inject(MatSnackBar);
  private readonly reloadCounter = signal(0);
  private readonly personalFeedSettingsOverride = signal<CurrentUserAdminCalendarFeedSettings | null>(null);
  private readonly superAdminFeedSettingsOverride = signal<SuperAdminCalendarFeedSettings | null>(null);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private readonly personalFeedStateSource = toSignal(this.createPersonalFeedState(), {
    initialValue: { status: 'loading' } satisfies PersonalFeedState,
  });
  private readonly superAdminFeedStateSource = toSignal(this.createSuperAdminFeedState(), {
    initialValue: { status: 'hidden' } satisfies SuperAdminFeedState,
  });

  protected readonly isSavingPersonal = signal(false);
  protected readonly isRotatingPersonal = signal(false);
  protected readonly isRotatingSuperAdmin = signal(false);
  protected readonly isSuperAdmin = computed(() => this.auth.roles().includes(EventManagerKeycloakRole.SuperAdmin));
  protected readonly personalFeedState = computed(() => {
    const state = this.personalFeedStateSource();
    const settings = this.personalFeedSettingsOverride();
    return state.status === 'ready' && settings ? ({ status: 'ready', settings } satisfies PersonalFeedState) : state;
  });
  protected readonly superAdminFeedState = computed(() => {
    const state = this.superAdminFeedStateSource();
    const settings = this.superAdminFeedSettingsOverride();
    return state.status === 'ready' && settings ? ({ status: 'ready', settings } satisfies SuperAdminFeedState) : state;
  });
  protected readonly personalFeedUrl = computed(() => {
    const state = this.personalFeedState();
    return state.status === 'ready' && state.settings.enabled ? this.absoluteFeedUrl(state.settings.feedPath) : null;
  });
  protected readonly superAdminFeedUrl = computed(() => {
    const state = this.superAdminFeedState();
    return state.status === 'ready' && state.settings.enabled ? this.absoluteFeedUrl(state.settings.feedPath) : null;
  });

  protected reload(): void {
    this.personalFeedSettingsOverride.set(null);
    this.superAdminFeedSettingsOverride.set(null);
    this.reloadCounter.update((value) => value + 1);
  }

  protected async setPersonalEnabled(change: MatSlideToggleChange): Promise<void> {
    if (this.isSavingPersonal()) {
      return;
    }

    const reenableChoice =
      change.checked && this.shouldConfirmPersonalReenable() ? await this.getPersonalReenableChoice() : 'keep';
    if (!reenableChoice) {
      change.source.checked = false;
      return;
    }

    this.isSavingPersonal.set(true);
    this.setPersonalEnabledRequest(change.checked, reenableChoice)
      .pipe(
        finalize(() => this.isSavingPersonal.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.personalFeedSettingsOverride.set(settings);
          this.snackBar.open(change.checked ? 'Feed administrativo ativado.' : 'Feed administrativo desativado.', 'OK', {
            duration: 3000,
          });
        },
        error: (error: unknown) => {
          change.source.checked = !change.checked;
          this.showError(error, 'Não foi possível alterar o feed administrativo.');
        },
      });
  }

  protected rotatePersonalKey(): void {
    if (this.isRotatingPersonal()) {
      return;
    }

    this.isRotatingPersonal.set(true);
    this.api
      .rotateCurrentUserAdminKey()
      .pipe(
        finalize(() => this.isRotatingPersonal.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.personalFeedSettingsOverride.set(settings);
          this.snackBar.open('Chave do feed administrativo rotacionada.', 'OK', { duration: 3000 });
        },
        error: (error: unknown) => this.showError(error, 'Não foi possível rotacionar a chave.'),
      });
  }

  protected async rotateSuperAdminKey(): Promise<void> {
    if (this.isRotatingSuperAdmin()) {
      return;
    }

    const confirmed = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          data: {
            title: 'Invalidar feed de todos os super-admins',
            message:
              'Esta ação troca a chave do feed compartilhado e invalida o calendário para todos os super-admins. Quem usa o link atual deixará de receber atualizações até cadastrar o novo link.',
            confirmLabel: 'Invalidar para todos',
          },
          width: '480px',
        })
        .afterClosed(),
    );
    if (confirmed !== true) {
      return;
    }

    this.isRotatingSuperAdmin.set(true);
    this.api
      .rotateSuperAdminKey()
      .pipe(
        finalize(() => this.isRotatingSuperAdmin.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (settings) => {
          this.superAdminFeedSettingsOverride.set(settings);
          this.snackBar.open('Chave compartilhada dos super-admins rotacionada.', 'OK', { duration: 3500 });
        },
        error: (error: unknown) => this.showError(error, 'Não foi possível rotacionar a chave compartilhada.'),
      });
  }

  protected async copyFeedUrl(url: string | null): Promise<void> {
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

  protected disabledReasonMessage(settings: CurrentUserAdminCalendarFeedSettings): string | null {
    if (settings.disabledReason === NO_CURRENT_TARGETS_DISABLED_REASON) {
      return 'O feed foi desativado automaticamente porque não havia eventos, grupos ou grandes eventos atuais sob sua responsabilidade.';
    }

    if (settings.disabledReason === STALE_ADMIN_ACCESS_DISABLED_REASON) {
      return 'O feed foi desativado automaticamente porque seu acesso administrativo não foi confirmado recentemente.';
    }

    return null;
  }

  private createPersonalFeedState(): Observable<PersonalFeedState> {
    return combineLatest([toObservable(this.reloadCounter), toObservable(this.auth.roles)]).pipe(
      switchMap(([, roles]) => {
        if (roles.includes(EventManagerKeycloakRole.SuperAdmin)) {
          return of({ status: 'hidden' } satisfies PersonalFeedState);
        }

        return this.api.getCurrentUserAdminSettings().pipe(
          map(
            (settings): PersonalFeedState => ({
              status: 'ready',
              settings,
            }),
          ),
          startWith({ status: 'loading' } satisfies PersonalFeedState),
          catchError((error: unknown) =>
            of({
              status: 'error',
              message: getErrorMessage(error, 'Não foi possível carregar o feed administrativo.'),
            } satisfies PersonalFeedState),
          ),
        );
      }),
    );
  }

  private getPersonalReenableChoice(): Promise<CalendarFeedReenableChoice | null> {
    return firstValueFrom(
      this.dialog
        .open(CalendarFeedReenableDialogComponent, {
          data: {
            feedName: 'o feed administrativo',
          },
          width: '520px',
        })
        .afterClosed(),
    ).then((choice: unknown) =>
      choice === 'rotate' || choice === 'keep' ? choice : null,
    );
  }

  private setPersonalEnabledRequest(
    enabled: boolean,
    reenableChoice: CalendarFeedReenableChoice,
  ): Observable<CurrentUserAdminCalendarFeedSettings> {
    if (!enabled) {
      return this.api.setCurrentUserAdminEnabled(false);
    }

    if (reenableChoice === 'rotate') {
      return this.api.rotateCurrentUserAdminKey().pipe(switchMap(() => this.api.setCurrentUserAdminEnabled(true)));
    }

    return this.api.setCurrentUserAdminEnabled(true);
  }

  private shouldConfirmPersonalReenable(): boolean {
    const state = this.personalFeedState();
    return state.status === 'ready' && !state.settings.enabled && Boolean(state.settings.disabledAt);
  }

  private createSuperAdminFeedState(): Observable<SuperAdminFeedState> {
    return combineLatest([toObservable(this.reloadCounter), toObservable(this.auth.roles)]).pipe(
      switchMap(([, roles]) => {
        if (!roles.includes(EventManagerKeycloakRole.SuperAdmin)) {
          return of({ status: 'hidden' } satisfies SuperAdminFeedState);
        }

        return this.api.getSuperAdminSettings().pipe(
          map(
            (settings): SuperAdminFeedState => ({
              status: 'ready',
              settings,
            }),
          ),
          startWith({ status: 'loading' } satisfies SuperAdminFeedState),
          catchError((error: unknown) =>
            of({
              status: 'error',
              message: getErrorMessage(error, 'Não foi possível carregar o feed compartilhado.'),
            } satisfies SuperAdminFeedState),
          ),
        );
      }),
    );
  }

  private absoluteFeedUrl(feedPath?: string | null): string | null {
    if (!feedPath) {
      return null;
    }

    return new URL(feedPath, this.baseOrigin()).toString();
  }

  private baseOrigin(): string {
    if (this.isBrowser) {
      return window.location.origin;
    }

    return this.document.baseURI || 'https://eventos.cacic.dev.br';
  }

  private showError(error: unknown, fallback: string): void {
    this.snackBar.open(getErrorMessage(error, fallback), 'OK', { duration: 5000 });
  }
}
