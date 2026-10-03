import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthService, ServiceWorkerService } from '@cacic-fct/shared-angular';
import { OfflineUserSnapshot } from '@cacic-fct/public-indexed-db';
import type { TicketRealtimeInvalidation, WalletTicket } from '@cacic-fct/shared-ticketing';

import { WalletPrintStyles } from '../../components/wallet-print-styles';
import { WalletCard } from '../../components/card/wallet-card';
import { WalletCardKind, WalletCardSelection, WalletCardUser } from '../../components/card/wallet-card.types';
import { OfflineCodeStateService } from '../../components/offline-code-card/offline-code-state.service';
import { PrintDialog } from '../../dialogs/print/print-dialog';
import { NetworkStatusService } from '../../../../shared/network-status.service';
import { OfflineUserDataService } from '../../../../shared/offline-user-data.service';
import { TicketingApiService } from '../../../ticketing/ticketing-api.service';
import { nextDeadlineDelay, ticketExpirationReason, ticketStatusAt } from '../../../ticketing/ticket-expiration';

interface WalletCardEntry {
  selectionId: WalletCardSelection;
  kind: WalletCardKind;
  ticket?: WalletTicket;
  ticketStatus?: WalletTicket['status'];
}

@Component({
  selector: 'app-wallet',
  imports: [
    WalletCard,
    WalletPrintStyles,
    MatToolbarModule,
    MatIconModule,
    RouterLink,
    MatButtonModule,
    MatDialogModule,
    MatTooltipModule,
    MatListModule,
    MatProgressBarModule,
  ],
  providers: [OfflineCodeStateService],
  templateUrl: './wallet.html',
  styleUrl: './wallet.css',
})
export class Wallet {
  private static readonly CARD_SELECTION_DURATION_MS = 420;

