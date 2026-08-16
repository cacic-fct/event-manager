import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, Injectable, PLATFORM_ID, computed, effect, inject, signal } from '@angular/core';
import { OfflineTotpSeedRecord } from '@cacic-fct/public-indexed-db';
import { TOTP_PERIOD_SECONDS, generateTotpCode } from '@cacic-fct/account-manager-m2m-contracts';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';

const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;

type OfflineCodeState =
  | { status: 'loading' }
  | { status: 'ready'; seed: OfflineTotpSeedRecord }
  | { status: 'error'; message: string };

@Injectable({ providedIn: 'root' })
export class OfflineCodeStateService {
  private readonly session = inject(TotpSeedSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private codeRequest = 0;
  private seedRequest = 0;
  private animationFrame: number | null = null;
  private initialized = false;

  readonly state = signal<OfflineCodeState>({ status: 'loading' });
  readonly code = signal('');
  readonly now = signal(Date.now());
  readonly readySeed = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.seed : null;
  });
  readonly progressValue = computed(() => ((TOTP_PERIOD_MS - (this.now() % TOTP_PERIOD_MS)) / TOTP_PERIOD_MS) * 100);
  readonly periodBucket = computed(() => Math.floor(this.now() / TOTP_PERIOD_MS));

  constructor() {
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

  initialize(): void {
    if (this.initialized || !this.isBrowser) return;

    this.initialized = true;
    this.loadSeed();
  }

  reload(): void {
    if (!this.isBrowser) return;

    this.initialized = true;
    this.loadSeed();
  }

  private loadSeed(): void {
    const request = ++this.seedRequest;
    this.state.set({ status: 'loading' });
    this.session.getWalletSeed().then(
      (seed) => {
        if (request !== this.seedRequest) return;
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
      () => {
        if (request !== this.seedRequest) return;
        this.state.set({
          status: 'error',
          message: 'Não foi possível preparar o código agora. Verifique sua conexão e tente novamente.',
        });
      },
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
}
