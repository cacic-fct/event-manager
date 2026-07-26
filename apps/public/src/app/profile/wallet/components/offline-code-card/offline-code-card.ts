import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { OfflineTotpSeedRecord } from '@cacic-fct/offline-public-data-access';
import { TOTP_PERIOD_SECONDS, formatTotpCode, generateTotpCode } from '@cacic-fct/account-manager-m2m-contracts';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';

const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;

type OfflineCodeState =
  | { status: 'loading' }
  | { status: 'ready'; seed: OfflineTotpSeedRecord }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-wallet-offline-code-card',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @switch (state().status) {
      @case ('loading') {
        <div class="offline-card-loading" aria-label="Carregando código off-line">
          <mat-spinner diameter="32"></mat-spinner>
        </div>
      }
      @case ('ready') {
        <section class="offline-card-code" aria-live="polite">
          <strong>{{ displayCode() }}</strong>
          <mat-progress-spinner
            mode="determinate"
            [value]="progressValue()"
            diameter="38"
            aria-label="Tempo restante do código"></mat-progress-spinner>
        </section>
        <p>Use este código quando solicitado pela organização.</p>
        <button mat-stroked-button type="button" (click)="copyCode()" [disabled]="!code()">
          <mat-icon>content_copy</mat-icon>
          Copiar código
        </button>
      }
      @case ('error') {
        <section class="offline-card-error">
          <mat-icon>cloud_off</mat-icon>
          <p>{{ errorMessage() }}</p>
          <button mat-stroked-button type="button" (click)="loadSeed()">
            <mat-icon>refresh</mat-icon>
            Tentar novamente
          </button>
        </section>
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 1rem;
    }
    p {
      margin: 0;
      color: inherit;
      opacity: 0.82;
      line-height: 1.45;
    }
    .offline-card-loading,
    .offline-card-code,
    .offline-card-error {
      min-height: 5.5rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .offline-card-code {
      justify-content: space-between;
      gap: 1rem;
    }
    .offline-card-code strong {
      font-family: 'Source Code Pro Variable', 'Source Code Pro', monospace;
      font-size: clamp(1.9rem, 8vw, 2.6rem);
      line-height: 1;
      letter-spacing: 0;
    }
    .offline-card-error {
      display: grid;
      justify-items: start;
      gap: 0.75rem;
    }
    .offline-card-error mat-icon {
      color: var(--mat-sys-error);
    }
    button {
      justify-self: start;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletOfflineCodeCard {
  private readonly session = inject(TotpSeedSessionService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private codeRequest = 0;
  private animationFrame: number | null = null;

  readonly state = signal<OfflineCodeState>({ status: 'loading' });
  readonly code = signal('');
  readonly now = signal(Date.now());
  readonly readySeed = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.seed : null;
  });
  readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : '';
  });
  readonly displayCode = computed(() => (this.code() ? formatTotpCode(this.code()) : '--- ---'));
  readonly progressValue = computed(() => ((TOTP_PERIOD_MS - (this.now() % TOTP_PERIOD_MS)) / TOTP_PERIOD_MS) * 100);
  readonly periodBucket = computed(() => Math.floor(this.now() / TOTP_PERIOD_MS));

  constructor() {
    if (this.isBrowser) this.loadSeed();

    if (this.isBrowser) {
      const tick = () => {
        this.now.set(Date.now());
        this.animationFrame = window.requestAnimationFrame(tick);
      };
      this.animationFrame = window.requestAnimationFrame(tick);
      this.destroyRef.onDestroy(() => {
        if (this.animationFrame !== null) {
          window.cancelAnimationFrame(this.animationFrame);
        }
      });
    }

    effect(() => {
      const seed = this.readySeed();
      if (!seed) {
        this.code.set('');
        return;
      }
      void this.updateCode(seed.seed, this.periodBucket() * TOTP_PERIOD_MS);
    });
  }

  loadSeed(): void {
    if (!this.isBrowser) return;

    this.state.set({ status: 'loading' });
    this.session.getWalletSeed().then(
      (seed) => {
        this.state.set(
          seed
            ? { status: 'ready', seed }
            : {
                status: 'error',
                message:
                  'Abra esta tela com internet uma vez enquanto estiver logado para preparar o código neste dispositivo.',
              },
        );
      },
      () =>
        this.state.set({
          status: 'error',
          message: 'Não foi possível preparar o código agora. Verifique sua conexão e tente novamente.',
        }),
    );
  }

  copyCode(): void {
    const code = this.code();
    if (!code || !this.isBrowser) return;
    void this.copyToClipboard(code).then(
      () => this.snackBar.open('Código copiado', 'Fechar', { duration: 2500 }),
      () => this.snackBar.open('Não foi possível copiar o código', 'Fechar', { duration: 5000 }),
    );
  }

  private async updateCode(seed: string, timestamp: number): Promise<void> {
    const request = ++this.codeRequest;
    try {
      const code = await generateTotpCode({ seed, timestamp });
      if (request === this.codeRequest) this.code.set(code);
    } catch {
      if (request === this.codeRequest) this.code.set('');
    }
  }

  private async copyToClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const textarea = this.document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    this.document.body.append(textarea);
    textarea.select();
    try {
      if (!this.document.execCommand('copy')) throw new Error('Copy command failed.');
    } finally {
      textarea.remove();
    }
  }
}
