import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { TicketRealtimeInvalidation, TicketTransfer, WalletTicket } from '@cacic-fct/shared-ticketing';
import { forkJoin } from 'rxjs';
import { CalendarListItem, CalendarListItemData } from '../../calendar/event-list/calendar-list-item';
import { TicketingApiService } from './ticketing-api.service';
import { normalizeTicketIdentityDocument, ticketDocumentValidator } from './ticket-document';
import { TicketPersonSummaryComponent } from './ticket-person-summary.component';
import { redactIdentityDocument } from './ticket-document';
import { nextDeadlineDelay, ticketStatusAt } from './ticket-expiration';

type TransferStartState =
  | { status: 'loading' }
  | { status: 'ready'; ticket: WalletTicket; pendingTransfer: TicketTransfer | null }
  | { status: 'empty'; message: string }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-ticket-transfer-start-page',
  imports: [
    CalendarListItem,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatToolbarModule,
    ReactiveFormsModule,
    RouterLink,
    TicketPersonSummaryComponent,
  ],
  templateUrl: './ticket-transfer-start-page.html',
  styleUrl: './ticket-transfer-start-page.css',
})
export class TicketTransferStartPage {
  private readonly api = inject(TicketingApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private requestId = 0;
  private ticketId = '';
  private expiryTimer: number | null = null;
  private lastExpiryRefreshKey = '';

  readonly state = signal<TransferStartState>({ status: 'loading' });
  readonly isSubmitting = signal(false);
  readonly isCanceling = signal(false);
  readonly formError = signal('');
  readonly now = signal(Date.now());
  readonly ticketIsActive = computed(() => {
    const current = this.state();
    return current.status === 'ready' && this.ticketStatus(current.ticket) === 'ACTIVE';
  });
  readonly canStartTransfer = computed(() => {
    const current = this.state();
    return current.status === 'ready' && this.ticketIsActive() && current.ticket.transferable && current.pendingTransfer === null;
  });
  readonly senderIdentity = computed(() => {
    const current = this.state();
    const ticketHolder = current.status === 'ready' ? current.ticket.holder : null;
    const user = this.auth.user();
    const claims = user?.claims;
    const name = typeof claims?.['name'] === 'string' ? claims['name'] : ticketHolder?.fullName;
    const picture = typeof claims?.['picture'] === 'string' ? claims['picture'] : ticketHolder?.avatarUrl;
    const document = typeof claims?.['identity_document'] === 'string'
      ? redactIdentityDocument(claims['identity_document'])
      : ticketHolder?.redactedIdentityDocument;
    return {
      fullName: name ?? 'Portador do bilhete',
      avatarUrl: picture ?? null,
      identityDocument: document ?? null,
    };
  });
  readonly destinationForm = this.formBuilder.nonNullable.group({
    identityDocument: ['', [Validators.required, ticketDocumentValidator]],
  });
  readonly pendingTransfer = computed(() => {
    const current = this.state();
    return current.status === 'ready' ? current.pendingTransfer : null;
  });
  readonly canCancel = computed(() => {
    const transfer = this.pendingTransfer();
    return Boolean(
      transfer &&
        this.ticketIsActive() &&
        transfer.senderStatus === 'PENDING' &&
        transfer.canCancel,
    );
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.ticketId = params.get('ticketId') ?? '';
      this.clearExpiryTimer();
      if (!this.ticketId) {
        this.state.set({ status: 'empty', message: 'Este bilhete não está disponível.' });
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
      returnUrl: `/profile/wallet/tickets/${ticket.id}/transfer`,
      ariaLabel: `Abrir evento ${ticket.event.name}`,
    };
  }

  submitTransfer(): void {
    this.formError.set('');
    if (this.destinationForm.invalid || this.state().status !== 'ready') {
      this.destinationForm.markAllAsTouched();
      return;
    }

    const current = this.state();
    if (current.status !== 'ready' || current.pendingTransfer) return;
    if (!this.canStartTransfer()) {
      this.formError.set('Este bilhete não pode ser transferido.');
      return;
    }

    const document = normalizeTicketIdentityDocument(this.destinationForm.controls.identityDocument.value);
    this.isSubmitting.set(true);
    this.api
      .startTicketTransfer(current.ticket.id, document)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transfer) => {
          this.isSubmitting.set(false);
          this.requestId++;
          this.state.set({ status: 'ready', ticket: current.ticket, pendingTransfer: transfer });
          this.scheduleExpiryRefresh(current.ticket);
          this.destinationForm.reset({ identityDocument: '' });
          this.snackBar.open(`Pedido de transferência iniciado: ${current.ticket.name}.`, 'Fechar', {
            duration: 3500,
          });
        },
        error: () => {
          this.isSubmitting.set(false);
          this.formError.set('Não foi possível enviar o pedido agora. Confira o documento e tente novamente.');
          this.load();
        },
      });
  }

  cancelTransfer(): void {
    const transfer = this.pendingTransfer();
    if (!transfer || !this.canCancel() || this.isCanceling()) return;

    this.isCanceling.set(true);
    this.api
      .cancelTicketTransfer(transfer.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.isCanceling.set(false);
          this.requestId++;
          const current = this.state();
          if (updated.senderStatus === 'CANCELED' && current.status === 'ready') {
            this.state.set({ ...current, pendingTransfer: null });
            this.scheduleExpiryRefresh(current.ticket);
            this.destinationForm.reset({ identityDocument: '' });
            this.snackBar.open(`Pedido de transferência cancelado: ${transfer.ticket.name}.`, 'Fechar', {
              duration: 3500,
            });
            return;
          }

          this.load();
          this.formError.set('O pedido já foi respondido e não pode ser cancelado.');
        },
        error: () => {
          this.isCanceling.set(false);
          this.formError.set('Não foi possível cancelar o pedido agora. Atualize a página e tente novamente.');
          this.load();
        },
      });
  }

  documentErrorMessage(): string {
    const documentControl = this.destinationForm.controls.identityDocument;
    if (documentControl.hasError('required')) return 'Informe o CPF ou passaporte de quem receberá o bilhete.';
    if (documentControl.hasError('invalidCpf')) return 'Digite um CPF válido ou informe o passaporte.';
    return '';
  }

  ticketUnavailableMessage(ticket: WalletTicket): string {
    switch (this.ticketStatus(ticket)) {
      case 'UNAVAILABLE':
        return 'Este bilhete está indisponível porque sua configuração foi desativada.';
      case 'CONSUMED':
        return 'Este bilhete já foi utilizado e não pode ser transferido.';
      case 'EXPIRED':
        return 'Este bilhete expirou e não pode mais ser transferido.';
      case 'REVOKED':
        return 'Este bilhete foi revogado e não pode ser transferido.';
      case 'ACTIVE':
        return 'Este bilhete não pode ser transferido.';
    }
  }

  private load(): void {
    if (!this.ticketId) return;
    const requestId = ++this.requestId;
    this.state.set({ status: 'loading' });
    forkJoin({
      ticket: this.api.myWalletTicket(this.ticketId),
      transfers: this.api.myTicketTransfers(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ ticket, transfers }) => {
          if (requestId !== this.requestId) return;
          if (!ticket) {
            this.state.set({ status: 'empty', message: 'Este bilhete não está disponível.' });
            return;
          }
          const pending = transfers.outgoing.find(
            (transfer) => transfer.ticket.id === ticket.id && transfer.senderStatus === 'PENDING',
          ) ?? null;
          this.state.set({ status: 'ready', ticket, pendingTransfer: pending });
          this.now.set(Date.now());
          this.scheduleExpiryRefresh(ticket);
        },
        error: () => {
          if (requestId === this.requestId) {
            this.state.set({ status: 'error', message: 'Não foi possível carregar este bilhete.' });
          }
        },
      });
  }

  private scheduleExpiryRefresh(ticket: WalletTicket): void {
    this.clearExpiryTimer();
    if (!isPlatformBrowser(this.platformId)) return;

    const now = Date.now();
    this.now.set(now);
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
      else this.scheduleExpiryRefresh(ticket);
    }, delay);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer !== null && isPlatformBrowser(this.platformId)) window.clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  private refreshForChange(invalidation: TicketRealtimeInvalidation): void {
    if (
      invalidation.type === 'TICKETS_CHANGED' ||
      invalidation.type === 'TRANSFERS_CHANGED' ||
      invalidation.ticketId === this.ticketId
    ) {
      this.load();
    }
  }

  private ticketStatus(ticket: WalletTicket): WalletTicket['status'] {
    return ticketStatusAt(ticket, this.now());
  }
}