  public readonly authService = inject(AuthService);
  public readonly serviceWorkerService = inject(ServiceWorkerService);

  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineUserData = inject(OfflineUserDataService);
  private readonly ticketApi = inject(TicketingApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly offlineSnapshot = signal<OfflineUserSnapshot | null>(null);
  private offlineSnapshotRequest = 0;
  private selectionTimeout: number | null = null;
  private selectionAnimation: Animation | null = null;
  private listScrollPosition = 0;
  private ticketRequestId = 0;
  private ticketUserId: string | undefined;
  private ticketExpiryTimer: number | null = null;
  private lastExpiredTicketRefreshSignature = '';

  private readonly topCardSlot = viewChild<ElementRef<HTMLElement>>('topCardSlot');
  private readonly walletCardList = viewChild<ElementRef<HTMLElement>>('walletCardList');
  private readonly detailCardSlot = viewChild<ElementRef<HTMLElement>>('detailCardSlot');
  public readonly selectedCard = signal<WalletCardSelection | null>(null);
  public readonly walletView = signal<'list' | 'selecting' | 'detail' | 'closing'>('list');
  public readonly tickets = signal<WalletTicket[]>([]);
  public readonly ticketExpiryNow = signal(Date.now());
  public readonly ticketsLoading = signal(false);
  public readonly showExpiredTickets = signal(false);

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

  public readonly activeTickets = computed(() =>
    this.tickets().filter((ticket) => ticketStatusAt(ticket, this.ticketExpiryNow()) === 'ACTIVE'),
  );
  public readonly expiredTickets = computed(() =>
    this.tickets().filter((ticket) => ticketStatusAt(ticket, this.ticketExpiryNow()) !== 'ACTIVE'),
  );

  public readonly stackedCards = computed<readonly WalletCardEntry[]>(() => {
    const cards: WalletCardEntry[] = [{ selectionId: 'offline-code', kind: 'offline-code' }];
    if (this.hasAcademicRecord()) cards.push({ selectionId: 'academic-record', kind: 'academic-record' });
    for (const ticket of this.activeTickets()) {
      cards.push({
        selectionId: `ticket:${ticket.id}`,
        kind: 'eventos',
        ticket,
        ticketStatus: ticketStatusAt(ticket, this.ticketExpiryNow()),
      });
    }
    return cards;
  });

  public readonly selectedCardEntry = computed<WalletCardEntry | null>(() => {
    const selection = this.selectedCard();
    if (!selection) return null;

    const stackEntry = this.stackedCards().find((entry) => entry.selectionId === selection);
    if (stackEntry) return stackEntry;

    const ticketId = selection.startsWith('ticket:') ? selection.slice('ticket:'.length) : null;
    const ticket = ticketId ? this.tickets().find((item) => item.id === ticketId) : null;
    return ticket
      ? { selectionId: selection, kind: 'eventos', ticket, ticketStatus: ticketStatusAt(ticket, this.ticketExpiryNow()) }
      : null;
  });

  public readonly selectedTicket = computed(() => this.selectedCardEntry()?.ticket ?? null);

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

    effect((onCleanup) => {
      const userId = this.authService.user()?.sub;
      if (userId !== this.ticketUserId) {
        this.ticketUserId = userId;
        this.ticketRequestId++;
        this.tickets.set([]);
        this.ticketsLoading.set(false);
        this.clearTicketExpiryTimer();
        this.lastExpiredTicketRefreshSignature = '';
        this.showExpiredTickets.set(false);
        this.selectedCard.set(null);
        this.walletView.set('list');
        if (this.selectionTimeout !== null && this.isBrowser) window.clearTimeout(this.selectionTimeout);
        this.selectionTimeout = null;
        this.selectionAnimation?.cancel();
      }
      if (!userId) return;

      untracked(() => this.loadTickets());
      const stream = this.ticketApi
        .watchCurrentUser()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (invalidation) => this.refreshForTicketChange(invalidation),
          error: () => this.snackBar.open('Não foi possível acompanhar seus bilhetes em tempo real.', 'Fechar', { duration: 3500 }),
        });
      onCleanup(() => {
        stream.unsubscribe();
        this.ticketRequestId++;
      });
    });

    this.destroyRef.onDestroy(() => {
      if (this.selectionTimeout !== null) window.clearTimeout(this.selectionTimeout);
      this.selectionAnimation?.cancel();
      this.clearTicketExpiryTimer();
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

  public selectCard(card: WalletCardSelection): void {
    if (this.walletView() === 'detail') {
      this.returnToCardList();
      return;
    }

    if (card === 'eventos' || this.walletView() !== 'list') return;

    const cardIndex = this.stackedCards().findIndex((entry) => entry.selectionId === card);
    if (cardIndex < 0) return;
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

  public cardMotionClass(card: WalletCardSelection): string {
    const selectedCard = this.selectedCard();
    const view = this.walletView();
    if ((view !== 'selecting' && view !== 'closing') || !selectedCard) return '';

    const selectedIndex = this.stackedCards().findIndex((entry) => entry.selectionId === selectedCard);
    const index = this.stackedCards().findIndex((entry) => entry.selectionId === card);

    if (index === selectedIndex) return 'wallet-card-selected';
    if (view === 'closing') return 'wallet-card-returning';
    return index > selectedIndex ? 'wallet-card-after-selected' : 'wallet-card-before-selected';
  }

  public toggleExpiredTickets(): void {
    this.showExpiredTickets.update((visible) => !visible);
  }

  public ticketArchiveReason(ticket: WalletTicket): string {
    return ticketExpirationReason(ticketStatusAt(ticket, this.ticketExpiryNow()));
  }

  public openArchivedTicket(ticketId: string): void {
    if (this.walletView() !== 'list' || !this.expiredTickets().some((ticket) => ticket.id === ticketId)) return;
    if (this.isBrowser) this.listScrollPosition = window.scrollY;
    this.selectedCard.set(`ticket:${ticketId}`);
    this.walletView.set('detail');
    if (this.isBrowser) window.scrollTo(window.scrollX, 0);
  }

  private loadTickets(): void {
    const requestId = ++this.ticketRequestId;
    this.ticketsLoading.set(true);
    this.ticketApi
      .myWalletTickets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (tickets) => {
          if (requestId !== this.ticketRequestId) return;
          this.tickets.set(tickets);
          const selection = this.selectedCard();
          if (selection?.startsWith('ticket:') && !tickets.some((ticket) => `ticket:${ticket.id}` === selection)) {
            this.finishCardListTransition();
          }
          this.ticketExpiryNow.set(Date.now());
          this.ticketsLoading.set(false);
          this.scheduleTicketExpiryRefresh();
        },
        error: () => {
          if (requestId !== this.ticketRequestId) return;
          this.ticketsLoading.set(false);
          this.snackBar.open('Não foi possível carregar seus bilhetes.', 'Fechar', { duration: 3500 });
        },
      });
  }

  private refreshForTicketChange(invalidation: TicketRealtimeInvalidation): void {
    if (
      invalidation.type === 'TICKETS_CHANGED' ||
      invalidation.type === 'TRANSFERS_CHANGED' ||
      invalidation.type === 'PURCHASES_CHANGED'
    ) {
      this.loadTickets();
    }
  }

  private scheduleTicketExpiryRefresh(): void {
    this.clearTicketExpiryTimer();
    if (!this.isBrowser) return;

    const now = Date.now();
    this.ticketExpiryNow.set(now);
    const dueTickets = this.tickets().filter(
      (ticket) => ticket.status === 'ACTIVE' && ticketStatusAt(ticket, now) === 'EXPIRED',
    );
    const dueSignature = dueTickets.map((ticket) => `${ticket.id}:${ticket.effectiveExpiresAt}`).sort().join('|');
    if (dueSignature && dueSignature !== this.lastExpiredTicketRefreshSignature) {
      this.lastExpiredTicketRefreshSignature = dueSignature;
      this.loadTickets();
    } else if (!dueSignature) {
      this.lastExpiredTicketRefreshSignature = '';
    }

    const delay = nextDeadlineDelay(
      this.tickets().filter((ticket) => ticket.status === 'ACTIVE').map((ticket) => ticket.effectiveExpiresAt),
      now,
    );
    if (delay === null) return;

    this.ticketExpiryTimer = window.setTimeout(() => {
      this.ticketExpiryTimer = null;
      const currentNow = Date.now();
      this.ticketExpiryNow.set(currentNow);
      const newlyDue = this.tickets().filter(
        (ticket) => ticket.status === 'ACTIVE' && ticketStatusAt(ticket, currentNow) === 'EXPIRED',
      );
      const signature = newlyDue.map((ticket) => `${ticket.id}:${ticket.effectiveExpiresAt}`).sort().join('|');
      if (signature && signature !== this.lastExpiredTicketRefreshSignature) {
        this.lastExpiredTicketRefreshSignature = signature;
        this.loadTickets();
      }
      this.scheduleTicketExpiryRefresh();
    }, delay);
  }

  private clearTicketExpiryTimer(): void {
    if (this.ticketExpiryTimer !== null && this.isBrowser) window.clearTimeout(this.ticketExpiryTimer);
    this.ticketExpiryTimer = null;
  }

  private animateCardToList(): boolean {
    const selectedCard = this.selectedCard();
    const cardIndex = this.stackedCards().findIndex((entry) => entry.selectionId === selectedCard);
    const detailCardTop = this.detailCardSlot()?.nativeElement.getBoundingClientRect().top;
    if (!this.isBrowser || this.prefersReducedMotion || !selectedCard || cardIndex < 0 || detailCardTop === undefined) {
      if (this.isBrowser) window.scrollTo(window.scrollX, this.listScrollPosition);
      return false;
    }

    this.cancelCardTransition();
    this.walletView.set('closing');
    this.changeDetectorRef.detectChanges();
    window.scrollTo(window.scrollX, this.listScrollPosition);

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
    return (
      this.isBrowser &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
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
