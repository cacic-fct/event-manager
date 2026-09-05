import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import localePt from '@angular/common/locales/pt';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import type { PublicEvent, PublicMajorEvent, PublicMajorEventPriceTier } from '@cacic-fct/event-manager-public-contracts';
import { createPublicEventForm, createPublicEventFormLink } from '@cacic-fct/event-manager-public-testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { BehaviorSubject, NEVER, of } from 'rxjs';
import { AnalyticsService } from '../../../analytics/analytics.service';
import { MajorEventSubscriptionRealtimeService } from '../realtime.service';
import { subscriptionFormKey } from '../standard/subscription-flow.models';
import { SubscriptionReviewDialog } from '../standard/subscription-review-dialog';
import { RankedMajorEventSubscription } from './ranked-subscription';
import { RankedSubscriptionStore } from './registration.store';

registerLocaleData(localePt);

describe('RankedMajorEventSubscription', () => {
  let fixture: ComponentFixture<RankedMajorEventSubscription>;
  let component: RankedMajorEventSubscription;
  let http: HttpTestingController;
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let openReview: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    routeParams = new BehaviorSubject(convertToParamMap({ majorEventId: 'major-1' }));
    openReview = vi.fn(() => ({ afterClosed: () => of({ confirmed: true }) }));
    TestBed.configureTestingModule({
      imports: [RankedMajorEventSubscription],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: routeParams,
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
    });
    TestBed.overrideProvider(MatDialog, { useValue: { open: openReview } });
    await TestBed.compileComponents();

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
    expect(store.rankingItems().some((item) => item.label === 'Angular')).toBe(false);
    expect(store.autoSelectedEvents().map((event) => event.id)).toEqual(['event-1']);
  });

  it('shows the tier page before ranked selection and keeps the chosen modality summary', () => {
    const majorEvent = paidMajorEvent([
      { id: 'events', name: 'Eventos', value: 3000, includesEventRegistration: true, includesSportsRegistration: false },
      { id: 'sports', name: 'Esportes', value: 2000, includesEventRegistration: false, includesSportsRegistration: true },
    ]);
    flushInitialRequests(http, majorEvent);
    fixture.detectChanges();

    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);
    expect(component.showingTierStep()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-subscription-tier-selection')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('app-ranked-subscription-select-step')).toBeNull();

    store.selectPriceTier('Eventos');
    component.continueFromTier();
    fixture.detectChanges();

    expect(component.showingTierStep()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('app-ranked-subscription-select-step')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.selected-tier-summary')?.textContent).toContain(
      'Eventos',
    );
  });

  it('returns to tier selection when the route changes to another major event', () => {
    const majorEvent = paidMajorEvent([
      { id: 'events', name: 'Eventos', value: 3000, includesEventRegistration: true, includesSportsRegistration: false },
    ]);
    flushInitialRequests(http, majorEvent);
    fixture.detectChanges();
    component.continueFromTier();
    expect(component.currentStep()).toBe('select');
    routeParams.next(convertToParamMap({ majorEventId: 'major-2' }));
    fixture.detectChanges();
    flushInitialRequests(http, { ...majorEvent, id: 'major-2' });
    fixture.detectChanges();
    expect(component.currentStep()).toBe('tier');
    expect(component.showingTierStep()).toBe(true);
  });

  it('resets ranked selections and drafts when the tier changes', () => {
    const majorEvent = paidMajorEvent([
      { id: 'events', name: 'Eventos', value: 3000, includesEventRegistration: true, includesSportsRegistration: false },
      { id: 'neither', name: 'Participação', value: 1000, includesEventRegistration: false, includesSportsRegistration: false },
    ]);
    flushInitialRequests(http, majorEvent);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);

    store.selectPriceTier('Eventos');
    component.continueFromTier();
    store.toggleEvent(eventFixtures[1] as PublicEvent);
    expect(store.rankingItems().length).toBeGreaterThan(0);
    store.selectPriceTier('Participação');

    expect(store.selectedEventIds().size).toBe(0);
    expect(store.rankingItems()).toEqual([]);
    expect(store.notWantedItems()).toEqual([]);
    expect(store.desiredCourses()).toBe(0);
    expect(store.desiredLectures()).toBe(0);
    expect(store.desiredUncategorized()).toBe(0);
    expect(store.subscriptionFormFlow()).toBeNull();
  });

  it.each([true, false])('submits an empty ranked selection with sports access %s', async (includesSportsRegistration) => {
    const majorEvent = paidMajorEvent([
      { id: 'sports', name: 'Esportes', value: 2000, includesEventRegistration: false, includesSportsRegistration },
    ]);
    flushInitialRequests(http, majorEvent);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);

    expect(store.selectedPriceTierName()).toBe('Esportes');
    expect(store.effectiveSelectedEventIds().size).toBe(0);
    expect(store.desiredCourses()).toBe(0);
    component.continueFromTier();
    const formRequest = http.expectOne(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        String(request.body?.query).includes('CurrentUserEventForms'),
    );
    expect(formRequest.request.body.variables).toEqual(
      expect.objectContaining({ targetType: 'MAJOR_EVENT', majorEventId: 'major-1', selectedPriceTierId: 'sports' }),
    );
    formRequest.flush({ data: { currentUserEventForms: [] } });
    await fixture.whenStable();

    const mutation = http.expectOne(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        String(request.body?.query).includes('UpsertCurrentUserRankedMajorEventSubscription'),
    );
    expect(mutation.request.body.variables).toEqual(
      expect.objectContaining({
        selectedEventIds: [],
        desiredCourses: 0,
        desiredLectures: 0,
        desiredUncategorized: 0,
        paymentTier: 'Esportes',
      }),
    );
  });

  it('hydrates an existing tier once and locks confirmed subscriptions to it', () => {
    const majorEvent = paidMajorEvent([
      { id: 'events', name: 'Eventos', value: 3000, includesEventRegistration: true, includesSportsRegistration: false },
      { id: 'sports', name: 'Esportes', value: 2000, includesEventRegistration: false, includesSportsRegistration: true },
    ]);
    const subscription = {
      id: 'subscription-1',
      majorEventId: 'major-1',
      subscriptionStatus: 'CONFIRMED',
      amountPaid: 3000,
      paymentDate: null,
      paymentTier: 'Eventos',
      imageLicenseAgreementAccepted: true,
      majorEvent,
      selectedEvents: eventFixtures,
      notSubscribedEvents: [],
    };
    flushPageRequest(http, majorEvent);
    flushCurrentSubscriptionRequest(http, subscription);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);

    expect(store.selectedPriceTierName()).toBe('Eventos');
    expect(store.effectiveSelectedEventIds()).toEqual(new Set(eventFixtures.map((event) => event.id)));
    expect(store.tierSelectionLocked()).toBe(true);
    store.selectPriceTier('Esportes');
    expect(store.selectedPriceTierName()).toBe('Eventos');
  });

  it('prepares the shared page-level form flow before review', async () => {
    flushInitialRequests(http, { ...majorEventFixture, requiresImageLicenseAgreement: true });
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);

    store.submit();
    const formRequests = http.match(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        String(request.body?.query).includes('CurrentUserEventForms'),
    );
    expect(formRequests).toHaveLength(2);
    formRequests.forEach((request) => request.flush({ data: { currentUserEventForms: [] } }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.subscriptionFormFlow()).toEqual(
      expect.objectContaining({
        eventIds: ['event-1'],
        forms: [],
        draft: expect.objectContaining({ imageLicenseAgreementAccepted: false }),
      }),
    );
    expect((fixture.nativeElement as HTMLElement).querySelector('app-subscription-form-flow')).not.toBeNull();
  });

  it('does not prepare forms before the current subscription finishes loading', () => {
    flushPageRequest(http);
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);
    component.showRankingStep();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.subscribe-fab')?.disabled).toBe(
      true,
    );
    store.submit();
    expect(
      http.match(
        (request) =>
          request.url === '/api/graphql' &&
          typeof request.body === 'object' &&
          String(request.body?.query).includes('CurrentUserEventForms'),
      ),
    ).toHaveLength(0);

    flushCurrentSubscriptionRequest(http);
  });

  it('keeps target form order and submits reviewed answers through the ranked mutation', async () => {
    flushInitialRequests(http, { ...majorEventFixture, requiresImageLicenseAgreement: true });
    fixture.detectChanges();
    const store = fixture.debugElement.injector.get(RankedSubscriptionStore);
    store.toggleEvent(eventFixtures[1] as PublicEvent);
    store.desiredCourses.set(1);

    const majorForm = createPublicEventForm({
      id: 'form-shirt',
      name: 'Camiseta do evento',
      links: [
        createPublicEventFormLink({
          id: 'link-shirt',
          formId: 'form-shirt',
          targetType: 'MAJOR_EVENT',
          eventId: null,
          majorEventId: 'major-1',
          insertInSubscriptionFlow: true,
          requiredInSubscriptionFlow: true,
          displayOrder: 10,
        }),
      ],
    });
    const eventForm = createPublicEventForm({
      id: 'form-accessibility',
      name: 'Acessibilidade da atividade',
      links: [
        createPublicEventFormLink({
          id: 'link-accessibility',
          formId: 'form-accessibility',
          targetType: 'EVENT',
          eventId: 'event-2',
          majorEventId: null,
          insertInSubscriptionFlow: true,
          requiredInSubscriptionFlow: true,
          displayOrder: 0,
        }),
      ],
    });

    store.submit();
    const formRequests = http.match(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        String(request.body?.query).includes('CurrentUserEventForms'),
    );
    expect(formRequests).toHaveLength(4);
    for (const request of formRequests) {
      const variables = request.request.body.variables as Record<string, unknown>;
      const targetType = variables['targetType'];
      const targetId = targetType === 'EVENT' ? variables['eventId'] : variables['majorEventId'];
      request.flush({
        data: {
          currentUserEventForms:
            targetType === 'MAJOR_EVENT' && targetId === 'major-1'
              ? [majorForm]
              : targetType === 'EVENT' && targetId === 'event-2'
                ? [eventForm]
                : [],
        },
      });
    }
    const responseRequests = http.match(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        String(request.body?.query).includes('query CurrentUserEventFormResponse('),
    );
    expect(responseRequests).toHaveLength(2);
    responseRequests.forEach((request) => request.flush({ data: { currentUserEventFormResponse: null } }));
    await fixture.whenStable();

    const flow = store.subscriptionFormFlow();
    expect(flow?.forms.map((form) => form.form.id)).toEqual(['form-shirt', 'form-accessibility']);
    if (!flow) {
      throw new Error('Expected ranked subscription form flow to be prepared.');
    }
    const draft = {
      answersByKey: {
        ...flow.draft.answersByKey,
        [subscriptionFormKey(flow.forms[0])]: [{ elementId: 'shirt-size', value: 'm' }],
        [subscriptionFormKey(flow.forms[1])]: [{ elementId: 'accessibility', value: 'yes' }],
      },
      imageLicenseAgreementAccepted: true,
    };

    store.reviewSubscription(draft);

    expect(openReview).toHaveBeenCalledWith(
      SubscriptionReviewDialog,
      expect.objectContaining({
        data: expect.objectContaining({
          forms: flow.forms,
          draft,
        }),
      }),
    );
    const mutation = http.expectOne(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        String(request.body?.query).includes('UpsertCurrentUserRankedMajorEventSubscription'),
    );
    expect(mutation.request.body.variables).toEqual(
      expect.objectContaining({
        majorEventId: 'major-1',
        selectedEventIds: ['event-1', 'event-2', 'event-3'],
        desiredCourses: 1,
        formResponses: [
          {
            formId: 'form-shirt',
            linkId: 'link-shirt',
            targetType: 'MAJOR_EVENT',
            majorEventId: 'major-1',
            answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'm' }]),
          },
          {
            formId: 'form-accessibility',
            linkId: 'link-accessibility',
            targetType: 'EVENT',
            eventId: 'event-2',
            answersJson: JSON.stringify([{ elementId: 'accessibility', value: 'yes' }]),
          },
        ],
        imageLicenseAgreementAccepted: true,
      }),
    );
    mutation.flush({
      data: {
        upsertCurrentUserMajorEventSubscription: {
          id: 'subscription-1',
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          amountPaid: null,
          paymentDate: null,
          paymentTier: null,
          imageLicenseAgreementAccepted: true,
          majorEvent: { ...majorEventFixture, requiresImageLicenseAgreement: true },
          selectedEvents: eventFixtures,
        },
      },
    });
    await fixture.whenStable();
  });
});

