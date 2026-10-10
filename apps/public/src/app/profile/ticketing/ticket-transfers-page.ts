import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import type {
  TicketRealtimeInvalidation,
  TicketTransfer,
  TicketTransferLists,
} from '@cacic-fct/shared-ticketing';
import { CalendarListItem, CalendarListItemData } from '../../calendar/event-list/calendar-list-item';
import { TicketingApiService } from './ticketing-api.service';
import { routePageErrorStatus } from '../../shared/route-error-handling';

type TransferListState =
  | { status: 'loading' }
  | { status: 'ready'; transfers: TicketTransferLists };

@Component({
  selector: 'app-ticket-transfers-page',
  imports: [CalendarListItem, MatIconModule, MatListModule, MatProgressBarModule, MatToolbarModule, RouterLink],
  templateUrl: './ticket-transfers-page.html',
  styleUrl: './ticket-transfers-page.css',
})
export class TicketTransfersPage {
  private readonly api = inject(TicketingApiService);
  private readonly routeErrors = inject(RouteErrorService);
  private readonly destroyRef = inject(DestroyRef);
  private requestId = 0;

  readonly state = signal<TransferListState>({ status: 'loading' });
  readonly hasTransfers = computed(() => {
    const current = this.state();
    return current.status === 'ready' && Boolean(
      current.transfers.incomingPending.length ||
        current.transfers.incomingIgnored.length ||
        current.transfers.outgoing.length,
    );
  });

  constructor() {
    this.load();
    this.api
      .watchCurrentUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (invalidation) => this.refreshForChange(invalidation) });
  }

  incomingPendingItem(transfer: TicketTransfer): CalendarListItemData {
    return this.listItem(transfer, [
      `Cedente: ${transfer.sender?.firstName ?? transfer.sender?.fullName ?? 'Pessoa remetente'}`,
      ...(transfer.initiatedByAdmin
        ? [`Transferência iniciada por: ${transfer.initiatingAdmin?.firstName ?? 'administração'}`]
        : []),
    ], ['/profile/wallet/ticket-transfers', transfer.id]);
  }

  incomingIgnoredItem(transfer: TicketTransfer): CalendarListItemData {
    const reasonLine = this.ignoredReasonLine(transfer);
    return this.listItem(
      transfer,
      [
        `Cedente: ${transfer.sender?.firstName ?? transfer.sender?.fullName ?? 'Pessoa remetente'}`,
        ...(transfer.initiatedByAdmin
          ? [`Transferência iniciada por: ${transfer.initiatingAdmin?.firstName ?? 'administração'}`]
          : []),
        reasonLine,
      ],
      ['/profile/wallet/ticket-transfers', transfer.id],
    );
  }

  outgoingItem(transfer: TicketTransfer): CalendarListItemData {
    const pending = transfer.senderStatus === 'PENDING';
    return this.listItem(
      transfer,
      [this.outgoingStatusLine(transfer)],
      pending ? ['/profile/wallet/ticket-transfers', transfer.id] : null,
    );
  }

  retry(): void {
    this.load();
  }

  private load(): void {
    const requestId = ++this.requestId;
    this.state.set({ status: 'loading' });
    this.api
      .myTicketTransfers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transfers) => {
          if (requestId === this.requestId) this.state.set({ status: 'ready', transfers });
        },
        error: (error: unknown) => {
          if (requestId === this.requestId) void this.routeErrors.navigate(routePageErrorStatus(error));
        },
      });
  }

  private refreshForChange(invalidation: TicketRealtimeInvalidation): void {
    if (invalidation.type === 'TRANSFERS_CHANGED' || invalidation.type === 'TICKETS_CHANGED') this.load();
  }

  private listItem(
    transfer: TicketTransfer,
    lines: readonly string[],
    route: CalendarListItemData['route'],
  ): CalendarListItemData {
    return {
      id: transfer.id,
      name: transfer.ticket.name,
      emoji: transfer.ticket.emoji,
      startDate: transfer.event.startsAt,
      endDate: transfer.event.endsAt,
      contextLine: transfer.event.name,
      eventType: transfer.event.type,
      secondaryLines: lines,
      locationDescription: transfer.event.locationDescription,
      expiresAt: transfer.expiresFromListAt,
      expiresLabel: 'Disponível na lista até',
      route,
      returnUrl: '/profile/wallet/ticket-transfers',
    };
  }

  private ignoredReasonLine(transfer: TicketTransfer): string {
    switch (transfer.ignoreReason) {
      case 'USER_IGNORED':
        return 'Ignorado por você';
      case 'INELIGIBLE':
        return 'Você não era elegível para receber este bilhete';
      case 'ALREADY_HELD':
        return 'Este bilhete já estava na sua carteira';
      default:
        return 'Pedido ignorado';
    }
  }

  private outgoingStatusLine(transfer: TicketTransfer): string {
    switch (transfer.senderStatus) {
      case 'PENDING':
        return 'Aguardando resposta';
      case 'ACCEPTED':
        return 'Transferência aceita';
      case 'CANCELED':
        return 'Pedido cancelado';
      case 'EXPIRED':
        return 'Pedido expirado';
    }
  }
}
