import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import * as echarts from 'echarts';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { AttendanceApiService } from '../../graphql/attendance-api.service';
import { PermissionsService } from '../../permissions/permissions.service';
import { AttendanceStatisticsPageComponent, timeWindowFromBrushEvent } from './attendance-statistics-page.component';
import { createAttendanceStatisticsSnapshot } from './attendance-statistics-story.fixtures';

describe('attendance statistics chart time selection', () => {
  it('turns the two brush pivots into inclusive minute boundaries', () => {
    expect(
      timeWindowFromBrushEvent({
        areas: [{ coordRange: [Date.parse('2026-08-16T13:47:42.500Z'), Date.parse('2026-08-16T12:03:18.000Z')] }],
      }),
    ).toEqual({
      start: '2026-08-16T12:03:00.000Z',
      end: '2026-08-16T13:47:59.999Z',
    });
  });

  it('keeps a same-minute drag as a valid one-minute interval', () => {
    expect(
      timeWindowFromBrushEvent({
        areas: [{ coordRange: [Date.parse('2026-08-16T12:03:10.000Z'), Date.parse('2026-08-16T12:03:12.000Z')] }],
      }),
    ).toEqual({
      start: '2026-08-16T12:03:00.000Z',
      end: '2026-08-16T12:03:59.999Z',
    });
  });

  it.each([null, {}, { areas: [] }, { areas: [{ coordRange: ['invalid', 123] }] }])(
    'ignores an incomplete brush payload %#',
    (event) => {
      expect(timeWindowFromBrushEvent(event)).toBeNull();
    },
  );
});

