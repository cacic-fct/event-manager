import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { WalletBarcodeComponent } from '../barcode/barcode';
import { WalletCardUser } from './wallet-card.types';

@Component({
  selector: 'app-wallet-restaurant-card',
  imports: [WalletBarcodeComponent],
  template: `
    <section class="ticket-details restaurant-details">
      <p class="card-overline">Cartão de Cliente</p>
      <h1>{{ user()?.name || 'Desconhecido' }}</h1>
      <app-wallet-barcode
        class="restaurant-barcode"
        [barcodeType]="'code128'"
        [userId]="restaurantNumber() || ''"
        label="Código de barras do Cartão do R.U." />
      <p>Apresente este cartão na catraca do Restaurante Universitário.</p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .ticket-details {
      display: grid;
      gap: 0.75rem;
      padding: 1.5rem 1.25rem;
    }
    h1,
    p {
      margin: 0;
    }
    h1 {
      overflow-wrap: anywhere;
      font-size: clamp(1.4rem, 5vw, 1.75rem);
      line-height: 1.1;
      letter-spacing: -0.028em;
    }
    .card-overline {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      opacity: 0.75;
    }
    .restaurant-details {
      gap: 1rem;
    }
    .restaurant-barcode {
      min-height: 5rem;
      padding: 0.75rem;
      color: #10233f;
      background: #fff;
      border-radius: 12px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletRestaurantCard {
  readonly user = input<WalletCardUser | null>(null);
  readonly restaurantNumber = input<string | null>(null);
}
