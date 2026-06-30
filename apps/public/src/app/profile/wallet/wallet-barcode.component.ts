import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-wallet-barcode',
  template: `
    <div
      class="barcode-content"
      role="img"
      [attr.aria-hidden]="ariaHidden() ? 'true' : null"
      [attr.aria-label]="ariaHidden() ? null : label()"
      [innerHTML]="trustedSvg()"></div>
  `,
  styles: [`
    :host {
      display: block;
      overflow: hidden;
    }

    .barcode-content {
      width: 100%;
      height: 100%;
    }

    :host ::ng-deep svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletBarcodeComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly svg = input('');
  readonly label = input('Código de barras');
  readonly ariaHidden = input(false);

  readonly trustedSvg = computed<SafeHtml | ''>(() => {
    const value = this.svg().trim();
    if (!this.isSvgDocument(value)) {
      return '';
    }

    return this.sanitizer.bypassSecurityTrustHtml(value);
  });

  private isSvgDocument(value: string): boolean {
    return value.startsWith('<svg') && value.includes('</svg>');
  }
}
