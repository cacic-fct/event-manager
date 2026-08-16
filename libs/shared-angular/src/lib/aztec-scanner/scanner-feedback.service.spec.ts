import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { ScannerFeedbackService } from './scanner-feedback.service';
import { ScannerSoundsService } from './scanner-sounds.service';

describe('ScannerFeedbackService', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;
  const play = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    document.body.replaceChildren();
    play.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['valid', 'rgba(46, 125, 50, 0.36)'],
    ['duplicate', 'rgba(251, 192, 45, 0.42)'],
    ['invalid', 'rgba(198, 40, 40, 0.38)'],
    ['nonPaying', 'rgba(123, 31, 162, 0.38)'],
    ['nonSubscribed', 'rgba(123, 31, 162, 0.38)'],
  ] as const)('plays and displays %s feedback before hiding it', (kind, color) => {
    const { injector, service } = createService('browser');

    try {
      service.show(kind);

      const overlay = document.body.querySelector<HTMLDivElement>('div[aria-hidden="true"]');
      expect(play).toHaveBeenCalledWith(kind);
      expect(overlay?.style.background).toBe(color);
      expect(overlay?.style.opacity).toBe('1');
      expect(overlay?.style.pointerEvents).toBe('none');

      vi.advanceTimersByTime(500);

      expect(overlay?.style.opacity).toBe('0');
    } finally {
      injector.destroy();
    }
  });

  it('reuses one overlay and restarts the hide delay for consecutive scans', () => {
    const { injector, service } = createService('browser');

    try {
      service.show('valid');
      vi.advanceTimersByTime(400);
      service.show('invalid');
      vi.advanceTimersByTime(100);

      const overlays = document.body.querySelectorAll<HTMLDivElement>('div[aria-hidden="true"]');
      expect(overlays).toHaveLength(1);
      expect(overlays[0].style.opacity).toBe('1');
      expect(overlays[0].style.background).toBe('rgba(198, 40, 40, 0.38)');

      vi.advanceTimersByTime(400);

      expect(overlays[0].style.opacity).toBe('0');
    } finally {
      injector.destroy();
    }
  });

  it('plays sound without attempting to render an overlay during SSR', () => {
    const { injector, service } = createService('server');

    try {
      service.show('valid');

      expect(play).toHaveBeenCalledWith('valid');
      expect(document.body.childElementCount).toBe(0);
    } finally {
      injector.destroy();
    }
  });

  function createService(platformId: 'browser' | 'server') {
    const injector = createEnvironmentInjector(
      [
        { provide: DOCUMENT, useValue: document },
        { provide: PLATFORM_ID, useValue: platformId },
        { provide: ScannerSoundsService, useValue: { play } },
      ],
      rootEnvironmentInjector,
    );
    const service = runInInjectionContext(injector, () => new ScannerFeedbackService());
    return { injector, service };
  }
});
