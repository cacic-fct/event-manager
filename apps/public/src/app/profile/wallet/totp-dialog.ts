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
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { OfflineTotpSeedRecord } from '@cacic-fct/offline-public-data-access';
import { TOTP_PERIOD_SECONDS, formatTotpCode, generateTotpCode } from '@cacic-fct/account-manager-m2m-contracts';
import { TotpSeedSessionService } from '../../shared/totp/totp-seed-session.service';

const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;

type TotpDialogState =
  | { status: 'loading' }
  | { status: 'ready'; seed: OfflineTotpSeedRecord }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-wallet-totp-dialog',
  imports: [MatButtonModule, MatDialogModule, MatDividerModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="dialog-header">
      <h2 mat-dialog-title>Código off-line</h2>
    </div>

    <mat-dialog-content>
      @switch (state().status) {
        @case ('loading') {
          <section class="loading-panel">
            <mat-spinner diameter="36"></mat-spinner>
          </section>
        }

        @case ('ready') {
          @let seed = readySeed();
          @if (seed) {
            <section class="code-panel" aria-live="polite">
              <div class="code-copy">
                <span class="label">Código atual</span>
                <strong class="code">{{ displayCode() }}</strong>
              </div>
              <mat-progress-spinner
                mode="determinate"
                [value]="progressValue()"
                diameter="44"
                aria-label="Tempo restante do código"></mat-progress-spinner>
            </section>

            <dl class="details">
              <div>
                <dt>E-mail principal</dt>
                <dd>{{ seed.primaryEmail }}</dd>
              </div>
            </dl>
          }
        }

        @case ('error') {
          <section class="empty-panel">
            <mat-icon>cloud_off</mat-icon>
            <h3>Código indisponível</h3>
            <p>{{ errorMessage() }}</p>
            <button mat-stroked-button type="button" (click)="loadSeed()">
              <mat-icon>refresh</mat-icon>
              Tentar novamente
            </button>
          </section>
        }
      }
    </mat-dialog-content>

    <mat-divider></mat-divider>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Fechar</button>
      @if (readySeed()) {
        <button mat-flat-button color="primary" type="button" (click)="copyCode()" [disabled]="!code()">
          <mat-icon>content_copy</mat-icon>
          Copiar
        </button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host {
        display: block;
        width: min(100vw - 32px, 480px);
      }

      h2 {
        margin: 0;
        font-size: 1.25rem;
        line-height: 1.25;
        text-wrap: balance;
      }

      .dialog-header {
        padding: 1.25rem 1.25rem 0;
      }

      .dialog-header p,
      .label,
      dt {
        color: var(--mat-sys-on-surface-variant);
      }

      .dialog-header p {
        max-width: 44ch;
        margin: 0.35rem 0 0;
        line-height: 1.45;
      }

      mat-dialog-content {
        padding-top: 1rem;
      }

      .loading-panel,
      .code-panel,
      .empty-panel {
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        background: var(--mat-sys-surface-container-low);
      }

      .loading-panel,
      .code-panel {
        padding: 1rem;
      }

      .loading-panel {
        min-height: 156px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .code-panel {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }

      .code-copy {
        min-width: 0;
        display: grid;
        gap: 0.55rem;
      }

      .code {
        font-family: 'Source Code Pro Variable', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 2.6rem;
        line-height: 1;
        letter-spacing: 0;
        color: var(--mat-sys-on-surface);
      }

      .details {
        display: grid;
        gap: 0.75rem;
        margin: 1rem 0 0;
      }

      .details div {
        display: grid;
        gap: 0.2rem;
      }

      dt,
      dd {
        margin: 0;
      }

      dd {
        overflow-wrap: anywhere;
        font-weight: 600;
      }

      .empty-panel {
        min-height: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.85rem;
        padding: 1.25rem;
        text-align: center;
      }

      .empty-panel mat-icon {
        width: 44px;
        height: 44px;
        font-size: 44px;
        color: var(--mat-sys-primary);
      }

      .empty-panel h3 {
        margin: 0;
        font-size: 1.1rem;
      }

      .empty-panel p {
        max-width: 42ch;
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
        line-height: 1.45;
      }

      button mat-icon {
        margin-right: 0.4rem;
      }

      @media (max-width: 420px) {
        .code {
          font-size: 2.1rem;
        }

        .code-panel {
          align-items: flex-start;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletTotpDialog {
  private readonly session = inject(TotpSeedSessionService);
  private readonly dialogRef = inject(MatDialogRef<WalletTotpDialog>);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private codeRequest = 0;
  private animationFrame: number | null = null;

  readonly state = signal<TotpDialogState>({ status: 'loading' });
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
  readonly currentStep = computed(() => Math.floor(this.now() / TOTP_PERIOD_MS));
  readonly progressValue = computed(() => {
    const elapsed = this.now() % TOTP_PERIOD_MS;
    return ((TOTP_PERIOD_MS - elapsed) / TOTP_PERIOD_MS) * 100;
  });

  constructor() {
    this.loadSeed();

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
      const step = this.currentStep();

      if (!seed) {
        this.code.set('');
        return;
      }

      void this.updateCode(seed.seed, step * TOTP_PERIOD_MS);
    });
  }

  loadSeed(): void {
    this.state.set({ status: 'loading' });
    this.session
      .getWalletSeed()
      .then((seed) => {
        if (!seed) {
          this.state.set({
            status: 'error',
            message:
              'Abra esta tela com internet uma vez enquanto estiver logado para preparar o código neste dispositivo.',
          });
          return;
        }

        this.state.set({ status: 'ready', seed });
      })
      .catch(() => {
        this.state.set({
          status: 'error',
          message: 'Não foi possível preparar o código agora. Verifique sua conexão e tente novamente.',
        });
      });
  }

  close(): void {
    this.dialogRef.close();
  }

  copyCode(): void {
    const code = this.code();
    if (!code || !this.isBrowser) {
      return;
    }

    void this.copyToClipboard(code).then(
      () => {
        this.snackBar.open('Código copiado', 'Fechar', { duration: 2500 });
      },
      () => {
        this.snackBar.open('Não foi possível copiar o código', 'Fechar', { duration: 5000 });
      },
    );
  }

  private async updateCode(seed: string, timestamp: number): Promise<void> {
    const request = ++this.codeRequest;

    try {
      const code = await generateTotpCode({ seed, timestamp });
      if (request === this.codeRequest) {
        this.code.set(code);
      }
    } catch {
      if (request === this.codeRequest) {
        this.code.set('');
      }
    }
  }

  private async copyToClipboard(value: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = this.document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    this.document.body.append(textarea);
    textarea.select();

    try {
      if (!this.document.execCommand('copy')) {
        throw new Error('Copy command failed.');
      }
    } finally {
      textarea.remove();
    }
  }
}
