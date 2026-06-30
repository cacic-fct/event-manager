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
    const safeSvg = this.toTrustedSvgMarkup(value);
    if (!safeSvg) {
      return '';
    }

    return this.sanitizer.bypassSecurityTrustHtml(safeSvg);
  });

  private toTrustedSvgMarkup(value: string): string {
    if (!this.isSvgDocument(value) || typeof DOMParser === 'undefined') {
      return '';
    }

    const parsed = new DOMParser().parseFromString(value, 'image/svg+xml');
    if (parsed.querySelector('parsererror')) {
      return '';
    }

    const root = parsed.documentElement;
    if (root.nodeName.toLowerCase() !== 'svg' || !this.hasOnlyAllowedSvgContent(root)) {
      return '';
    }

    return root.outerHTML;
  }

  private isSvgDocument(value: string): boolean {
    return /^<svg(?:\s|>)/i.test(value) && /<\/svg>\s*$/i.test(value);
  }

  private hasOnlyAllowedSvgContent(root: Element): boolean {
    const allowedElements = new Set(['svg', 'g', 'path', 'rect']);
    const allowedAttributes = new Set([
      'aria-hidden',
      'd',
      'fill',
      'height',
      'preserveaspectratio',
      'role',
      'stroke',
      'stroke-linecap',
      'stroke-linejoin',
      'stroke-width',
      'transform',
      'viewbox',
      'width',
      'x',
      'xmlns',
      'y',
    ]);
    const blockedValue = /(?:javascript:|data:|url\s*\(|<|>)/i;
    const visit = (element: Element): boolean => {
      if (!allowedElements.has(element.nodeName.toLowerCase())) {
        return false;
      }

      for (const attribute of Array.from(element.attributes)) {
        const name = attribute.name.toLowerCase();
        if (name.startsWith('on') || !allowedAttributes.has(name) || blockedValue.test(attribute.value)) {
          return false;
        }
      }

      for (const child of Array.from(element.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent?.trim()) {
            return false;
          }
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE || !visit(child as Element)) {
          return false;
        }
      }

      return true;
    };

    return visit(root);
  }
}
