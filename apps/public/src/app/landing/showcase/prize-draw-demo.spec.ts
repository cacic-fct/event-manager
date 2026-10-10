import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ScannerSoundsService } from '@cacic-fct/shared-angular/aztec-scanner';
import { PrizeDrawReelComponent } from '@cacic-fct/shared-angular';
import { PrizeDrawDemoComponent } from './prize-draw-demo';

describe('PrizeDrawDemoComponent', () => {
  let fixture: ComponentFixture<PrizeDrawDemoComponent>;
  let fixtureDestroyed: boolean;
  let nextFrame: FrameRequestCallback | undefined;
  let frameId: number;
  let frameClock: number;
  let tone: ReturnType<typeof vi.fn>;
  let cancelFrame: ReturnType<typeof vi.fn>;
  let prefersReducedMotion: boolean;
  let motionPreferenceListeners: Array<(event: MediaQueryListEvent) => void>;

  beforeEach(async () => {
    fixtureDestroyed = false;
    nextFrame = undefined;
    frameId = 0;
    frameClock = 0;
    tone = vi.fn();
    cancelFrame = vi.fn();
    prefersReducedMotion = false;
    motionPreferenceListeners = [];
    document.documentElement.dataset['storybookMotion'] = 'full';

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({
        get matches() {
          return prefersReducedMotion;
        },
        addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
          motionPreferenceListeners.push(listener);
        }),
        removeEventListener: vi.fn(),
      })),
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    vi.spyOn(window.performance, 'now').mockImplementation(() => frameClock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      nextFrame = callback;
      frameId += 1;
      return frameId;
    });
    vi.stubGlobal('cancelAnimationFrame', cancelFrame);

    await TestBed.configureTestingModule({
      imports: [PrizeDrawDemoComponent],
      providers: [
        { provide: ScannerSoundsService, useValue: { tone } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PrizeDrawDemoComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    if (!fixtureDestroyed) {
      fixture.destroy();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete document.documentElement.dataset['storybookMotion'];
  });

  it('uses the shared reel acceleration stages and lands on the fixed winner with softened ticks', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const component = fixture.debugElement.query(By.directive(PrizeDrawReelComponent)).componentInstance as PrizeDrawReelComponent;
    (element.querySelector('button.prize-draw-demo__draw') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(component.phase()).toBe('spinning');
    expect((element.querySelector('button.prize-draw-demo__draw') as HTMLButtonElement).disabled).toBe(true);
    expect(element.querySelector('.prize-draw-demo__status')?.textContent).toContain('Sorteio em andamento.');
    drawFrame(0);
    expect(component.motionStage()).toBe('warmup');
    drawFrame(1000);
    expect(component.motionStage()).toBe('accelerating-two');
    drawFrame(2000);
    expect(component.motionStage()).toBe('readable');
    drawFrame(2800);
    expect(component.motionStage()).toBe('settling');
    drawFrame(3000);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(component.phase()).toBe('complete');
    expect(component.visibleNames().find((name) => name.center)?.name).toBe('Beatriz Lima');
    expect(fixture.componentInstance.drawState()).toBe('winner');
    expect(element.querySelector('.prize-draw-demo__status')?.textContent).toContain(
      'Resultado: Beatriz Lima ganhou Kit criatividade.',
    );
    expect((element.querySelector('button.prize-draw-demo__draw') as HTMLButtonElement).disabled).toBe(false);
    expect((element.querySelector('button.prize-draw-demo__draw') as HTMLButtonElement).textContent).toContain(
      'Sortear novamente',
    );
    expect(
      tone.mock.calls.some(
        ([, duration, volume, type]) => duration === 0.03 && Math.abs(volume - 0.144) < 0.000001 && type === 'triangle',
      ),
    ).toBe(true);
    expect(
      tone.mock.calls.some(
        ([frequency, duration, volume, type]) =>
          frequency === 620 && duration === 0.09 && Math.abs(volume - 0.162) < 0.000001 && type === undefined,
      ),
    ).toBe(true);
  });

  it('uses instant shared-reel mode for reduced motion without the reduced-motion pause', async () => {
    document.documentElement.dataset['storybookMotion'] = 'reduced';
    const element = fixture.nativeElement as HTMLElement;
    const component = fixture.debugElement.query(By.directive(PrizeDrawReelComponent)).componentInstance as PrizeDrawReelComponent;
    (element.querySelector('button.prize-draw-demo__draw') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(component.phase()).toBe('complete');
    expect(component.visibleNames().find((name) => name.center)?.name).toBe('Beatriz Lima');
    expect(fixture.componentInstance.drawState()).toBe('winner');
    expect(tone.mock.calls.some(([, duration]) => duration === 0.03)).toBe(false);
  });

  it('passes sound controls to the shared reel and honors the operating system reduced-motion preference', async () => {
    const element = fixture.nativeElement as HTMLElement;
    const reel = fixture.debugElement.query(By.directive(PrizeDrawReelComponent)).componentInstance as PrizeDrawReelComponent;
    const soundButton = element.querySelector('button.prize-draw-demo__sound') as HTMLButtonElement;

    expect(soundButton.getAttribute('aria-pressed')).toBe('false');
    expect(reel.soundEnabled()).toBe(true);
    expect(reel.soundVolume()).toBe(0.18);

    soundButton.click();
    fixture.detectChanges();
    expect(soundButton.getAttribute('aria-pressed')).toBe('true');
    expect(soundButton.getAttribute('aria-label')).toBe('Ativar sons do sorteio');
    expect(reel.soundEnabled()).toBe(false);

    prefersReducedMotion = true;
    motionPreferenceListeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    (element.querySelector('button.prize-draw-demo__draw') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(reel.phase()).toBe('complete');
    expect(reel.visibleNames().find((name) => name.center)?.name).toBe('Beatriz Lima');
    expect(element.querySelector('.prize-draw-demo__status')?.textContent).toContain('Resultado:');
    expect(tone).not.toHaveBeenCalled();
  });

  it('resets the shared reel to stop its animation when the landing panel is destroyed', () => {
    const element = fixture.nativeElement as HTMLElement;
    const component = fixture.debugElement.query(By.directive(PrizeDrawReelComponent)).componentInstance as PrizeDrawReelComponent;
    (element.querySelector('button.prize-draw-demo__draw') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.phase()).toBe('spinning');

    fixture.destroy();
    fixtureDestroyed = true;

    expect(cancelFrame).toHaveBeenCalled();
  });

  function drawFrame(timestamp: number): void {
    const callback = nextFrame;
    expect(callback).toBeDefined();
    nextFrame = undefined;
    frameClock = timestamp;
    callback?.(timestamp);
    fixture.detectChanges();
  }
});