describe('AttendanceStatisticsPageComponent flow', () => {
  const snapshot = createAttendanceStatisticsSnapshot({
    collectorCount: 2,
    eventName: 'Semana da Computação',
    historyMinutes: 90,
    noShowCount: 7,
    pendingOfflineCount: 3,
    presentCount: 84,
    reviewCount: 2,
  });
  const stream = new BehaviorSubject(snapshot);
  const api = {
    watchEventAttendanceAnalytics: vi.fn(() => stream.asObservable()),
    getEventAttendanceAnalytics: vi.fn(() => of(snapshot)),
    reviewAttendanceFlag: vi.fn(() => of(true)),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // SVG chart tests use ECharts' fallback text metrics; jsdom has no canvas context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'server' },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ eventId: snapshot.eventId }) } },
        },
        { provide: AttendanceApiService, useValue: api },
        { provide: PermissionsService, useValue: { has: vi.fn(() => true) } },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders the live operational summary, collectors, and review queue', () => {
    const fixture = TestBed.createComponent(AttendanceStatisticsPageComponent);
    fixture.detectChanges();

    expect(api.watchEventAttendanceAnalytics).toHaveBeenCalledWith(snapshot.eventId, null);
    expect(fixture.nativeElement.textContent).toContain('Semana da Computação');
    expect(fixture.nativeElement.textContent).toContain('84');
    expect(fixture.nativeElement.textContent).toContain('Revisão humana');
    expect(fixture.nativeElement.textContent).toContain(
      'Marcar um aviso como revisado o remove desta fila sem alterar os registros de presença',
    );
    expect(fixture.nativeElement.textContent).toContain('Marcar aviso como revisado');
    expect(fixture.nativeElement.textContent).not.toContain('Descartar sinal');
    expect(fixture.nativeElement.textContent).toContain(snapshot.collectors[0]?.name);
  });

  it('applies a chart drag and resets the live filter when non-empty HTML is forbidden', () => {
    const fixture = TestBed.createComponent(AttendanceStatisticsPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = document.createElement('div');
    document.body.appendChild(element);
    const chart = echarts.init(element, undefined, { renderer: 'svg', width: 800, height: 300 });
    chart.setOption({ ...component['throughputOption'](), animation: false });
    component['configureThroughputSelection'](chart);
    const htmlSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')?.set;
    const htmlSpy = vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (
      this: Element,
      value: string,
    ) {
      if (value !== '') throw new Error('Only empty HTML is approved by the Trusted Types policy.');
      htmlSetter?.call(this, value);
    });

    try {
      for (const [type, x] of [['mousedown', 200], ['mousemove', 400], ['mouseup', 400]] as const) {
        chart.getZr().handler.dispatch(type, Object.assign(new MouseEvent(type), { zrX: x, zrY: 100 }));
      }
      expect(component.selectedTimeWindow()).toEqual({ start: expect.any(String), end: expect.any(String) });
      fixture.detectChanges();
      expect(api.watchEventAttendanceAnalytics).toHaveBeenLastCalledWith(
        snapshot.eventId,
        component.selectedTimeWindow(),
      );
      expect(fixture.nativeElement.textContent).toContain('Mostrar tudo');

      component.resetTimeWindow();
      fixture.detectChanges();
      expect(api.watchEventAttendanceAnalytics).toHaveBeenLastCalledWith(snapshot.eventId, null);
      expect(component.selectedWindowLabel()).toBe('Todo o período');
    } finally {
      htmlSpy.mockRestore();
      chart.dispose();
      element.remove();
    }
  });

  it.each(['hoursOption', 'collectorsOption', 'methodsOption'] as const)(
    'renders %s tooltips without assigning non-empty HTML',
    (option) => {
      const component = TestBed.createComponent(AttendanceStatisticsPageComponent).componentInstance;
      component.snapshot.set(snapshot);
      const element = document.createElement('div');
      document.body.appendChild(element);
      const chart = echarts.init(element, undefined, { renderer: 'svg', width: 800, height: 300 });
      chart.setOption({ ...component[option](), animation: false });
      const htmlSetter = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')?.set;
      const htmlSpy = vi.spyOn(Element.prototype, 'innerHTML', 'set').mockImplementation(function (
        this: Element,
        value: string,
      ) {
        if (value !== '') throw new Error('Only empty HTML is approved by the Trusted Types policy.');
        htmlSetter?.call(this, value);
      });

      try {
        expect(() => chart.dispatchAction({ type: 'showTip', seriesIndex: 0, dataIndex: 0 })).not.toThrow();
        expect(htmlSpy.mock.calls.every(([value]) => value === '')).toBe(true);
      } finally {
        htmlSpy.mockRestore();
        chart.dispose();
        element.remove();
      }
    },
  );

  it('marks a signal as reviewed, refreshes the snapshot, and releases the busy state', async () => {
    const component = TestBed.createComponent(AttendanceStatisticsPageComponent).componentInstance;
    const item = snapshot.reviewItems[0];
    if (!item) throw new Error('The shared fixture must contain a review item.');

    await component.review(item, 'DISMISSED');

    expect(api.reviewAttendanceFlag).toHaveBeenCalledWith(item.id, snapshot.eventId, 'DISMISSED');
    expect(api.getEventAttendanceAnalytics).toHaveBeenCalledWith(snapshot.eventId, null);
    expect(component.reviewingFlagId()).toBeNull();
    expect(component.actionError()).toBeNull();
  });

  it('offers one review action per pending signal and submits the neutral reviewed status', async () => {
    const fixture = TestBed.createComponent(AttendanceStatisticsPageComponent);
    fixture.detectChanges();
    const item = snapshot.reviewItems[0];
    if (!item) throw new Error('The shared fixture must contain a review item.');
    const element = fixture.nativeElement as HTMLElement;
    const reviewButtons = Array.from(element.querySelectorAll('button')).filter((button) =>
      button.textContent?.includes('Marcar aviso como revisado'),
    );

    expect(reviewButtons).toHaveLength(snapshot.reviewItems.length);
    reviewButtons[0]?.click();
    await fixture.whenStable();

    expect(api.reviewAttendanceFlag).toHaveBeenCalledWith(item.id, snapshot.eventId, 'DISMISSED');
  });

  it('keeps the current analytics visible and exposes an actionable reload error', async () => {
    api.getEventAttendanceAnalytics.mockReturnValueOnce(throwError(() => new Error('Rede indisponível')));
    const component = TestBed.createComponent(AttendanceStatisticsPageComponent).componentInstance;
    component.snapshot.set(snapshot);

    await component.reload();

    expect(component.snapshot()).toEqual(snapshot);
    expect(component.connectionError()).toBe('Rede indisponível');
    expect(component.loading()).toBe(false);
  });

  it('recovers the initial analytics snapshot through HTTP and reopens live updates when SSE closes', async () => {
    api.watchEventAttendanceAnalytics
      .mockReturnValueOnce(throwError(() => new Error('Fluxo em tempo real indisponível')))
      .mockReturnValue(stream.asObservable());

    const fixture = TestBed.createComponent(AttendanceStatisticsPageComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(api.getEventAttendanceAnalytics).toHaveBeenCalledWith(snapshot.eventId, null);
    expect(api.watchEventAttendanceAnalytics).toHaveBeenCalledTimes(2);
    expect(fixture.componentInstance.snapshot()).toEqual(snapshot);
    expect(fixture.componentInstance.connectionError()).toBeNull();
  });

  it('does not mutate review state when the item delegates to a dedicated deep link', async () => {
    const component = TestBed.createComponent(AttendanceStatisticsPageComponent).componentInstance;
    const fixtureItem = snapshot.reviewItems[0];
    if (!fixtureItem) throw new Error('The shared fixture must contain a review item.');
    const item = { ...fixtureItem, deepLink: '/attendances/event/review/flag' };

    await component.review(item, 'DISMISSED');

    expect(api.reviewAttendanceFlag).not.toHaveBeenCalled();
    expect(component.reviewingFlagId()).toBeNull();
  });
});
