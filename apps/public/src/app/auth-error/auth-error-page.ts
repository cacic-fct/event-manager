import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute } from '@angular/router';
import { AuthService, CacicLogoComponent } from '@cacic-fct/shared-angular';

export interface AuthErrorPageContent {
  title: string;
  description: string;
  actionLabel: string;
  returnTo: string;
  rawError: string;
}

const DEFAULT_AUTH_ERROR_CONTENT: AuthErrorPageContent = {
  title: 'O tempo de login expirou.',
  description: 'Entre novamente para continuar.',
  actionLabel: 'Entrar com o Google',
  returnTo: '/calendar',
  rawError: JSON.stringify(
    {
      message: 'Invalid authorization state.',
      error: 'Bad Request',
      statusCode: 400,
    },
    null,
    2,
  ),
};

@Component({
  selector: 'app-auth-error-page',
  imports: [
    CacicLogoComponent,
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './auth-error-page.html',
  styleUrl: './auth-error-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthErrorPage {
  readonly contentOverride = input<AuthErrorPageContent | null>(null);

  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly isDarkSignal = signal(false);
  private readonly routeContent = signal<AuthErrorPageContent>(DEFAULT_AUTH_ERROR_CONTENT);

  readonly content = computed(() => this.contentOverride() ?? this.routeContent());
  readonly logoFillColor = computed(() => (this.isDarkSignal() ? '#fff' : '#000'));

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.routeContent.set({
        title: this.readQueryValue(params.get('title'), DEFAULT_AUTH_ERROR_CONTENT.title),
        description: this.readQueryValue(params.get('description'), DEFAULT_AUTH_ERROR_CONTENT.description),
        actionLabel: this.readQueryValue(params.get('actionLabel'), DEFAULT_AUTH_ERROR_CONTENT.actionLabel),
        returnTo: this.readSafeReturnTo(params.get('returnTo')),
        rawError: this.readRawError(params.get('raw')),
      });
    });

    if (isPlatformBrowser(this.platformId) && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');

      this.isDarkSignal.set(media.matches);

      const listener = (event: MediaQueryListEvent) => {
        this.isDarkSignal.set(event.matches);
      };

      media.addEventListener('change', listener);

      this.destroyRef.onDestroy(() => {
        media.removeEventListener('change', listener);
      });
    }
  }

  retryLogin(): void {
    void this.auth.login({ returnTo: this.content().returnTo });
  }

  async copyRawError(): Promise<void> {
    if (!isPlatformBrowser(this.platformId) || !navigator.clipboard) {
      this.snackBar.open('Área de transferência indisponível.', 'OK', { duration: 3000 });
      return;
    }

    await navigator.clipboard.writeText(this.content().rawError);
    this.snackBar.open('Detalhes técnicos copiados.', 'OK', { duration: 3000 });
  }

  private readQueryValue(value: string | null, fallback: string): string {
    return value?.trim() || fallback;
  }

  private readSafeReturnTo(value: string | null): string {
    const returnTo = value?.trim();
    if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
      return DEFAULT_AUTH_ERROR_CONTENT.returnTo;
    }

    return returnTo;
  }

  private readRawError(value: string | null): string {
    const rawError = value?.trim();
    if (!rawError) {
      return DEFAULT_AUTH_ERROR_CONTENT.rawError;
    }

    try {
      return JSON.stringify(JSON.parse(rawError), null, 2);
    } catch {
      return rawError;
    }
  }
}
