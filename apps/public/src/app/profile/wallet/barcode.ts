import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, input } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { toSVG } from '@bwip-js/browser';

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
  styles: [
    `
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
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletBarcodeComponent {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly userId = input('');
  readonly errorCorrectionLevel = input('35');
  readonly label = input('Código de barras');
  readonly ariaHidden = input(false);

  readonly trustedSvg = computed<SafeHtml | ''>(() => {
    const userId = this.userId().trim();
    if (!this.isBrowser || !userId) {
      return '';
    }

    const svg = this.renderAztecCode(userId);
    if (!svg) {
      return '';
    }

    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });

  private renderAztecCode(userId: string): string {
    try {
      // We use bwip here instead of zxing-wasm,
      // because its compressed size is smaller, and it generates code instantly
      return toSVG({
        bcid: 'azteccode',
        text: `user:${userId}`,
        height: 300,
        width: 300,
        includetext: false,
        textxalign: 'center',
        // @ts-expect-error - bwip-js supports eclevel for azteccode.
        eclevel: this.errorCorrectionLevel() || '90',
      });
    } catch (err) {
      console.error('Failed to render Aztec code:', err);

      return '';
    }
  }
}
