import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { TicketRealtimeInvalidation, TicketTransfer } from '@cacic-fct/shared-ticketing';
import { TicketTransferActionDialog } from './ticket-transfer-action-dialog';
import type { TicketTransferActionDialogData } from './ticket-transfer-action-dialog';
import { CalendarListItem, CalendarListItemData } from '../../calendar/event-list/calendar-list-item';
import { TicketingApiService } from './ticketing-api.service';
import { TicketPersonSummaryComponent } from './ticket-person-summary.component';
import { redactIdentityDocument } from './ticket-document';
import { nextDeadlineDelay, ticketStatusAt } from './ticket-expiration';

type TicketTransferDetailsState =
  | { status: 'loading' }
  | { status: 'ready'; transfer: TicketTransfer }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-ticket-transfer-details-page',
  imports: [
    CalendarListItem,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatToolbarModule,
    RouterLink,
    TicketPersonSummaryComponent,
  ],
  templateUrl: './ticket-transfer-details-page.html',
  styleUrl: './ticket-transfer-details-page.css',
})
export class TicketTransferDetailsPage {
  private readonly api = inject(TicketingApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  private requestId = 0;
  private transferId = '';
  private expiryTimer: number | null = null;
  private lastExpiryRefreshKey = '';

  readonly state = signal<TicketTransferDetailsState>({ status: 'loading' });
  readonly isAccepting = signal(false);
  readonly isIgnoring = signal(false);
  readonly isCanceling = signal(false);
  readonly now = signal(Date.now());
  readonly canCancel = computed(() => {
    const current = this.state();
    if (
      current.status !== 'ready' ||
      current.transfer.senderStatus !== 'PENDING' ||
      ticketStatusAt(current.transfer.ticket, this.now()) !== 'ACTIVE'
    ) return false;
    return current.transfer.canCancel;
  });
  readonly canAccept = computed(() => {
    const current = this.state();
    return current.status === 'ready' &&
      current.transfer.canAccept &&
      current.transfer.senderStatus === 'PENDING' &&
      current.transfer.recipientStatus === 'PENDING' &&
      ticketStatusAt(current.transfer.ticket, this.now()) === 'ACTIVE';
  });
  readonly recipientIdentity = computed(() => {
    const recipient = this.readyTransfer()?.recipient;
    const claims = this.auth.user()?.claims;
    const fullName = typeof claims?.['name'] === 'string' ? claims['name'] : recipient?.fullName;
    const avatarUrl = typeof claims?.['picture'] === 'string' ? claims['picture'] : recipient?.avatarUrl ?? null;
    const identityDocument = typeof claims?.['identity_document'] === 'string'
      ? redactIdentityDocument(claims['identity_document'])
      : recipient?.redactedIdentityDocument;
    return {
      fullName: fullName ?? 'Destinatário do bilhete',
      avatarUrl,
      identityDocument: identityDocument ?? null,
    };
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.transferId = params.get('transferId') ?? '';
      this.clearExpiryTimer();
      if (!this.transferId) {
        this.state.set({ status: 'empty', message: 'Este pedido de transferência não está disponível.' });
        return;
      }
      this.load();
    });

    this.api
      .watchCurrentUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (invalidation) => this.refreshForChange(invalidation) });

    this.destroyRef.onDestroy(() => this.clearExpiryTimer());
  }

  eventItem(transfer: TicketTransfer): CalendarListItemData {
    return {
      id: transfer.event.id,
      name: transfer.event.name,
      emoji: transfer.event.emoji,
      startDate: transfer.event.startsAt,
      endDate: transfer.event.endsAt,
      contextLine: transfer.ticket.name,
      eventType: transfer.event.type,
      locationDescription: transfer.event.locationDescription,
      expiresAt: transfer.ticket.effectiveExpiresAt,
      route: transfer.event.publicUrl,
      returnUrl: `/profile/wallet/ticket-transfers/${transfer.id}`,
      ariaLabel: `Abrir evento ${transfer.event.name}`,
    };
  }

  openAcceptConfirmation(transfer: TicketTransfer): void {
    this.confirm('accept', transfer);
  }

  openIgnoreConfirmation(transfer: TicketTransfer): void {
    this.confirm('ignore', transfer);
  }

  cancelTransfer(): void {
    const transfer = this.readyTransfer();
    if (!transfer || !this.canCancel() || this.isCanceling()) return;

    this.isCanceling.set(true);
    this.api
      .cancelTicketTransfer(transfer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.isCanceling.set(false);
          this.requestId++;
          if (updated.senderStatus !== 'CANCELED') {
            this.state.set({ status: 'ready', transfer: updated });
            this.snackBar.open('O pedido já foi respondido e não pode ser cancelado.', 'Fechar', { duration: 4000 });
            return;
          }
          this.state.set({ status: 'ready', transfer: updated });
          this.snackBar.open(`Pedido de transferência cancelado: ${transfer.ticket.name}.`, 'Fechar', {
            duration: 3500,
          });
        },
        error: () => {
          this.isCanceling.set(false);
          this.snackBar.open('Não foi possível cancelar o pedido agora. Atualize a página e tente novamente.', 'Fechar', {
            duration: 4000,
          });
          this.load();
        },
      });
  }

  ignoreReasonText(transfer: TicketTransfer): string {
    switch (transfer.ignoreReason) {
      case 'USER_IGNORED':
        return 'Você ignorou este pedido. Essa decisão não pode ser desfeita para este pedido.';
      case 'INELIGIBLE':
        return 'Você não era elegível para receber este bilhete quando o pedido foi iniciado. Ele foi ignorado automaticamente.';
      case 'ALREADY_HELD':
        return 'Este bilhete já estava na sua carteira. O pedido foi ignorado automaticamente.';
      default:
        return 'Este pedido foi ignorado.';
    }
  }

  stateMessage(transfer: TicketTransfer): string {
    switch (ticketStatusAt(transfer.ticket, this.now())) {
      case 'CONSUMED':
        return 'Este bilhete já foi utilizado e não pode ser transferido.';
      case 'EXPIRED':
        return 'Este bilhete expirou. Não é possível recebê-lo ou transferi-lo.';
      case 'REVOKED':
        return 'Este bilhete foi revogado e não pode ser transferido.';
    }
    if (transfer.senderStatus === 'ACCEPTED') return 'Este bilhete foi recebido.';
    if (transfer.senderStatus === 'CANCELED') return 'Este pedido foi cancelado.';
    if (transfer.senderStatus === 'EXPIRED') return 'Este pedido expirou.';
    if (transfer.recipientStatus === 'IGNORED' || transfer.recipientStatus === 'SYSTEM_INELIGIBLE' || transfer.recipientStatus === 'SYSTEM_DUPLICATE') {
      return this.ignoreReasonText(transfer);
    }
    return 'Este pedido está aguardando uma resposta.';
  }

  ticketIsUnavailable(transfer: TicketTransfer): boolean {
    return ticketStatusAt(transfer.ticket, this.now()) !== 'ACTIVE';
  }

  private confirm(action: 'accept' | 'ignore', transfer: TicketTransfer): void {
    if (action === 'accept' && (!this.canAccept() || this.isAccepting())) return;
    if (action === 'ignore' && !this.canAccept()) return;

    const data: TicketTransferActionDialogData = { action, ticketName: transfer.ticket.name };
    this.dialog
      .open<TicketTransferActionDialog, TicketTransferActionDialogData, boolean>(TicketTransferActionDialog, {
        data,
        width: 'min(30rem, calc(100vw - 2rem))',
        autoFocus: false,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        if (action === 'accept') this.accept(transfer);
        else this.ignore(transfer);
      });
  }

  private accept(transfer: TicketTransfer): void {
    this.isAccepting.set(true);
    this.api
      .acceptTicketTransfer(transfer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.isAccepting.set(false);
          this.requestId++;
          if (updated.senderStatus === 'ACCEPTED' && updated.recipientStatus === 'ACCEPTED') {
            this.snackBar.open(`Bilhete recebido: ${transfer.ticket.name}.`, 'Fechar', { duration: 3500 });
            void this.router.navigate(['/profile/wallet/tickets', transfer.ticket.id]);
            return;
          }

          this.state.set({ status: 'ready', transfer: updated });
        },
        error: () => {
          this.isAccepting.set(false);
          this.snackBar.open('Não foi possível receber este bilhete. Atualize a página e tente novamente.', 'Fechar', {
            duration: 4000,
          });
          this.load();
        },
      });
  }

  private ignore(transfer: TicketTransfer): void {
    this.isIgnoring.set(true);
    this.api
      .ignoreTicketTransfer(transfer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.isIgnoring.set(false);
          this.requestId++;
          this.state.set({ status: 'ready', transfer: updated });
          this.snackBar.open(
            updated.ignoreReason === 'USER_IGNORED' ? 'Pedido ignorado.' : 'Este pedido já foi atualizado.',
            'Fechar',
            { duration: 3000 },
          );
        },
        error: () => {
          this.isIgnoring.set(false);
          this.snackBar.open('Não foi possível ignorar este pedido. Atualize a página e tente novamente.', 'Fechar', {
            duration: 4000,
          });
          this.load();
        },
      });
  }

  private readyTransfer(): TicketTransfer | null {
    const current = this.state();
    return current.status === 'ready' ? current.transfer : null;
  }

  private load(): void {
    if (!this.transferId) return;
    const requestId = ++this.requestId;
    this.state.set({ status: 'loading' });
    this.api
      .ticketTransfer(this.transferId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transfer) => {
          if (requestId !== this.requestId) return;
          if (transfer) {
            this.state.set({ status: 'ready', transfer });
            this.now.set(Date.now());
            this.scheduleExpiryRefresh(transfer);
          } else {
            this.state.set({ status: 'empty', message: 'Este pedido de transferência não está disponível.' });
          }
        },
        error: () => {
          if (requestId === this.requestId) {
            this.state.set({ status: 'error', message: 'Não foi possível carregar este pedido de transferência.' });
          }
        },
      });
  }

  private scheduleExpiryRefresh(transfer: TicketTransfer): void {
    this.clearExpiryTimer();
    if (!isPlatformBrowser(this.platformId)) return;

    const now = Date.now();
    this.now.set(now);
    const ticket = transfer.ticket;
    const expiryKey = `${ticket.id}:${ticket.effectiveExpiresAt}`;
    if (ticket.status === 'ACTIVE' && ticketStatusAt(ticket, now) === 'EXPIRED') {
      if (this.lastExpiryRefreshKey !== expiryKey) {
        this.lastExpiryRefreshKey = expiryKey;
        this.load();
      }
      return;
    }
    this.lastExpiryRefreshKey = '';

    const delay = nextDeadlineDelay(
      [ticket.effectiveExpiresAt],
      now,
    );
    if (delay === null) return;

    this.expiryTimer = window.setTimeout(() => {
      this.expiryTimer = null;
      this.now.set(Date.now());
      if (ticketStatusAt(ticket, this.now()) === 'EXPIRED') {
        this.lastExpiryRefreshKey = `${ticket.id}:${ticket.effectiveExpiresAt}`;
        this.load();
      }
      else this.scheduleExpiryRefresh(transfer);
    }, delay);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer !== null && isPlatformBrowser(this.platformId)) window.clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  private refreshForChange(invalidation: TicketRealtimeInvalidation): void {
    if (
      invalidation.type === 'TRANSFERS_CHANGED' ||
      invalidation.ticketId === this.readyTransfer()?.ticket.id ||
      invalidation.transferId === this.transferId
    ) {
      this.load();
    }
  }
}
