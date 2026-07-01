import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { of, throwError } from 'rxjs';
import { DashboardApiService } from '../../graphql/dashboard-api.service';
import {
  adminFixtureDate,
  createAdminAuthenticatedUser,
  createAdminDashboardCalendarEvent,
  createAdminDashboardInconsistency,
  createAdminWorkspaceDashboardInsights,
} from '../../testing/admin-entity-fixtures';
import { Home } from './home';

describe('Home', () => {
  let component: Home;
  let fixture: ComponentFixture<Home>;
  let dashboardApi: {
    getWorkspaceDashboardInsights: ReturnType<typeof vi.fn>;
  };
  const user = signal(createAdminAuthenticatedUser());

  beforeEach(async () => {
    dashboardApi = {
      getWorkspaceDashboardInsights: vi.fn(() => of(createAdminWorkspaceDashboardInsights())),
    };
    user.set(createAdminAuthenticatedUser());

    await TestBed.configureTestingModule({
      imports: [Home],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
        { provide: DashboardApiService, useValue: dashboardApi },
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
  });

  it('derives today, queue, and system-health state from dashboard insights', () => {
    component.insights.set(
      createAdminWorkspaceDashboardInsights({
        calendarEvents: [
          createAdminDashboardCalendarEvent(),
          createAdminDashboardCalendarEvent({
            id: 'event-2',
            name: 'Palestra de encerramento',
            startDate: '2026-05-22T17:00:00.000Z',
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
    expect(component.calendarHeadline()).toBe('2 eventos acontecerão esta semana.');
    expect(component.hasActionQueue()).toBe(true);
    expect(component.hasSystemHealth()).toBe(true);
  });

  it('updates the greeting when the component clock crosses an hour boundary', () => {
    component.currentDate.set(new Date('2026-05-22T08:59:00-03:00'));

    expect(component.greetings()).toBe('Bom dia, Admin Teste!');

    component.currentDate.set(new Date('2026-05-22T12:00:00-03:00'));

    expect(component.greetings()).toBe('Boa tarde, Admin Teste!');
  });

  it('renders loaded dashboard queues and creation shortcuts', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;

    expect(dashboardApi.getWorkspaceDashboardInsights).toHaveBeenCalledTimes(1);
    expect(text).toContain('Novo grupo de eventos');
    expect(text).toContain('Novo evento');
    expect(text).toContain('Hoje');
    expect(text).toContain('Presenças off-line pendentes');
    expect(text).toContain('Comprovantes pendentes');
    expect(text).toContain('Inconsistências críticas');
    expect(text).toContain('Certificados pendentes');
    expect(text).toContain('Pessoas duplicadas');
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
});
