import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { DestroyRef, ElementRef, PLATFORM_ID, afterNextRender, effect, inject, signal, untracked } from '@angular/core';

export type ScheduleShowcaseStep = (callback: () => void, delayMs: number) => void;

/** Runs a finite preview sequence only while its surface is visible and active. */
export function playShowcaseSequence(
  play: (schedule: ScheduleShowcaseStep) => void | (() => void),
  isActive: () => boolean = () => true,
): void {
  const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const destroyRef = inject(DestroyRef);
  const document = inject(DOCUMENT);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const visible = signal(false);
  const reducedMotion = signal(false);
  const foreground = signal(true);
  let observer: IntersectionObserver | undefined;
  let motionQuery: MediaQueryList | undefined;
  const updateMotion = () => reducedMotion.set(
    Boolean(motionQuery?.matches) || document.documentElement.dataset['storybookMotion'] === 'reduced',
  );
  const updateVisibility = () => foreground.set(document.visibilityState !== 'hidden');

  afterNextRender(() => {
    motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    updateMotion();
    updateVisibility();
    motionQuery?.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);

    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver(
        (entries) => visible.set(entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.15)),
        { threshold: 0.15 },
      );
      observer.observe(element);
    } else {
      visible.set(true);
    }
  });

  effect((onCleanup) => {
    if (!isBrowser || !visible() || !foreground() || reducedMotion() || !isActive()) return;
    const timers = new Set<number>();
    const schedule: ScheduleShowcaseStep = (callback, delayMs) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        callback();
      }, delayMs);
      timers.add(timer);
    };
    const stopPlayback = untracked(() => play(schedule));
    onCleanup(() => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (typeof stopPlayback === 'function') stopPlayback();
    });
  });

  destroyRef.onDestroy(() => {
    observer?.disconnect();
    motionQuery?.removeEventListener('change', updateMotion);
    document.removeEventListener('visibilitychange', updateVisibility);
  });
}
