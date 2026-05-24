import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localePt from '@angular/common/locales/pt';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { PublicEvent } from '@cacic-fct/shared-utils';
import { NEVER, of } from 'rxjs';
import { AnalyticsService } from '../../analytics/analytics.service';
import { MajorEventSubscriptionRealtimeService } from './subscription-realtime.service';
import { RankedMajorEventSubscription } from './ranked-subscription';
import { RankedSubscriptionStore } from './ranked-subscription.store';

registerLocaleData(localePt);

describe('RankedMajorEventSubscription', () => {
  let fixture: ComponentFixture<RankedMajorEventSubscription>;
  let component: RankedMajorEventSubscription;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RankedMajorEventSubscription],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ majorEventId: 'major-1' })),
            queryParamMap: of(convertToParamMap({})),
            snapshot: {
              paramMap: convertToParamMap({ majorEventId: 'major-1' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => true,
            login: vi.fn(),
          },
        },
        {
          provide: MajorEventSubscriptionRealtimeService,
          useValue: {
            watch: () => NEVER,
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            trackMajorEventSubscription: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RankedMajorEventSubscription);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    http?.verify();
  });

  it('creates ranking items from selected event groups', () => {
    flushInitialRequests(http);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);
    store.toggleEvent(eventFixtures[1] as PublicEvent);

    expect(component).toBeTruthy();
    expect(store.rankingItems().some((item) => item.label === 'Trilha Web')).toBe(true);
    expect(store.autoSelectedEvents().map((event) => event.id)).toEqual(['event-1']);
  });
});

function flushInitialRequests(http: HttpTestingController): void {
  const pageRequest = http.expectOne(
    (request) =>
      request.url === '/api/graphql' &&
      typeof request.body === 'object' &&
      String(request.body?.query).includes('PublicMajorEventSubscriptionPage'),
  );
  pageRequest.flush({
    data: {
      publicMajorEventSubscriptionPage: {
        majorEvent: majorEventFixture,
        events: eventFixtures,
        subscriptionSummaries: eventFixtures.map((event) => ({ eventId: event.id, hasAvailableSlots: true })),
      },
    },
  });

  const subscriptionRequest = http.expectOne(
    (request) =>
      request.url === '/api/graphql' &&
      typeof request.body === 'object' &&
      String(request.body?.query).includes('CurrentUserMajorEventSubscription'),
  );
  subscriptionRequest.flush({
    data: {
      currentUserMajorEventSubscription: null,
    },
  });
}

const majorEventFixture = {
  id: 'major-1',
  name: 'SECOMPP',
  emoji: '💻',
  startDate: '2026-06-01T12:00:00.000Z',
  endDate: '2026-06-03T21:00:00.000Z',
  description: 'Evento de teste',
  subscriptionStartDate: '2026-05-01T12:00:00.000Z',
  subscriptionEndDate: '2026-05-30T21:00:00.000Z',
  maxCoursesPerAttendee: 1,
  maxLecturesPerAttendee: 1,
  maxUncategorizedPerAttendee: 1,
  rankedSubscriptionEnabled: true,
  isPaymentRequired: false,
  majorEventPrices: [],
};

const eventFixtures = [
  {
    id: 'event-1',
    name: 'Credenciamento',
    emoji: '✅',
    type: 'OTHER',
    startDate: '2026-06-01T12:00:00.000Z',
    endDate: '2026-06-01T13:00:00.000Z',
    majorEventId: 'major-1',
    eventGroupId: null,
    autoSubscribe: true,
    allowSubscription: true,
    queueCount: 0,
  },
  {
    id: 'event-2',
    name: 'Angular',
    emoji: '🧠',
    type: 'MINICURSO',
    startDate: '2026-06-01T14:00:00.000Z',
    endDate: '2026-06-01T16:00:00.000Z',
    majorEventId: 'major-1',
    eventGroupId: 'group-1',
    eventGroup: { id: 'group-1', name: 'Trilha Web', emoji: '🌐' },
    autoSubscribe: false,
    allowSubscription: true,
    queueCount: 0,
  },
  {
    id: 'event-3',
    name: 'GraphQL',
    emoji: '📡',
    type: 'MINICURSO',
    startDate: '2026-06-01T16:00:00.000Z',
    endDate: '2026-06-01T18:00:00.000Z',
    majorEventId: 'major-1',
    eventGroupId: 'group-1',
    eventGroup: { id: 'group-1', name: 'Trilha Web', emoji: '🌐' },
    autoSubscribe: false,
    allowSubscription: true,
    queueCount: 0,
  },
];
