import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrizeDrawSpinResult } from '@cacic-fct/event-manager-admin-contracts';
import { vi } from 'vitest';
import { PrizeDrawReelComponent } from './prize-draw-reel.component';

describe('PrizeDrawReelComponent', () => {
  let fixture: ComponentFixture<PrizeDrawReelComponent>;
  let component: PrizeDrawReelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PrizeDrawReelComponent] }).compileComponents();
    fixture = TestBed.createComponent(PrizeDrawReelComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.useRealTimers());

  it('keeps instant mode immediate and lands on the backend-selected index', async () => {
    await component.play(result({ speed: 'INSTANT', reelDurationMs: 0, preRevealPauseMs: 0 }), false);
    fixture.detectChanges();
    expect(component.phase()).toBe('complete');
    expect(component.visibleNames().find((name) => name.center)?.name).toBe('Carla C.');
  });

  it('uses a short non-animated presentation when reduced motion is active', async () => {
    vi.useFakeTimers();
    const play = component.play(result({ speed: 'DRAMATIC', countdownMs: 5000, reelDurationMs: 700, preRevealPauseMs: 150 }), true);
    expect(component.phase()).toBe('countdown');
    expect(component.countdown()).toBe(5);
    await vi.advanceTimersByTimeAsync(5080);
    expect(component.phase()).toBe('reduced');
    await vi.advanceTimersByTimeAsync(850);
    await play;
    expect(component.phase()).toBe('complete');
    expect(component.countdown()).toBeNull();
  });

  it('preserves an active dramatic countdown when reduced motion changes at runtime', async () => {
    vi.useFakeTimers();
    const play = component.play(result({ speed: 'DRAMATIC', countdownMs: 5000, reelDurationMs: 5000 }), false);
    expect(component.phase()).toBe('countdown');
    component.requestReducedMotion();
    await vi.advanceTimersByTimeAsync(4000);
    expect(component.phase()).toBe('countdown');
    expect(component.countdown()).toBe(1);
    await vi.advanceTimersByTimeAsync(1930);
    await play;
    expect(component.phase()).toBe('complete');
    expect(component.countdown()).toBeNull();
  });

  it('conceals the winner during countdown, lands on it, then delays result styling', async () => {
    vi.useFakeTimers();
    const play = component.play(
      result({ speed: 'DRAMATIC', countdownMs: 3000, reelDurationMs: 0, preRevealPauseMs: 500 }),
      false,
    );

    expect(component.phase()).toBe('countdown');
    expect(component.visibleNames().some((name) => name.name === 'Carla C.')).toBe(false);

    await vi.advanceTimersByTimeAsync(3000);
    expect(component.phase()).toBe('idle');
    expect(component.countdown()).toBeNull();

    await vi.advanceTimersByTimeAsync(80);
    expect(component.phase()).toBe('stopped');
    expect(component.visibleNames().find((name) => name.center)?.name).toBe('Carla C.');
    expect(component.statusText()).toBe('');

    await vi.advanceTimersByTimeAsync(500);
    await play;
    expect(component.phase()).toBe('complete');
    expect(component.visibleNames().find((name) => name.center)?.name).toBe('Carla C.');
  });

  it('resets to a disabled empty state without stale names', () => {
    component.reset([]);
    expect(component.visibleNames()).toEqual([]);
    expect(component.statusText()).toBe('Nenhuma pessoa elegível');
  });
});

function result(overrides: Partial<PrizeDrawSpinResult> = {}): PrizeDrawSpinResult {
  return {
    demo: false,
    drawId: 'draw-1',
    spinId: 'spin-1',
    sequence: 1,
    drawTitle: 'Kit de boas-vindas',
    spinDescription: 'Primeiro prêmio',
    winnerFullName: 'Carla Costa',
    winnerReelName: 'Carla C.',
    winnerReelIndex: 2,
    reelNames: ['Ana A.', 'Bruno B.', 'Carla C.', 'Diego D.'],
    speed: 'QUICK',
    countdownMs: 0,
    reelDurationMs: 2000,
    preRevealPauseMs: 150,
    hasMoreSpins: true,
    ...overrides,
  };
}
