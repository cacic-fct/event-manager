import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MatchOperationsDemoComponent } from './match-operations-demo';
import { SportsDemoComponent } from './sports-demo';

describe('SportsDemoComponent', () => {
  let fixture: ComponentFixture<SportsDemoComponent>;

  beforeEach(async () => {
    document.documentElement.dataset['storybookMotion'] = 'reduced';
    await TestBed.configureTestingModule({ imports: [SportsDemoComponent] }).compileComponents();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(SportsDemoComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    delete document.documentElement.dataset['storybookMotion'];
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('separates the visible score from its screen-reader text and places the clock below the status', () => {
    const element = fixture.nativeElement as HTMLElement;
    const score = element.querySelector('.score-line strong');
    expect(score?.querySelector('[aria-hidden="true"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('2 : 1');
    expect(score?.querySelector('.sr-only')?.textContent).toBe('2 a 1');
    expect(element.querySelector('.match-status + [role="timer"]')?.textContent?.trim()).toBe('12:34');
  });

  it('runs before opening operations and keeps pause, score, finish and restart in sync across views', async () => {
    const monotonicTime = vi.spyOn(window.performance, 'now');
    const start = window.performance.now();
    monotonicTime.mockReturnValue(start + 2000);
    await vi.advanceTimersByTimeAsync(250);
    fixture.detectChanges();
    expect(fixture.componentInstance.elapsedLabel()).toBe('12:36');

    const operations = fixture.debugElement.query(By.directive(MatchOperationsDemoComponent))
      .componentInstance as MatchOperationsDemoComponent;
    fixture.componentInstance.selectSportsView('operations');
    operations.toggleClock();
    operations.adjustScore('home', 1);
    fixture.detectChanges();
    fixture.componentInstance.selectSportsView('match');
    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();

    expect(fixture.componentInstance.elapsedLabel()).toBe('12:36');
    expect(fixture.componentInstance.matchStatus()).toBe('Partida pausada');
    expect((fixture.nativeElement as HTMLElement).querySelector('.score-line .sr-only')?.textContent).toBe('3 a 1');

    operations.finishMatch();
    fixture.detectChanges();
    expect(fixture.componentInstance.matchStatus()).toBe('Partida encerrada');
    operations.restartMatch();
    fixture.detectChanges();
    expect(fixture.componentInstance.elapsedLabel()).toBe('12:34');
    expect(fixture.componentInstance.matchStatus()).toBe('Partida em andamento');
  });
});
