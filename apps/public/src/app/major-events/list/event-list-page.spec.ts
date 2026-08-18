import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { of } from 'rxjs';
import { AuthService } from '@cacic-fct/shared-angular';
import { AnalyticsService } from '../../analytics/analytics.service';
import { MajorEvent } from './event-list-page';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';

describe('MajorEvent', () => {
  let component: MajorEvent;
  let fixture: ComponentFixture<MajorEvent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MajorEvent],
      providers: [
        {
          provide: AnalyticsService,
          useValue: {
            trackEvent: vi.fn(),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => false,
            login: vi.fn(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: {
              paramMap: convertToParamMap({}),
            },
          },
        },
        {
          provide: MajorEventSubscriptionApiService,
          useValue: {
            listMajorEvents: vi.fn(() => of([])),
            listCurrentUserSubscriptions: vi.fn(() => of([])),
            getPreviewMajorEvents: vi.fn(() => of({ events: [], expiresAt: new Date().toISOString() })),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MajorEvent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('routes tournament-only major events to the tournament subscription', () => {
    const majorEvent = createPublicMajorEvent({
      hasEvents: false,
      sportsTournament: { id: 'tournament-1', selfSubscriptionEnabled: true, registrationOpen: true },
    });

    expect(component.subscriptionRouteFor(majorEvent)).toEqual(['/tournament', 'tournament-1', 'subscribe']);
  });

  it('does not expose a subscription route when a major event has neither events nor a self-subscribable tournament', () => {
    const majorEvent = createPublicMajorEvent({
      hasEvents: false,
      sportsTournament: { id: 'tournament-1', selfSubscriptionEnabled: false, registrationOpen: true },
    });

    expect(component.subscriptionRouteFor(majorEvent)).toBeNull();
  });

  it('keeps regular major-event subscription routing when child events exist', () => {
    const majorEvent = createPublicMajorEvent({
      id: 'major-event-1',
      hasEvents: true,
      rankedSubscriptionEnabled: true,
    });

    expect(component.subscriptionRouteFor(majorEvent)).toEqual([
      '/major-event',
      'major-event-1',
      'ranked-subscription',
    ]);
  });

  it('labels regular and tournament subscriptions independently for mixed major events', () => {
    const majorEvent = createPublicMajorEvent({
      hasEvents: true,
      sportsTournament: { id: 'tournament-1', selfSubscriptionEnabled: true, registrationOpen: true },
    });

    expect(component.subscriptionActionLabel(majorEvent, 'create')).toBe('Inscrever-se nas atividades');
    expect(component.subscriptionActionLabel(majorEvent, 'edit')).toBe('Editar inscrição nas atividades');
    expect(
      component.canEditSubscription(majorEvent, {
        subscriptionStatus: 'CONFIRMED',
        selectedEvents: [],
      } as never),
    ).toBe(true);
    expect(
      component.canEditSubscription(majorEvent, {
        subscriptionStatus: 'CONFIRMED',
        selectedEvents: [{ id: 'event-1' }],
      } as never),
    ).toBe(false);
  });
});
