import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { TicketRealtimeInvalidation, WalletTicket } from '@cacic-fct/shared-ticketing';
import { CalendarListItem, CalendarListItemData } from '../../calendar/event-list/calendar-list-item';
import { TicketingApiService } from './ticketing-api.service';
import { ticketStatusAt } from './ticket-expiration';
import { nextDeadlineDelay } from './ticket-expiration';

type TicketDetailsState =
  | { status: 'loading' }
  | { status: 'ready'; ticket: WalletTicket }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-ticket-details-page',
  imports: [
    CalendarListItem,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatToolbarModule,
    RouterLink,
  ],
  templateUrl: './ticket-details-page.html',
  styleUrl: './ticket-details-page.css',
})
export class TicketDetailsPage {
  private readonly api = inject(TicketingApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private requestId = 0;
  private expiryTimer: number | null = null;
  private lastExpiryRefreshKey = '';

  readonly state = signal<TicketDetailsState>({ status: 'loading' });
  readonly now = signal(Date.now());
  readonly canTransfer = computed(() => {
    const current = this.state();
    return current.status === 'ready' &&
      ticketStatusAt(current.ticket, this.now()) === 'ACTIVE' &&
      current.ticket.transferable;
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const ticketId = params.get('ticketId');
      this.clearExpiryTimer();
      if (!ticketId) {
        this.state.set({ status: 'empty', message: 'Este bilhete não está disponível.' });
        return;
      }
      this.loadTicket(ticketId);
    });

    this.api
      .watchCurrentUser()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invalidation) => this.refreshIfRelevant(invalidation),
      });

    this.destroyRef.onDestroy(() => this.clearExpiryTimer());
  }

  eventItem(ticket: WalletTicket): CalendarListItemData {
    return {
      id: ticket.event.id,
      name: ticket.event.name,
      emoji: ticket.event.emoji,
      startDate: ticket.event.startsAt,
      endDate: ticket.event.endsAt,
      contextLine: ticket.name,
      eventType: ticket.event.type,
      locationDescription: ticket.event.locationDescription,
      expiresAt: ticket.effectiveExpiresAt,
      route: ticket.event.publicUrl,
      returnUrl: `/profile/wallet/tickets/${ticket.id}`,
      ariaLabel: `Abrir evento ${ticket.event.name}`,
    };
  }

  statusLabel(ticket: WalletTicket): string {
    switch (ticketStatusAt(ticket, this.now())) {
      case 'ACTIVE':
        return 'Disponível';
      case 'CONSUMED':
        return 'Utilizado';
      case 'EXPIRED':
        return 'Expirado';
      case 'REVOKED':
        return 'Revogado';
    }
  }

  private loadTicket(ticketId: string): void {
    const requestId = ++this.requestId;
    this.state.set({ status: 'loading' });
    this.api
      .myWalletTicket(ticketId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ticket) => {
          if (requestId !== this.requestId) return;
          this.state.set(
            ticket
              ? { status: 'ready', ticket }
              : { status: 'empty', message: 'Este bilhete não está disponível.' },
          );
          this.now.set(Date.now());
          if (ticket) this.scheduleExpiryRefresh(ticket);
        },
        error: () => {
          if (requestId === this.requestId) {
            this.state.set({ status: 'error', message: 'Não foi possível carregar as informações deste bilhete.' });
          }
        },
      });
  }

  private scheduleExpiryRefresh(ticket: WalletTicket): void {
    this.clearExpiryTimer();
    if (!isPlatformBrowser(this.platformId)) return;

    const now = Date.now();
    this.now.set(now);
    const refreshKey = `${ticket.id}:${ticket.effectiveExpiresAt}`;
    if (ticket.status === 'ACTIVE' && ticketStatusAt(ticket, now) === 'EXPIRED') {
      if (this.lastExpiryRefreshKey !== refreshKey) {
        this.lastExpiryRefreshKey = refreshKey;
        this.loadTicket(ticket.id);
      }
      return;
    }
    this.lastExpiryRefreshKey = '';

    const delay = nextDeadlineDelay([ticket.effectiveExpiresAt], now);
    if (delay === null) return;

    this.expiryTimer = window.setTimeout(() => {
      this.expiryTimer = null;
      this.now.set(Date.now());
      if (ticketStatusAt(ticket, this.now()) === 'EXPIRED') {
        this.lastExpiryRefreshKey = `${ticket.id}:${ticket.effectiveExpiresAt}`;
        this.loadTicket(ticket.id);
      }
      else this.scheduleExpiryRefresh(ticket);
    }, delay);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer !== null && isPlatformBrowser(this.platformId)) window.clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  private refreshIfRelevant(invalidation: TicketRealtimeInvalidation): void {
    const current = this.state();
    const ticketId = this.route.snapshot.paramMap.get('ticketId');
    if (
      current.status === 'ready' &&
      ticketId &&
      (invalidation.ticketId === ticketId || invalidation.eventId === current.ticket.eventId ||
        invalidation.type === 'TICKETS_CHANGED' || invalidation.type === 'TRANSFERS_CHANGED')
    ) {
      this.loadTicket(ticketId);
    }
  }
}
