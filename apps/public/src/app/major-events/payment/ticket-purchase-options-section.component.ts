import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router } from '@angular/router';
import { TicketingApiService } from '../../profile/ticketing/ticketing-api.service';
import type { TicketPurchase, TicketPurchaseOption } from '@cacic-fct/shared-ticketing';
import { AnalyticsService } from '../../analytics/analytics.service';
import { EmojiService } from '../../shared/emoji.service';
import { TicketPurchaseApiService } from './ticket-purchase-api.service';

registerLocaleData(localePt, 'pt-BR');

type TicketPurchaseSectionState =
  | { status: 'loading' }
  | { status: 'ready'; options: TicketPurchaseOption[]; purchases: TicketPurchase[] }
  | { status: 'error' };

@Component({
  selector: 'app-ticket-purchase-options-section',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
  ],
  templateUrl: './ticket-purchase-options-section.component.html',
  styleUrl: './ticket-purchase-options-section.component.css',
})
export class TicketPurchaseOptionsSectionComponent {
  private readonly analytics = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly emojiService = inject(EmojiService);
  private readonly purchaseApi = inject(TicketPurchaseApiService);
  private readonly router = inject(Router);
  private readonly ticketApi = inject(TicketingApiService);
  private requestId = 0;

  readonly majorEventId = input.required<string>();
  readonly subscriptionStatus = input.required<string | null>();
  readonly state = signal<TicketPurchaseSectionState>({ status: 'loading' });

  constructor() {
    effect((onCleanup) => {
      const majorEventId = this.majorEventId();
      if (!majorEventId || this.subscriptionStatus() !== 'CONFIRMED') {
        this.state.set({ status: 'ready', options: [], purchases: [] });
        return;
      }

      this.load(majorEventId);
      const stream = this.ticketApi
        .watchCurrentUser()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (invalidation) => {
            if (
              invalidation.type === 'PURCHASES_CHANGED' || invalidation.type === 'TICKETS_CHANGED'
            ) {
              this.load(majorEventId);
            }
          },
        });
      onCleanup(() => {
        stream.unsubscribe();
        this.requestId++;
      });
    });
  }

  purchase(option: TicketPurchaseOption): void {
    this.analytics.trackEvent('ticket_purchase_clicked', {
      major_event_id: option.majorEventId,
      event_id: option.eventId,
      ticket_config_id: option.ticketConfigId,
      amount_cents: option.amountCents,
      price_tier_id: option.priceTierId,
    });
    void this.router.navigate(['/major-event', option.majorEventId, 'payment', 'ticket', option.eventId], {
      queryParams: {
        ticketConfigId: option.ticketConfigId,
        expectedAmountCents: option.amountCents,
      },
    });
  }

  emojiUrl(emoji: string): string {
    return this.emojiService.getTwemojiUrl(emoji);
  }

  purchaseStatusLabel(status: TicketPurchase['status']): string {
    switch (status) {
      case 'UNDER_REVIEW':
        return 'Comprovante em análise';
      case 'APPROVED':
        return 'Compra aprovada';
      case 'REJECTED':
        return 'Comprovante rejeitado';
    }
  }

  retry(): void {
    this.load(this.majorEventId());
  }

  private load(majorEventId: string): void {
    const requestId = ++this.requestId;
    this.state.set({ status: 'loading' });
    this.purchaseApi
      .getOptions(majorEventId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => {
          if (requestId !== this.requestId) return;
          this.purchaseApi
            .getPurchases(majorEventId)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: (purchases) => {
                if (requestId === this.requestId) this.state.set({ status: 'ready', options, purchases });
              },
              error: () => {
                if (requestId === this.requestId) this.state.set({ status: 'error' });
              },
            });
        },
        error: () => {
          if (requestId === this.requestId) this.state.set({ status: 'error' });
        },
      });
  }
}
