import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { formatTotpCode } from '@cacic-fct/account-manager-m2m-contracts';
import { OfflineCodeStateService } from './offline-code-state.service';

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
        <section class="offline-card-email">
          <span>E-mail principal</span>
          <strong>{{ primaryEmail() }}</strong>
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
    .offline-card-email {
      display: grid;
      gap: 0.25rem;
    }
    .offline-card-email span {
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.3;
      opacity: 0.82;
    }
    .offline-card-email strong {
      overflow-wrap: anywhere;
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.4;
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
  private readonly offlineCodeState = inject(OfflineCodeStateService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly state = this.offlineCodeState.state;
  readonly code = this.offlineCodeState.code;
  readonly progressValue = this.offlineCodeState.progressValue;
  readonly errorMessage = computed(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : '';
  });
  readonly primaryEmail = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.seed.primaryEmail : '';
  });
  readonly displayCode = computed(() => (this.code() ? formatTotpCode(this.code()) : '--- ---'));

  constructor() {
    this.offlineCodeState.initialize();
  }

  loadSeed(): void {
    this.offlineCodeState.reload();
  }

  copyCode(): void {
    const code = this.code();
    if (!code || !this.isBrowser) return;
    void this.copyToClipboard(code).then(
      () => this.snackBar.open('Código copiado', 'Fechar', { duration: 2500 }),
      () => this.snackBar.open('Não foi possível copiar o código', 'Fechar', { duration: 5000 }),
    );
  }

  private async copyToClipboard(value: string): Promise<void> {
    const clipboard = navigator.clipboard;
    if (clipboard?.writeText) {
      try {
        await clipboard.writeText(value);
        return;
      } catch {
        // Fall back to the legacy copy mechanism when the Clipboard API rejects the write.
      }
    }
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
