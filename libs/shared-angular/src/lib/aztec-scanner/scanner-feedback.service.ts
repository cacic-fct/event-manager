import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { ScannerSoundKind, ScannerSoundsService } from './scanner-sounds.service';

export type ScannerFeedbackKind = ScannerSoundKind;

const FEEDBACK_COLORS: Record<ScannerFeedbackKind, string> = {
  valid: 'rgba(46, 125, 50, 0.36)',
  duplicate: 'rgba(251, 192, 45, 0.42)',
  invalid: 'rgba(198, 40, 40, 0.38)',
  nonPaying: 'rgba(123, 31, 162, 0.38)',
  nonSubscribed: 'rgba(123, 31, 162, 0.38)',
};

@Injectable({
  providedIn: 'root',
})
export class ScannerFeedbackService {
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly scannerSounds = inject(ScannerSoundsService);

  private overlay: HTMLDivElement | null = null;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  show(kind: ScannerFeedbackKind): void {
    void this.scannerSounds.play(kind);
    this.flash(kind);
  }

  private flash(kind: ScannerFeedbackKind): void {
    if (!this.isBrowser) {
      return;
    }

    const overlay = this.getOverlay();
    overlay.style.background = FEEDBACK_COLORS[kind];
    overlay.style.opacity = '1';

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    this.hideTimeout = setTimeout(() => {
      overlay.style.opacity = '0';
    }, 500);
  }

  private getOverlay(): HTMLDivElement {
    if (this.overlay) {
      return this.overlay;
    }

    const overlay = this.document.createElement('div');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.inset = '0';
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.position = 'fixed';
    overlay.style.transition = 'opacity 140ms ease-out';
    overlay.style.zIndex = '2147483647';

    this.document.body.appendChild(overlay);
    this.overlay = overlay;

    return overlay;
  }
}
