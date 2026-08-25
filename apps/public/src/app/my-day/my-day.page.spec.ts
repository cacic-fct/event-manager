import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMyDay } from '@cacic-fct/event-manager-public-contracts';
import { MyDayPage } from './my-day.page';
import { MyDayLoadState, MyDayStore } from './my-day.store';

registerLocaleData(localePt);

describe('MyDayPage', () => {
  let fixture: ComponentFixture<MyDayPage>;
  let state: ReturnType<typeof signal<MyDayLoadState>>;
  let cooldownSeconds: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T18:18:00-03:00'));
    const data = myDayFixture();
    state = signal<MyDayLoadState>({ status: 'ready', data, offline: false });
    const selectedDate = signal(data.selectedDate);
    cooldownSeconds = signal(0);

    await TestBed.configureTestingModule({
      imports: [MyDayPage],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: signal({ sub: 'user-1', claims: { name: 'Renan Yudi' } }),
          },
        },
        {
          provide: MyDayStore,
          useValue: {
            state,
            data: () => state().data,
            selectedDate,
            cooldownSeconds,
            start: vi.fn(),
            load: vi.fn().mockResolvedValue(undefined),
            refresh: vi.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MyDayPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('renders the approved now, next, attention, weather, and later hierarchy', () => {
    const text = fixture.nativeElement.textContent;

    expect(text).toContain('Boa noite, Renan!');
    expect(text).toContain('Agora');
    expect(text).toContain('Credenciamento');
    expect(text).toContain('Próximo compromisso');
    expect(text).toContain('Palestra sobre IA');
    expect(text).toContain('em 42 min');
    expect(text).toContain('Atenção');
    expect(text).toContain('Envie seu comprovante');
    expect(text).toContain('Pode chover');
    expect(text).toContain('Depois');
    expect(text).toContain('Basquete');
  });

  it('keeps relative times current on each minute boundary', () => {
    expect(fixture.nativeElement.textContent).toContain('em 42 min');

    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('em 41 min');
  });

  it('hides online-only pending actions while offline', () => {
    state.set({ status: 'ready', data: myDayFixture(), offline: true });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Envie seu comprovante');
    expect(fixture.nativeElement.textContent).toContain('Dados salvos');
  });

  it('preserves smart-link query parameters', () => {
    const mapLink = fixture.nativeElement.querySelector('a[aria-label="Ver no mapa"]') as HTMLAnchorElement;

    expect(mapLink.getAttribute('href')).toBe('/map?evento=current');
  });

  it('only expands the date selector outside its title', () => {
    const panel = fixture.nativeElement.querySelector('.date-panel') as HTMLElement;
    const title = panel.querySelector('mat-panel-title') as HTMLElement;
    const toggle = panel.querySelector('.expand-icon') as HTMLElement;

    title.click();
    fixture.detectChanges();
    expect(panel.classList).not.toContain('mat-expanded');

    toggle.click();
    fixture.detectChanges();
    expect(panel.classList).toContain('mat-expanded');
  });

  it('explains that cached days remain available during a request cooldown', () => {
    cooldownSeconds.set(12);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Você pode continuar vendo os dias salvos');
    expect(fixture.nativeElement.textContent).toContain('12 s');
  });
});

function myDayFixture(): CurrentUserMyDay {
  const event = (id: string, name: string, startDate: string, endDate: string) => ({
    id,
    name,
    emoji: '📅',
    startDate,
    endDate,
    locationDescription: 'Auditório 1',
    roles: [],
    attendanceAction: null,
    sportsActions: [],
    infoAction: {
      kind: 'EVENT_INFO' as const,
      label: 'Informações',
      materialIcon: 'info',
      route: `/event/${id}`,
      offlineCapable: true,
    },
    mapAction: {
      kind: 'MAP' as const,
      label: 'Ver no mapa',
      materialIcon: 'location_on',
      route: `/map?evento=${id}`,
      offlineCapable: true,
    },
  });
  return {
    generatedAt: new Date().toISOString(),
    selectedDate: '2026-08-16',
    minimumDate: '2026-07-16',
    hasContent: true,
    currentEvent: event('current', 'Credenciamento', '2026-08-16T18:00:00-03:00', '2026-08-16T18:30:00-03:00'),
    nextEvent: event('next', 'Palestra sobre IA', '2026-08-16T19:00:00-03:00', '2026-08-16T20:00:00-03:00'),
    laterEvents: [event('later', 'Basquete', '2026-08-16T21:00:00-03:00', '2026-08-16T22:00:00-03:00')],
    attention: [
      {
        id: 'payment:1',
        kind: 'PAYMENT',
        title: 'Envie seu comprovante',
        description: 'Sua inscrição aguarda o comprovante.',
        materialIcon: 'receipt_long',
        route: '/major-event/1/payment',
        priority: 10,
        offlineCapable: false,
      },
    ],
    weather: [
      {
        id: 'weather:rain',
        kind: 'RAIN',
        title: 'Pode chover',
        advice: 'Leve um guarda-chuva.',
        materialIcon: 'rainy',
        eventId: 'next',
        eventName: 'Palestra sobre IA',
        forecastTime: '2026-08-16T19:00:00-03:00',
        temperature: 22,
        route: '/event/next',
      },
    ],
  };
}