function flushInitialRequests(http: HttpTestingController, majorEvent: PublicMajorEvent = majorEventFixture): void {
  flushPageRequest(http, majorEvent);
  flushCurrentSubscriptionRequest(http);
}

function flushPageRequest(http: HttpTestingController, majorEvent: PublicMajorEvent = majorEventFixture): void {
  const pageRequest = http.expectOne(
    (request) =>
      request.url === '/api/graphql' &&
      typeof request.body === 'object' &&
      String(request.body?.query).includes('PublicMajorEventSubscriptionPage'),
  );
  pageRequest.flush({
    data: {
      publicMajorEventSubscriptionPage: {
        majorEvent,
        events: eventFixtures,
        subscriptionSummaries: eventFixtures.map((event) => ({ eventId: event.id, hasAvailableSlots: true })),
      },
    },
  });
}

function flushCurrentSubscriptionRequest(http: HttpTestingController, subscription: unknown = null): void {
  const subscriptionRequest = http.expectOne(
    (request) =>
      request.url === '/api/graphql' &&
      typeof request.body === 'object' &&
      String(request.body?.query).includes('CurrentUserMajorEventSubscription'),
  );
  subscriptionRequest.flush({
    data: {
      currentUserMajorEventSubscription: subscription,
    },
  });
}

const majorEventFixture: PublicMajorEvent = {
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
  requiresImageLicenseAgreement: false,
  isPaymentRequired: false,
  majorEventPrices: [],
};

function paidMajorEvent(tiers: PublicMajorEventPriceTier[]): PublicMajorEvent {
  return {
    ...majorEventFixture,
    isPaymentRequired: true,
    majorEventPrices: [{ id: 'price-1', type: 'TIERED', tiers }],
  };
}

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
