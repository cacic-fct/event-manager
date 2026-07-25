import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'app-wallet-print-styles',
  template: '',
  styles: `
    @media print {
      @page { size: A4 portrait; margin: 0; }
      body:has(app-wallet) * { visibility: hidden !important; }
      app-wallet app-wallet-card, app-wallet app-wallet-card * { visibility: visible !important; }
      app-wallet .wallet-toolbar { display: none !important; }
      app-wallet .wallet-page { padding: 0; margin: 0; background-color: #fff !important; }
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletPrintStyles {}
