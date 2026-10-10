import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TOTP_PERIOD_SECONDS } from '@cacic-fct/account-manager-m2m-contracts';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { TicketPersonSummaryComponent } from '../../profile/ticketing/ticket-person-summary.component';
import { WalletBarcodeComponent } from '../../profile/wallet/components/barcode/barcode';
import { playShowcaseSequence } from './showcase-animation';
import { TicketTransferDemoComponent } from './ticket-transfer-demo';

type WalletCardId = 'credential' | 'ticket' | 'offline';
type WalletView = 'cards' | 'transfer' | 'incoming';

interface WalletCardDefinition {
  id: WalletCardId;
  brand: string;
}

export interface WalletCodePreview {
  displayCode: string;
  secondsRemaining: number;
  progressValue: number;
}

const CARD_ORDER: readonly WalletCardId[] = ['offline', 'ticket', 'credential'];
const CARD_BASE_OFFSETS: Readonly<Record<WalletCardId, number>> = {
  offline: 0,
  ticket: 56,
  credential: 112,
};
const CARD_HEADER_OFFSET = 56;
const FOCUS_EXIT_OFFSET = 600;
const CARD_STAGE_HEIGHT = 416;
const TOTP_PERIOD_MS = TOTP_PERIOD_SECONDS * 1000;
const OFFLINE_PREVIEW_CODES = ['836429', '271804', '590163'] as const;

const WALLET_CARDS: readonly WalletCardDefinition[] = [
  { id: 'offline', brand: 'Código off-line' },
  { id: 'ticket', brand: 'Kit de boas-vindas' },
  { id: 'credential', brand: 'CACiC Eventos' },
];

export function walletCodePreviewAt(elapsedMs: number): WalletCodePreview {
  const elapsed = Math.max(0, elapsedMs);
  const periodElapsed = elapsed % TOTP_PERIOD_MS;
  const periodIndex = Math.floor(elapsed / TOTP_PERIOD_MS) % OFFLINE_PREVIEW_CODES.length;
  const remainingMs = TOTP_PERIOD_MS - periodElapsed;
  const code = OFFLINE_PREVIEW_CODES[periodIndex];

  return {
    displayCode: `${code.slice(0, 3)} ${code.slice(3)}`,
    secondsRemaining: Math.ceil(remainingMs / 1000),
    progressValue: (remainingMs / TOTP_PERIOD_MS) * 100,
  };
}

@Component({
  selector: 'app-landing-wallet-demo',
  imports: [
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    WalletBarcodeComponent,
    TicketPersonSummaryComponent,
    TwemojiComponent,
    TicketTransferDemoComponent,
  ],
  templateUrl: './wallet-demo.html',
  styleUrl: './wallet-demo.scss',
})
export class WalletDemoComponent {
  readonly selectedCard = model<WalletCardId | null>(null);
  readonly initialView = input<WalletView>('cards');
  readonly view = signal<WalletView>('cards');
  readonly ticketTransferCompleted = signal(false);
  readonly cards = WALLET_CARDS;
  readonly offlineCodePreview = signal(walletCodePreviewAt(0));
  readonly stageHeight = CARD_STAGE_HEIGHT;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private clockStartedAt = 0;
  private clockInterval: number | null = null;
  private walletVisible = false;
  private documentVisible = true;
  private intersectionObserver: IntersectionObserver | null = null;
  private readonly manualInteraction = signal(false);
  private readonly onVisibilityChange = () => {
    this.documentVisible = this.document.visibilityState !== 'hidden';
    this.syncOfflineClock();
  };

  constructor() {
    playShowcaseSequence(
      (schedule) => {
        schedule(() => this.selectFromShowcase('ticket'), 700);
        schedule(() => this.selectFromShowcase(null), 1900);
      },
      () => !this.manualInteraction() && this.view() === 'cards',
    );

    effect(() => this.view.set(this.initialView()));
    effect(() => {
      this.view();
      this.syncOfflineClock();
    });

    afterNextRender(() => this.startOfflineClock());
    this.destroyRef.onDestroy(() => {
      this.stopOfflineClock();
      this.intersectionObserver?.disconnect();
      this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    });
  }

  isSelectedCard(cardId: WalletCardId): boolean {
    return this.selectedCard() === cardId;
  }

  isAwayCard(cardId: WalletCardId): boolean {
    const selectedCard = this.selectedCard();
    return selectedCard !== null && selectedCard !== cardId;
  }

  toggleCard(cardId: WalletCardId): void {
    this.manualInteraction.set(true);
    this.selectCard(this.selectedCard() === cardId ? null : cardId);
  }

  openTransfer(): void {
    this.manualInteraction.set(true);
    this.view.set('transfer');
  }

  returnToWallet(): void {
    this.view.set('cards');
    this.selectedCard.set('ticket');
  }

  completeTransfer(): void {
    this.ticketTransferCompleted.set(true);
  }

  cardLabel(cardId: WalletCardId): string {
    switch (cardId) {
      case 'credential':
        return 'Credencial do CACiC Eventos';
      case 'ticket':
        return 'Bilhete para Kit de boas-vindas';
      case 'offline':
        return 'Código off-line';
    }
  }

  cardTranslateY(cardId: WalletCardId): number {
    const selectedCard = this.selectedCard();
    if (selectedCard === null) {
      return CARD_BASE_OFFSETS[cardId];
    }
    if (selectedCard === cardId) {
      return 0;
    }

    const cardsBelow = CARD_ORDER.filter((id) => id !== selectedCard);
    return FOCUS_EXIT_OFFSET + cardsBelow.indexOf(cardId) * CARD_HEADER_OFFSET;
  }

  cardZIndex(cardId: WalletCardId): number {
    if (this.selectedCard() === cardId) {
      return CARD_ORDER.length + 1;
    }
    return CARD_ORDER.indexOf(cardId) + 1;
  }

  private selectFromShowcase(cardId: WalletCardId | null): void {
    if (this.manualInteraction()) {
      return;
    }
    this.selectCard(cardId);
  }

  private selectCard(cardId: WalletCardId | null): void {
    this.selectedCard.set(cardId);
  }

  private startOfflineClock(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const viewport = this.host.nativeElement;

    this.clockStartedAt = performance.now();
    this.documentVisible = this.document.visibilityState !== 'hidden';
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);

    if (typeof IntersectionObserver === 'function') {
      this.intersectionObserver = new IntersectionObserver(
        (entries) => {
          this.walletVisible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.15);
          this.syncOfflineClock();
        },
        { threshold: 0.15 },
      );
      this.intersectionObserver.observe(viewport);
    } else {
      this.walletVisible = true;
    }

    this.syncOfflineClock();
  }

  private syncOfflineClock(): void {
    if (this.view() !== 'cards' || !this.walletVisible || !this.documentVisible) {
      this.stopOfflineClock();
      return;
    }

    if (this.clockInterval !== null) {
      return;
    }

    this.updateOfflineClock();
    this.clockInterval = window.setInterval(() => this.updateOfflineClock(), 250);
  }

  private updateOfflineClock(): void {
    const elapsedMs = Math.max(0, performance.now() - this.clockStartedAt);
    this.offlineCodePreview.set(walletCodePreviewAt(elapsedMs));
  }

  private stopOfflineClock(): void {
    if (this.clockInterval === null) {
      return;
    }

    window.clearInterval(this.clockInterval);
    this.clockInterval = null;
  }
}
