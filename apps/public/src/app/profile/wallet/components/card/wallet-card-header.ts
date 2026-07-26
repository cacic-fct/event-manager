import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { WALLET_CARD_BRANDS, WalletCardKind } from './wallet-card.types';

@Component({
  selector: 'app-wallet-card-header',
  imports: [MatIconModule],
  template: `
    <button class="ticket-header" type="button" (click)="selected.emit()">
      <span class="ticket-brand">
        @if (brand().imageSource; as imageSource) {
          <img [src]="imageSource" alt="" [class]="imageClass()" />
        } @else if (brand().materialIcon; as materialIcon) {
          <mat-icon class="ticket-icon">{{ materialIcon }}</mat-icon>
        }
        <span class="ticket-brand-name">{{ brand().name }}</span>
      </span>
    </button>
  `,
  styles: `
    :host {
      display: block;
    }
    .ticket-header {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 4.75rem;
      padding: 0 1.25rem;
      color: inherit;
      background: transparent;
      border: 0;
      cursor: pointer;
      font: inherit;
      text-align: start;
    }
    .ticket-header:focus-visible {
      outline: 3px solid #fff;
      outline-offset: -5px;
    }
    .ticket-brand {
      display: flex;
      gap: 0.625rem;
      align-items: center;
    }
    .ticket-icon {
      flex: 0 0 auto;
      display: block;
      width: 2.25rem;
      height: 2.25rem;
      font-size: 2.25rem;
      object-fit: contain;
    }
    .ticket-brand-name {
      margin: 0;
      font-size: 0.875rem;
      font-weight: 800;
      letter-spacing: -0.015em;
    }
    @media screen and (max-width: 400px) {
      .ticket-header {
        padding-inline: 1rem;
      }
      .ticket-brand-name {
        font-size: 0.8125rem;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletCardHeader {
  readonly kind = input<WalletCardKind>('eventos');
  readonly selected = output<void>();
  protected readonly brand = computed(() => WALLET_CARD_BRANDS[this.kind()]);
  protected readonly imageClass = computed(() => `ticket-icon ${this.brand().imageClass ?? ''}`);
}
