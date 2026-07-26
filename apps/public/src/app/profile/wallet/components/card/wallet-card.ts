import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { WalletOfflineCodeCard } from '../offline-code-card/offline-code-card';
import { WalletAcademicRecordCard } from './wallet-academic-record-card';
import { WalletCardHeader } from './wallet-card-header';
import { WalletCardKind, WalletCardUser } from './wallet-card.types';
import { WalletEventCard } from './wallet-event-card';
import { WalletRestaurantCard } from './wallet-restaurant-card';

@Component({
  selector: 'app-wallet-card',
  imports: [
    MatCardModule,
    WalletAcademicRecordCard,
    WalletCardHeader,
    WalletEventCard,
    WalletOfflineCodeCard,
    WalletRestaurantCard,
  ],
  host: {
    '[class]': "'wallet-ticket-' + kind()",
  },
  templateUrl: './wallet-card.html',
  styleUrl: './wallet-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletCard {
  readonly user = input<WalletCardUser | null>(null);
  readonly kind = input<WalletCardKind>('eventos');
  readonly restaurantNumber = input<string | null>(null);
  readonly stacked = input(false);
  readonly cardSelected = output<WalletCardKind>();

  protected selectCard(): void {
    this.cardSelected.emit(this.kind());
  }
}
