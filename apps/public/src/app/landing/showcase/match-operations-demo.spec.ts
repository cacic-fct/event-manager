import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatchOperationsDemoComponent } from './match-operations-demo';

describe('MatchOperationsDemoComponent', () => {
  let fixture: ComponentFixture<MatchOperationsDemoComponent>;
  let fixtureDestroyed: boolean;

  beforeEach(async () => {
    fixtureDestroyed = false;
    await TestBed.configureTestingModule({ imports: [MatchOperationsDemoComponent] }).compileComponents();

    fixture = TestBed.createComponent(MatchOperationsDemoComponent);
    fixture.componentRef.setInput('state', 'PAUSED');
    fixture.detectChanges();
  });

  afterEach(() => {
    if (!fixtureDestroyed) {
      fixture.destroy();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clamps scores at zero, blocks edits after finalization, and resets the shared state', () => {
    const component = fixture.componentInstance;
    for (let index = 0; index < 3; index += 1) component.adjustScore('home', -1);
    expect(component.score().home).toBe(0);

    component.finishMatch();
    component.adjustScore('away', 1);
    expect(component.state()).toBe('ENDED');
    expect(component.score().away).toBe(1);

    component.restartMatch();
    expect(component.score()).toEqual({ home: 2, away: 1 });
    expect(component.state()).toBe('LIVE');
    expect(component.elapsedLabel()).toBe('12:34');
  });

  it('starts only on request, pauses without losing elapsed time, and resumes accurately', async () => {
    vi.useFakeTimers();
    const interval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');
    const monotonicTime = vi.spyOn(window.performance, 'now').mockReturnValue(0);
    const component = fixture.componentInstance;
    expect(component.state()).toBe('PAUSED');
    expect(component.elapsedLabel()).toBe('12:34');
    expect(vi.getTimerCount()).toBe(0);

    component.toggleClock();
    monotonicTime.mockReturnValue(1400);
    await vi.advanceTimersByTimeAsync(250);
    expect(component.state()).toBe('LIVE');
    expect(component.elapsedLabel()).toBe('12:35');

    component.toggleClock();
    const pausedLabel = component.elapsedLabel();
    await vi.advanceTimersByTimeAsync(2500);
    expect(component.elapsedLabel()).toBe(pausedLabel);
    expect(vi.getTimerCount()).toBe(0);

    component.toggleClock();
    monotonicTime.mockReturnValue(2400);
    await vi.advanceTimersByTimeAsync(250);
    expect(component.elapsedLabel()).toBe('12:36');
    component.finishMatch();
    expect(component.state()).toBe('ENDED');
    expect(clearInterval).toHaveBeenCalledWith(interval.mock.results.at(-1)?.value);
  });

  it('clears the running clock interval when the component is destroyed', () => {
    vi.useFakeTimers();
    vi.spyOn(window.performance, 'now').mockReturnValue(0);
    const interval = vi.spyOn(window, 'setInterval');
    const clearInterval = vi.spyOn(window, 'clearInterval');
    fixture.componentInstance.toggleClock();
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 250);
    const clockTimer = interval.mock.results.at(-1)?.value;

    fixture.destroy();
    fixtureDestroyed = true;

    expect(clearInterval).toHaveBeenCalledWith(clockTimer);
  });

  it('starts resumed by default', () => {
    vi.useFakeTimers();
    const runningFixture = TestBed.createComponent(MatchOperationsDemoComponent);
    runningFixture.detectChanges();

    expect(runningFixture.componentInstance.state()).toBe('LIVE');
    expect(vi.getTimerCount()).toBe(1);
    runningFixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
