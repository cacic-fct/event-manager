import { DOCUMENT, Location } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { PublicPrizeDrawApiService } from './prize-draw-api.service';
import { PublicPrizeDrawPage } from './prize-draw-page';

describe('PublicPrizeDrawPage', () => {
  let api: { list: ReturnType<typeof vi.fn>; watch: ReturnType<typeof vi.fn> };
  let fixture: ComponentFixture<PublicPrizeDrawPage>;
  let location: { back: ReturnType<typeof vi.fn> };
  let updates: Subject<void>;

  afterEach(() => vi.restoreAllMocks());

  it('loads event results, exposes transparent chance labels, and refreshes after live invalidation', async () => {
    updates = new Subject<void>();
    api = {
      list: vi.fn()
        .mockReturnValueOnce(of([drawFixture()]))
        .mockReturnValueOnce(of([drawFixture({ revision: 2, title: 'Sorteio atualizado' })])),
      watch: vi.fn(() => updates),
    };
    await configure({ targetType: 'EVENT', param: 'eventId', id: 'event-1' });
    const component = fixture.componentInstance;

    expect(component.state()).toEqual({ status: 'ready', draws: [drawFixture()] });
    expect(api.list).toHaveBeenCalledWith({ targetType: 'EVENT', targetId: 'event-1' });
    expect(api.watch).toHaveBeenCalledWith({ targetType: 'EVENT', targetId: 'event-1' });
    expect(component.modeLabel(drawFixture())).toBe('Entradas ponderadas');
    expect(component.eligibilityLabel(drawFixture())).toBe('pessoas presentes, entradas manuais');
    expect(component.percentage(spinFixture())).toBe('25%');
    expect(component.chance(spinFixture())).toBe('1 em 4');
    expect(component.sourceTargetLabel(drawFixture())).toBe('Evento: Evento');
    expect(component.drawAnchorId('draw-1')).toBe('draw-draw-1');

    updates.next();
    await fixture.whenStable();
    expect(component.state()).toEqual({
      status: 'ready',
      draws: [drawFixture({ revision: 2, title: 'Sorteio atualizado' })],
    });
    expect(component.liveUpdatesUnavailable()).toBe(false);
  });

  it('keeps the last successful snapshot when a background refresh fails and flags live degradation', async () => {
    updates = new Subject<void>();
    api = {
      list: vi.fn()
        .mockReturnValueOnce(of([drawFixture()]))
        .mockReturnValueOnce(throwError(() => new Error('offline'))),
      watch: vi.fn(() => updates),
    };
    await configure({ targetType: 'MAJOR_EVENT', param: 'majorEventId', id: 'major-1' });

    updates.next();
    await fixture.whenStable();

    expect(fixture.componentInstance.state()).toEqual({ status: 'ready', draws: [drawFixture()] });
    expect(fixture.componentInstance.liveUpdatesUnavailable()).toBe(true);
  });

  it('reports initial API and live-stream failures without leaking an unusable loading state', async () => {
    updates = new Subject<void>();
    api = {
      list: vi.fn(() => throwError(() => new Error('Acesso negado'))),
      watch: vi.fn(() => updates),
    };
    await configure({ targetType: 'EVENT_GROUP', param: 'eventGroupId', id: 'group-1' });

    expect(fixture.componentInstance.state()).toEqual({ status: 'error', message: 'Acesso negado' });
    updates.error(new Error('SSE unavailable'));
    expect(fixture.componentInstance.liveUpdatesUnavailable()).toBe(true);
  });

  it('rejects missing route identifiers without API calls and supports browser back navigation', async () => {
    updates = new Subject<void>();
    api = { list: vi.fn(), watch: vi.fn(() => updates) };
    await configure({ targetType: 'EVENT', param: 'eventId', id: ' ' });

    expect(fixture.componentInstance.state()).toEqual({
      status: 'error',
      message: 'Página de sorteios inválida.',
    });
    expect(api.list).not.toHaveBeenCalled();
    expect(api.watch).not.toHaveBeenCalled();
    fixture.componentInstance.goBack();
    expect(location.back).toHaveBeenCalled();
  });

  it('scrolls to a valid deep-linked draw only once after it appears', async () => {
    updates = new Subject<void>();
    api = { list: vi.fn(() => of([drawFixture()])), watch: vi.fn(() => updates) };
    history.replaceState({}, '', '#draw-draw-1');
    const target = document.createElement('section');
    target.id = 'draw-draw-1';
    target.scrollIntoView = vi.fn();
    document.body.append(target);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 1;
    });

    await configure({ targetType: 'EVENT', param: 'eventId', id: 'event-1' });
    updates.next();
    await fixture.whenStable();

    expect(target.scrollIntoView).toHaveBeenCalledOnce();
    history.replaceState({}, '', locationPath());
    target.remove();
  });

  async function configure(input: {
    targetType: 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';
    param: string;
    id: string;
  }): Promise<void> {
    location = { back: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PublicPrizeDrawPage],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: PublicPrizeDrawApiService, useValue: api },
        { provide: Location, useValue: location },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { targetType: input.targetType },
              paramMap: { get: (name: string) => name === input.param ? input.id : null },
            },
          },
        },
        { provide: DOCUMENT, useValue: document },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PublicPrizeDrawPage);
    fixture.detectChanges();
    await fixture.whenStable();
  }
});

function drawFixture(patch: Record<string, unknown> = {}) {
  return {
    id: 'draw-1',
    title: 'Sorteio',
    description: null,
    target: { type: 'EVENT', id: 'event-1', name: 'Evento' },
    includePresent: true,
    includeSubscribers: false,
    includeManualEntries: true,
    chanceMode: 'WEIGHTED',
    removeWinnerAfterDraw: true,
    revision: 1,
    spins: [spinFixture()],
    createdAt: '2026-08-26T11:00:00.000Z',
    updatedAt: '2026-08-26T12:00:00.000Z',
    ...patch,
  } as never;
}

function spinFixture() {
  return {
    id: 'spin-1',
    sequence: 1,
    description: 'Prêmio',
    speed: 'QUICK',
    chanceMode: 'WEIGHTED',
    removeWinnerAfterDraw: true,
    winnerDisplayName: 'Ada L.',
    winnerWeight: 1,
    entrantCount: 2,
    totalWeight: 4,
    duplicateEntryCount: 2,
    weightBreakdown: [{ weight: 1, peopleCount: 1 }, { weight: 3, peopleCount: 1 }],
    drawnAt: '2026-08-26T12:00:00.000Z',
  } as never;
}

function locationPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}
