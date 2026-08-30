import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { createPublicMajorEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { AuthService } from '@cacic-fct/shared-angular';
import { AnalyticsService } from '../../analytics/analytics.service';
import { MajorEvent } from './event-list-page';
import { MajorEventSubscriptionApiService } from '../registration/subscription-api.service';
import { PublicPrizeDrawApiService } from '../../prize-draws/prize-draw-api.service';

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
            getPreviewMajorEvents: vi.fn(() => of({ events: [], expiresAt: publicFixtureDateFromNow(1) })),
          },
        },
        {
          provide: PublicPrizeDrawApiService,
          useValue: { availability: vi.fn(() => of([])), watch: vi.fn(() => NEVER) },
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

  it('updates major-event prize-draw links live, coalesces bursts, and preserves them on refresh failure', async () => {
    TestBed.resetTestingModule();
    const updates = new Subject<void>();
    const majorEvent = createPublicMajorEvent({ id: 'major-live', name: 'Grande evento ao vivo' });
    const availability = vi
      .fn()
      .mockReturnValueOnce(of([]))
      .mockReturnValueOnce(
        of([{ targetType: 'MAJOR_EVENT', targetId: 'major-live', drawCount: 1 }]),
      )
      .mockReturnValueOnce(throwError(() => new Error('Falha transitória')))
      .mockReturnValueOnce(of([]));
    const { component, fixture } = await createMajorEventFixture({
      events: [majorEvent],
      availability,
      watch: () => updates,
    });

    expect(component.hasPrizeDraws('major-live')).toBe(false);

    updates.next();
    updates.next();
    await waitForDrawRefresh(fixture);

    expect(availability).toHaveBeenCalledTimes(2);
    expect(component.hasPrizeDraws('major-live')).toBe(true);

    updates.next();
    await waitForDrawRefresh(fixture);
    expect(component.hasPrizeDraws('major-live')).toBe(true);

    updates.next();
    await waitForDrawRefresh(fixture);
    expect(availability).toHaveBeenCalledTimes(4);
    expect(component.hasPrizeDraws('major-live')).toBe(false);
  });
});

async function createMajorEventFixture(input: {
  events: ReturnType<typeof createPublicMajorEvent>[];
  availability: ReturnType<typeof vi.fn>;
  watch: () => Subject<void>;
}): Promise<{ component: MajorEvent; fixture: ComponentFixture<MajorEvent> }> {
  await TestBed.configureTestingModule({
    imports: [MajorEvent],
    providers: [
      {
        provide: AnalyticsService,
        useValue: { trackEvent: vi.fn() },
      },
      {
        provide: AuthService,
        useValue: { isAuthenticated: () => false, login: vi.fn() },
      },
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({})),
          snapshot: { paramMap: convertToParamMap({}) },
        },
      },
      {
        provide: MajorEventSubscriptionApiService,
        useValue: {
          listMajorEvents: vi.fn(() => of(input.events)),
          listCurrentUserSubscriptions: vi.fn(() => of([])),
          getPreviewMajorEvents: vi.fn(() => of({ events: [], expiresAt: publicFixtureDateFromNow(1) })),
        },
      },
      {
        provide: PublicPrizeDrawApiService,
        useValue: { availability: input.availability, watch: vi.fn(input.watch) },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(MajorEvent);
  fixture.detectChanges();
  await fixture.whenStable();
  return { component: fixture.componentInstance, fixture };
}

async function waitForDrawRefresh(fixture: ComponentFixture<MajorEvent>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  await fixture.whenStable();
}
