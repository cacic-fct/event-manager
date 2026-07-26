import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthService, ServiceWorkerService } from '@cacic-fct/shared-angular';
import { OfflineUserSnapshot } from '@cacic-fct/offline-public-data-access';

import { WalletPrintStyles } from '../../components/wallet-print-styles';
import { WalletCard } from '../../components/card/wallet-card';
import { WalletCardKind, WalletCardUser } from '../../components/card/wallet-card.types';
import { PrintDialog } from '../../dialogs/print/print-dialog';
import { RestaurantCardService } from '../../services/restaurant-card.service';
import { NetworkStatusService } from '../../../../shared/network-status.service';
import { OfflineUserDataService } from '../../../../shared/offline-user-data.service';

@Component({
  selector: 'app-wallet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WalletCard,
    WalletPrintStyles,
    MatToolbarModule,
    MatIconModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './wallet.html',
  styleUrl: './wallet.css',
})
export class Wallet {
  private static readonly CARD_SELECTION_DURATION_MS = 420;

  public readonly authService = inject(AuthService);
  public readonly serviceWorkerService = inject(ServiceWorkerService);

  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineUserData = inject(OfflineUserDataService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly restaurantCard = inject(RestaurantCardService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly offlineSnapshot = signal<OfflineUserSnapshot | null>(null);
  private offlineSnapshotRequest = 0;
  private selectionTimeout: number | null = null;
  private selectionAnimation: Animation | null = null;
  private listScrollPosition = 0;

  private readonly topCardSlot = viewChild<ElementRef<HTMLElement>>('topCardSlot');
  private readonly walletCardList = viewChild<ElementRef<HTMLElement>>('walletCardList');
  private readonly detailCardSlot = viewChild<ElementRef<HTMLElement>>('detailCardSlot');
  public readonly selectedCard = signal<WalletCardKind | null>(null);
  public readonly walletView = signal<'list' | 'selecting' | 'detail' | 'closing'>('list');

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  public readonly cardUser = computed<WalletCardUser | null>(() => {
    const user = this.authService.user();
    if (user?.sub) {
      return {
        userId: user.sub,
        name: typeof user.claims?.name === 'string' ? user.claims.name : null,
        picture: typeof user.claims?.['picture'] === 'string' ? user.claims['picture'] : null,
        unespRole: this.roleClaim(user.claims?.['unesp_role']),
        identityDocument: typeof user.claims?.identity_document === 'string' ? user.claims.identity_document : null,
        enrollmentNumber: this.enrollmentNumberClaim(user.claims?.enrollment_number),
      };
    }

    const snapshot = this.offlineSnapshot();

    return snapshot
      ? {
          userId: snapshot.userId,
          name: snapshot.name,
          picture: snapshot.picture,
          unespRole: snapshot.unespRole,
          identityDocument: snapshot.identityDocument,
          enrollmentNumber: snapshot.enrollmentNumber,
        }
      : null;
  });

  public readonly hasAcademicRecord = computed(() => {
    const user = this.cardUser();
    const roles = user?.unespRole;
    const isUndergraduate = roles === 'aluno-graduacao' || (Array.isArray(roles) && roles.includes('aluno-graduacao'));
    return isUndergraduate && Boolean(user?.enrollmentNumber);
  });

  public readonly restaurantNumber = computed(() => {
    const userId = this.cardUser()?.userId;
    return userId ? this.restaurantCard.get(userId) : null;
  });

  public readonly stackedCards = computed<readonly WalletCardKind[]>(() => {
    const cards: WalletCardKind[] = ['offline-code'];
    if (this.hasAcademicRecord()) cards.push('academic-record');
    if (this.restaurantNumber()) cards.push('restaurant');
    return cards;
  });

  constructor() {
    effect(() => {
      const request = ++this.offlineSnapshotRequest;
      if (this.authService.isAuthenticated() || this.networkStatus.isOnline()) {
        this.offlineSnapshot.set(null);
        return;
      }

      void this.offlineUserData.getOfflineSnapshot().then((snapshot) => {
        if (request === this.offlineSnapshotRequest) this.offlineSnapshot.set(snapshot);
      });
    });

    effect(() => {
      const userId = this.cardUser()?.userId;
      if (userId) void this.restaurantCard.load(userId);
    });

    this.destroyRef.onDestroy(() => {
      if (this.selectionTimeout !== null) window.clearTimeout(this.selectionTimeout);
      this.selectionAnimation?.cancel();
    });
  }

  public print(): void {
    if (!this.isBrowser) {
      return;
    }

    if (this.serviceWorkerService.hasServiceWorker()) {
      this.dialog
        .open<PrintDialog, void, boolean>(PrintDialog, {
          disableClose: true,
          autoFocus: false,
        })
        .afterClosed()
        .subscribe((confirmed) => {
          if (confirmed && isPlatformBrowser(this.platformId)) {
            window.print();
          }
        });

      return;
    }

    window.print();
  }

  public selectCard(card: WalletCardKind): void {
    if (this.walletView() === 'detail') {
      this.returnToCardList();
      return;
    }

    if (card === 'eventos' || this.walletView() !== 'list') return;

    const cardIndex = this.stackedCards().indexOf(card);
    const cardElement = this.walletCardList()?.nativeElement.children.item(cardIndex);
    const topCardSlot = this.topCardSlot()?.nativeElement;
    const startingCardTop = cardElement?.getBoundingClientRect().top;

    if (this.isBrowser) this.listScrollPosition = window.scrollY;
    this.selectedCard.set(card);
    this.walletView.set('selecting');

    if (!this.isBrowser || this.prefersReducedMotion) {
      if (this.isBrowser) window.scrollTo(window.scrollX, 0);
      this.walletView.set('detail');
      return;
    }

    window.scrollTo(window.scrollX, 0);

    if (cardElement?.animate && topCardSlot && startingCardTop !== undefined) {
      const cardTopAfterScroll = cardElement.getBoundingClientRect().top;
      const topSlotPosition = topCardSlot.getBoundingClientRect().top;
      const startOffset = startingCardTop - cardTopAfterScroll;
      const endOffset = topSlotPosition - cardTopAfterScroll;

      this.selectionAnimation = cardElement.animate(
        [{ transform: `translateY(${startOffset}px)` }, { transform: `translateY(${endOffset}px)` }],
        {
          duration: Wallet.CARD_SELECTION_DURATION_MS,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'forwards',
        },
      );
    }

    this.selectionTimeout = window.setTimeout(() => {
      this.walletView.set('detail');
      this.selectionTimeout = null;
      this.selectionAnimation = null;
    }, Wallet.CARD_SELECTION_DURATION_MS);
  }

  public returnToCardList(): void {
    if (this.walletView() === 'detail' && this.animateCardToList()) return;

    this.finishCardListTransition();
  }

  public cardMotionClass(card: WalletCardKind): string {
    const selectedCard = this.selectedCard();
    const view = this.walletView();
    if ((view !== 'selecting' && view !== 'closing') || !selectedCard) return '';

    const selectedIndex = this.stackedCards().indexOf(selectedCard);
    const index = this.stackedCards().indexOf(card);

    if (index === selectedIndex) return 'wallet-card-selected';
    if (view === 'closing') return 'wallet-card-returning';
    return index > selectedIndex ? 'wallet-card-after-selected' : 'wallet-card-before-selected';
  }

  private animateCardToList(): boolean {
    const selectedCard = this.selectedCard();
    const detailCardTop = this.detailCardSlot()?.nativeElement.getBoundingClientRect().top;
    if (!this.isBrowser || this.prefersReducedMotion || !selectedCard || detailCardTop === undefined) {
      if (this.isBrowser) window.scrollTo(window.scrollX, this.listScrollPosition);
      return false;
    }

    this.cancelCardTransition();
    this.walletView.set('closing');
    this.changeDetectorRef.detectChanges();
    window.scrollTo(window.scrollX, this.listScrollPosition);

    const cardIndex = this.stackedCards().indexOf(selectedCard);
    const cardElement = this.walletCardList()?.nativeElement.children.item(cardIndex);
    if (!cardElement?.animate) return false;

    const stackCardTop = cardElement.getBoundingClientRect().top;
    this.selectionAnimation = cardElement.animate(
      [{ transform: `translateY(${detailCardTop - stackCardTop}px)` }, { transform: 'translateY(0)' }],
      {
        duration: Wallet.CARD_SELECTION_DURATION_MS,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'forwards',
      },
    );
    this.selectionTimeout = window.setTimeout(() => this.finishCardListTransition(), Wallet.CARD_SELECTION_DURATION_MS);
    return true;
  }

  private finishCardListTransition(): void {
    this.cancelCardTransition();
    if (this.isBrowser) window.scrollTo(window.scrollX, this.listScrollPosition);
    this.selectedCard.set(null);
    this.walletView.set('list');
  }

  private cancelCardTransition(): void {
    if (this.selectionTimeout !== null) {
      window.clearTimeout(this.selectionTimeout);
      this.selectionTimeout = null;
    }
    this.selectionAnimation?.cancel();
    this.selectionAnimation = null;
  }

  private get prefersReducedMotion(): boolean {
    return this.isBrowser && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  public availableOffline(): void {
    if (!this.isBrowser) {
      return;
    }

    if (this.serviceWorkerService.hasServiceWorker()) {
      this.snackBar.open('Está página está disponível off-line.', 'Fechar', {
        duration: 3000,
      });

      return;
    }

    this.snackBar.open(
      'Você precisará de uma conexão com a internet para acessar esta página. O Service Worker não está disponível.',
      'Fechar',
      {
        duration: 5000,
      },
    );
  }

  private roleClaim(value: unknown): string | string[] | null {
    if (typeof value === 'string') {
      return value;
    }

    return Array.isArray(value) && value.every((role): role is string => typeof role === 'string') ? value : null;
  }

  private enrollmentNumberClaim(value: unknown): string | number | null {
    return typeof value === 'string' || typeof value === 'number' ? value : null;
  }
}
