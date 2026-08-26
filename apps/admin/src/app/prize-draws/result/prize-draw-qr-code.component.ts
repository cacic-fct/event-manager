import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, PLATFORM_ID, effect, inject, input, viewChild } from '@angular/core';
import { toCanvas } from '@bwip-js/browser';

@Component({
  selector: 'app-prize-draw-qr-code',
  template: '<canvas #canvas aria-hidden="true" [style.width.px]="size()" [style.height.px]="size()"></canvas>',
  styles: `
    :host {
      display: block;
      width: fit-content;
      padding: 0.75rem;
      border-radius: 12px;
      background: #fff;
    }
    canvas {
      display: block;
      max-width: min(42vw, 11rem);
      max-height: min(42vw, 11rem);
    }
  `,
})
export class PrizeDrawQrCodeComponent implements AfterViewInit {
  readonly value = input.required<string>();
  readonly size = input(176);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly platformId = inject(PLATFORM_ID);
  private viewReady = false;

  constructor() {
    effect(() => {
      const value = this.value();
      this.size();
      if (this.viewReady) queueMicrotask(() => this.render(value));
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.render(this.value());
  }

  private render(value: string): void {
    if (!isPlatformBrowser(this.platformId) || !value) return;
    try {
      toCanvas(this.canvas().nativeElement, {
        bcid: 'qrcode',
        text: value,
        scale: 4,
        includetext: false,
        padding: 0,
        backgroundcolor: 'ffffff',
      });
    } catch {
      // The draw result remains usable when this progressive enhancement cannot render.
    }
  }
}
