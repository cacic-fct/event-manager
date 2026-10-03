import { Component, computed, inject, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import type { WalletTicket } from '@cacic-fct/shared-ticketing';
import { WalletOfflineCodeCard } from '../offline-code-card/offline-code-card';
import { WalletAcademicRecordCard } from './wallet-academic-record-card';
import { WalletCardHeader } from './wallet-card-header';
import { WalletCardBrand, WalletCardKind, WalletCardSelection, WalletCardUser } from './wallet-card.types';
import { WalletEventCard } from './wallet-event-card';
import { WalletEventTicketCard } from './wallet-event-ticket-card';
import { EmojiService } from '../../../../shared/emoji.service';

@Component({
  selector: 'app-wallet-card',
  imports: [
    MatCardModule,
    WalletAcademicRecordCard,
    WalletCardHeader,
    WalletEventCard,
    WalletEventTicketCard,
    WalletOfflineCodeCard,
  ],
  host: {
    '[class]': 'cardClass()',
  },
  templateUrl: './wallet-card.html',
  styleUrl: './wallet-card.css',
})
export class WalletCard {
  readonly user = input<WalletCardUser | null>(null);
  readonly kind = input<WalletCardKind>('eventos');
  readonly ticket = input<WalletTicket | null>(null);
  readonly ticketStatus = input<WalletTicket['status'] | null>(null);
  readonly selectionId = input<WalletCardSelection | null>(null);
  readonly stacked = input(false);
  readonly cardSelected = output<WalletCardSelection>();
  private readonly emoji = inject(EmojiService);
  readonly cardClass = computed(() => `wallet-ticket-${this.ticket() ? 'event-ticket' : this.kind()}`);
  readonly ticketBrand = computed<WalletCardBrand | null>(() => {
    const ticket = this.ticket();
    return ticket ? { name: ticket.name, imageSource: this.emoji.getTwemojiUrl(ticket.emoji) } : null;
  });

  protected selectCard(): void {
    this.cardSelected.emit(this.selectionId() ?? this.kind());
  }
}
