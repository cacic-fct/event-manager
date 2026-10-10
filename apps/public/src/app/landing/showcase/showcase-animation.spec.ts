import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { playShowcaseSequence } from './showcase-animation';

@Component({ template: '{{ step() }}' })
class AnimatedPreview {
  readonly active = signal(true);
  readonly step = signal(0);

  constructor() {
    playShowcaseSequence((schedule) => {
      schedule(() => this.step.set(1), 400);
      schedule(() => this.step.set(2), 800);
    }, () => this.active());
  }
}

describe('playShowcaseSequence', () => {
  let reportVisibility: (visible: boolean) => void;
  let reducedMotion = false;

  beforeEach(async () => {
    reducedMotion = false;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) {
        reportVisibility = (visible) => callback(
          [{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      observe() { /* Visibility is reported explicitly by each test. */ }
      disconnect() { /* No observer resources exist in this fixture. */ }
    });
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        get matches() { return reducedMotion; },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    await TestBed.configureTestingModule({ imports: [AnimatedPreview] }).compileComponents();
    vi.useFakeTimers();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits until the preview is visible and cancels upcoming steps when it leaves view', async () => {
    const fixture = TestBed.createComponent(AnimatedPreview);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(900);
    expect(fixture.componentInstance.step()).toBe(0);

    reportVisibility(true);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(400);
    expect(fixture.componentInstance.step()).toBe(1);

    reportVisibility(false);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500);
    expect(fixture.componentInstance.step()).toBe(1);
  });

  it('stops the sequence when the visitor takes control', async () => {
    const fixture = TestBed.createComponent(AnimatedPreview);
    fixture.detectChanges();
    reportVisibility(true);
    fixture.detectChanges();
    fixture.componentInstance.active.set(false);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(900);

    expect(fixture.componentInstance.step()).toBe(0);
  });

  it('keeps reduced-motion previews static', async () => {
    reducedMotion = true;
    const fixture = TestBed.createComponent(AnimatedPreview);
    fixture.detectChanges();
    reportVisibility(true);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(900);

    expect(fixture.componentInstance.step()).toBe(0);
  });
});
