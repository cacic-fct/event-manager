import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { Subject, of, throwError } from 'rxjs';
import { DashboardApiService } from '../graphql/dashboard-api.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import {
  adminFixtureDate,
  adminFixtureDateFromNow,
  createAdminAuthenticatedUser,
  createAdminDashboardCalendarEvent,
  createAdminDashboardInconsistency,
  createAdminWorkspaceDashboardInsights,
} from '../testing/admin-entity-fixtures';
import { Home } from './home';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let dashboardApi: {
    getWorkspaceDashboardInsights: ReturnType<typeof vi.fn>;
  };
  let workspaceEvents: Subject<void>;
  const user = signal(createAdminAuthenticatedUser());

  beforeEach(async () => {
    dashboardApi = {
      getWorkspaceDashboardInsights: vi.fn(() => of(createAdminWorkspaceDashboardInsights())),
    };
    workspaceEvents = new Subject<void>();
    user.set(createAdminAuthenticatedUser());

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: DashboardApiService, useValue: dashboardApi },
        { provide: RealtimeApiService, useValue: { watchWorkspace: vi.fn(() => workspaceEvents) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(Home);
    component = fixture.componentInstance;
    component.currentDate.set(new Date(adminFixtureDate));
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('creates action links for dashboard targets', () => {
    expect(component).toBeTruthy();
    expect(
      component.routerLinkForAction({
        action: 'OPEN_ATTENDANCE',
        label: 'Revisar presença',
        targetId: 'event-1',
      }),
    ).toEqual(['attendances', 'event', 'event-1']);
    expect(
      component.routerLinkForAction({
        action: 'OPEN_CERTIFICATES',
        label: 'Emitir certificados',
        targetId: 'event-1',
      }),
    ).toEqual(['certificates', 'event-1']);
    expect(
      component.routerLinkForInconsistency(
        createAdminDashboardInconsistency({
          action: 'OPEN_PUBLICATION',
          targetId: 'event-1',
        }),
      ),
    ).toEqual(['publication']);
    expect(
      component.routerLinkForInconsistency(
        createAdminDashboardInconsistency({
          action: 'OPEN_EVENT',
          targetId: 'event-1',
        }),
      ),
    ).toEqual(['events', 'event-1']);
    expect(
      component.routerLinkForAction({
        action: 'OPEN_SPORTS',
        label: 'Gerenciar esportes',
      }),
    ).toEqual(['sports']);
    expect(
      component.routerLinkForInconsistency(
        createAdminDashboardInconsistency({
          action: 'OPEN_SPORTS',
          targetId: 'tournament-1',
        }),
      ),
    ).toEqual(['sports', 'tournament-1']);
  });

  it('derives today, queue, and system-health state from dashboard insights', () => {
    component.insights.set(
      createAdminWorkspaceDashboardInsights({
        calendarEvents: [
          createAdminDashboardCalendarEvent(),
          createAdminDashboardCalendarEvent({
            id: 'event-2',
            name: 'Palestra de encerramento',
            startDate: adminFixtureDateFromNow(1, 17),
            canCollectAttendanceNow: false,
          }),
          createAdminDashboardCalendarEvent({
            id: 'event-3',
            name: 'Fora da próxima semana',
            startDate: adminFixtureDateFromNow(8, 17),
            endDate: adminFixtureDateFromNow(8, 18),
            canCollectAttendanceNow: false,
          }),
        ],
      }),
    );

    expect(component.greetings()).toContain('Admin Teste');
    expect(component.todayEvents().map((event) => event.id)).toEqual(['event-1']);
    expect(component.upcomingEvents().map((event) => event.id)).toEqual(['event-2']);
    expect(component.eventDayHeadline()).toBe('1 evento acontece hoje.');
    expect(component.eventDayActionSummary()).toBe('1 atividade precisa de atenção agora.');
    expect(component.calendarHeadline()).toBe('3 eventos no radar dos próximos dias.');
    expect(component.upcomingEventsHeadline()).toBe('1 evento acontece entre amanhã e os próximos 7 dias.');
    expect(component.eventSubscriptionSummary(component.upcomingEvents()[0])).toBe('40 de 60 vagas preenchidas');
    expect(
      component.eventSubscriptionSummary(
        createAdminDashboardCalendarEvent({
          allowSubscription: true,
          subscriptionsCount: 12,
          slots: null,
        }),
      ),
    ).toBe('12 inscrições');
    expect(component.hasActionQueue()).toBe(true);
    expect(component.hasSports()).toBe(true);
    expect(component.hasSystemHealth()).toBe(true);
  });

  it('updates the greeting when the component clock crosses an hour boundary', () => {
    component.currentDate.set(new Date('2026-05-22T08:59:00-03:00'));

    expect(component.greetings()).toBe('Bom dia, Admin Teste!');

    component.currentDate.set(new Date('2026-05-22T12:00:00-03:00'));

    expect(component.greetings()).toBe('Boa tarde, Admin Teste!');
  });

  it('renders loaded dashboard queues and creation shortcuts', async () => {
    dashboardApi.getWorkspaceDashboardInsights.mockReturnValueOnce(
      of(
        createAdminWorkspaceDashboardInsights({
          calendarEvents: [
            createAdminDashboardCalendarEvent(),
            createAdminDashboardCalendarEvent({
              id: 'event-2',
              name: 'Palestra de encerramento',
              startDate: adminFixtureDateFromNow(1, 17),
              endDate: adminFixtureDateFromNow(1, 18),
              subscriptionsCount: 42,
              slots: 50,
              canCollectAttendanceNow: false,
            }),
          ],
          weatherAlerts: [
            {
              eventId: 'event-1',
              eventName: 'Credenciamento',
              summary: 'Calor intenso',
              materialIcon: 'thermostat',
              forecastTime: adminFixtureDateFromNow(0, 15),
              temperature: 31,
            },
            {
              eventId: 'event-2',
              eventName: 'Palestra de encerramento',
              summary: 'Chuva moderada',
              materialIcon: 'rainy',
              forecastTime: adminFixtureDateFromNow(1, 18),
              temperature: 22,
            },
          ],
        }),
      ),
    );

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;

    expect(dashboardApi.getWorkspaceDashboardInsights).toHaveBeenCalledTimes(1);
    expect(text).toContain('Novo grupo de eventos');
    expect(text).toContain('Novo evento');
    expect(text).toContain('Gerenciar esportes');
    expect(text).toContain('Hoje');
    expect(text).toContain('Próximos 7 dias');
    expect(text).toContain('42 de 50 vagas preenchidas');
    expect(text).toContain('Calor intenso');
    expect(text).toContain('31°C');
    expect(text).toContain('Chuva moderada');
    expect(text).toContain('22°C');
    expect(text).not.toContain('Clima');
    expect(text).not.toContain('qui.,');
    expect(text).not.toContain('sex.,');
    expect(text).not.toContain('40 de 60 vagas preenchidas');
    expect(fixture.nativeElement.querySelectorAll('.weather-line')).toHaveLength(2);
    expect(text).toContain('Presenças off-line pendentes');
    expect(text).toContain('Comprovantes pendentes');
    expect(text).toContain('Inconsistências críticas');
    expect(text).toContain('Certificados pendentes');
    expect(text).toContain('Pessoas duplicadas');
    expect(text).toContain('Revisões esportivas pendentes');
    expect(text).toContain('Partidas em operação');
    expect(text).toContain('Jogos Universitários');
  });

  it('renders the backend dashboard error state', async () => {
    dashboardApi.getWorkspaceDashboardInsights.mockReturnValueOnce(throwError(() => new Error('Falha no painel.')));

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('Não foi possível carregar o painel');
    expect(text).toContain('Falha no painel.');
  });

  it('refreshes from live invalidations and preserves the last dashboard when a background request fails', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const initialInsights = component.insights();
    dashboardApi.getWorkspaceDashboardInsights.mockReturnValueOnce(
      throwError(() => new Error('Falha temporária.')),
    );

    workspaceEvents.next();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dashboardApi.getWorkspaceDashboardInsights).toHaveBeenCalledTimes(2);
    expect(component.insights()).toBe(initialInsights);
    expect(component.error()).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Não foi possível carregar o painel');
  });
});
