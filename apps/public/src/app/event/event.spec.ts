import '../testing/observer-mocks';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Event } from './event';
import { ActivatedRoute, convertToParamMap, Router, Params } from '@angular/router';
import { signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { PublicEventForm, PublicEventFormResponse } from '@cacic-fct/event-manager-public-contracts';
import { AuthService } from '@cacic-fct/shared-angular';
import { of } from 'rxjs';
import { EventApiService, type EventPageData } from './event-api.service';
import { PublicEventFormApiService } from '../forms/event-form-api.service';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

interface EventComponentFixtureOptions {
  authenticated?: boolean;
  eventPageData?: EventPageData;
  eventApi?: Partial<EventApiService>;
  formsApi?: Partial<PublicEventFormApiService>;
  dialog?: Partial<MatDialog>;
}

async function createEventComponentFixture(
  queryParamMap: Params = {},
  options: EventComponentFixtureOptions = {},
): Promise<ComponentFixture<Event>> {
  const eventPageData = options.eventPageData ?? defaultEventPageData();
  const dialog = {
    open: vi.fn(() => ({
      afterClosed: () => of({ confirmed: false, answers: [] }),
    })),
    ...options.dialog,
  };
  TestBed.configureTestingModule({
    imports: [Event],
    providers: [
      provideNoopAnimations(),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ eventId: 'event-1' })),
          queryParamMap: of(convertToParamMap(queryParamMap)),
        },
      },
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: signal(options.authenticated ?? false),
          login: vi.fn(),
        },
      },
      {
        provide: EventApiService,
        useValue: {
          getEventPageData: () =>
            of(eventPageData),
          subscribeToEvent: vi.fn(() => of({ id: 'event-1' })),
          confirmAttendance: vi.fn(),
          ...options.eventApi,
        },
      },
      {
        provide: PublicEventFormApiService,
        useValue: {
          listCurrentUserForms: vi.fn(() => of([])),
          getCurrentUserResponse: vi.fn(() => of(null)),
          ...options.formsApi,
        },
      },
      {
        provide: Router,
        useValue: {
          url: '/event/event-1',
          navigateByUrl: vi.fn(),
        },
      },
    ],
  });
  TestBed.overrideProvider(MatDialog, { useValue: dialog });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(Event);
  return fixture;
}

function defaultEventPageData(overrides: Partial<EventPageData> = {}): EventPageData {
  const event = {
    id: 'event-1',
    name: 'Evento teste',
    creditMinutes: 60,
    startDate: '2026-05-03T10:00:00.000Z',
    endDate: '2026-05-03T11:00:00.000Z',
    emoji: '🎓',
    type: 'OTHER' as const,
    description: null,
    shortDescription: null,
    latitude: null,
    longitude: null,
    locationDescription: null,
    allowSubscription: false,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: null,
    shouldIssueCertificate: true,
    shouldCollectAttendance: false,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
    majorEventId: null,
    eventGroupId: null,
    majorEvent: null,
    eventGroup: null,
    lecturers: [
      {
        id: 'lecturer-profile-1',
        displayName: 'Ada Lovelace',
        biography: 'Pioneira em computação.',
        publishGoogleUserPicture: false,
        googleUserPicture: null,
        email: 'ada@example.com',
        whatsapp: '+5518999999999',
      },
    ],
  };

  return {
    event,
    subscriptionSummary: {
      eventId: 'event-1',
      hasAvailableSlots: true,
    },
    weather: null,
    currentUserSubscription: null,
    currentUserAttendance: null,
    ...overrides,
  };
}

function subscriptionFormFixture(): PublicEventForm {
  return {
    id: 'form-1',
    name: 'Pesquisa de camiseta',
    description: null,
    elementsJson: JSON.stringify([
      {
        id: 'shirt-size',
        type: 'singleChoice',
        title: 'Tamanho da camiseta',
        required: true,
        options: [{ id: 'm', label: 'M' }],
      },
    ]),
    sigilo: 'SECRET',
    responseMode: 'ONE_PER_TARGET',
    resultsPublic: false,
    resultsLive: false,
    allowResponseEdits: false,
    publicationState: 'PUBLISHED',
    links: [
      {
        id: 'link-1',
        formId: 'form-1',
        targetType: 'EVENT',
        eventId: 'event-1',
        majorEventId: null,
        target: {
          type: 'EVENT',
          id: 'event-1',
          name: 'Evento teste',
          emoji: '🎓',
        },
        audience: 'SUBSCRIBERS_OR_ATTENDEES',
        insertInSubscriptionFlow: true,
        requiredInSubscriptionFlow: true,
        enforceRequiredAnswers: true,
        displayOrder: 0,
        availableFrom: null,
        availableUntil: null,
        notifyOnPublish: false,
        allowLecturerManualPublish: false,
        lastNotifiedAt: null,
        responseCount: 0,
        createdAt: '2026-07-01T10:00:00.000Z',
        updatedAt: '2026-07-01T10:00:00.000Z',
      },
    ],
    responseCount: 0,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  };
}

describe('Event', () => {
  let component: Event;
  let fixture: ComponentFixture<Event>;
  beforeEach(async () => {
    fixture = await createEventComponentFixture({});
    await fixture.whenStable();
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should use back query parameter as return URL', async () => {
    const testBackUrl = '/validate?certificateId=123';
    TestBed.resetTestingModule();
    const newFixture = await createEventComponentFixture({ back: testBackUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testBackUrl);
  });

  it('should fall back to returnUrl if back parameter is not provided', async () => {
    const testReturnUrl = '/calendar';
    TestBed.resetTestingModule();
    const newFixture = await createEventComponentFixture({ returnUrl: testReturnUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testReturnUrl);
  });

  it('should prioritize back over returnUrl if both are provided', async () => {
    const testBackUrl = '/validate?certificateId=123';
    const testReturnUrl = '/calendar';
    TestBed.resetTestingModule();
    const newFixture = await createEventComponentFixture({ back: testBackUrl, returnUrl: testReturnUrl });
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    expect(newComponent.backUrl()).toBe(testBackUrl);
  });

  it('should default to /menu if neither back nor returnUrl is provided', async () => {
    expect(component.backUrl()).toBe('/menu');
  });

  it('renders lecturer profiles with contact links', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Ada Lovelace');
    expect(compiled.textContent).toContain('Pioneira em computação.');
    expect(compiled.querySelector('a[href="mailto:ada@example.com"]')).toBeTruthy();
    expect(compiled.querySelector('a[href="https://wa.me/5518999999999"]')).toBeTruthy();
  });

  it('requests higher quality Google lecturer pictures', () => {
    expect(component.googlePictureUrl('https://lh3.googleusercontent.com/a/ACg8ocK=s96-c')).toBe(
      'https://lh3.googleusercontent.com/a/ACg8ocK=s512-c',
    );
    expect(component.googlePictureUrl('https://lh3.googleusercontent.com/a-/ALV-UjV/s128/photo.jpg')).toBe(
      'https://lh3.googleusercontent.com/a-/ALV-UjV/s512/photo.jpg',
    );
  });

  it('answers required subscription-flow forms before saving a standalone event subscription', async () => {
    TestBed.resetTestingModule();
    const listCurrentUserForms = vi.fn(() => of([subscriptionFormFixture()]));
    const getCurrentUserResponse = vi.fn(() => of(null));
    const open = vi.fn(() => ({
      afterClosed: () =>
        of({
          confirmed: true,
          answers: [
            {
              formId: 'form-1',
              linkId: 'link-1',
              targetType: 'EVENT' as const,
              targetId: 'event-1',
              answers: [{ elementId: 'shirt-size', value: 'm' }],
            },
          ],
        }),
    }));
    const eventPageData = defaultEventPageData({
      event: {
        ...defaultEventPageData().event,
        allowSubscription: true,
        startDate: '2026-12-03T10:00:00.000Z',
        endDate: '2026-12-03T11:00:00.000Z',
      },
    });
    const subscribeToEvent = vi.fn(() => of(eventPageData.event));
    const newFixture = await createEventComponentFixture(
      {},
      {
        authenticated: true,
        eventPageData,
        eventApi: { subscribeToEvent },
        formsApi: { listCurrentUserForms, getCurrentUserResponse },
        dialog: { open: open as never },
      },
    );
    await newFixture.whenStable();
    const newComponent = newFixture.componentInstance;

    newComponent.subscribe(eventPageData);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listCurrentUserForms).toHaveBeenCalledWith({
      targetType: 'EVENT',
      eventId: 'event-1',
      majorEventId: null,
      subscriptionFlowOnly: true,
    });
    expect(open).toHaveBeenCalled();
    expect(subscribeToEvent).toHaveBeenCalledWith('event-1', [
      {
        formId: 'form-1',
        linkId: 'link-1',
        targetType: 'EVENT',
        eventId: 'event-1',
        answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'm' }]),
      },
    ]);
  });

  it('keeps multiple-response subscription forms editable after an existing response', async () => {
    TestBed.resetTestingModule();
    const form = {
      ...subscriptionFormFixture(),
      responseMode: 'MULTIPLE_PER_TARGET' as const,
      allowResponseEdits: false,
    };
    const existingResponse: PublicEventFormResponse = {
      id: 'response-1',
      formId: 'form-1',
      linkId: 'link-1',
      targetType: 'EVENT',
      eventId: 'event-1',
      majorEventId: null,
      personId: 'person-1',
      respondentName: 'Ada Lovelace',
      respondentEmail: 'ada@example.com',
      answersJson: JSON.stringify([{ elementId: 'shirt-size', value: 'm' }]),
      source: 'SUBSCRIPTION_FLOW',
      submittedAt: '2026-07-06T12:00:00.000Z',
      updatedAt: '2026-07-06T12:00:00.000Z',
    };
    const open = vi.fn(() => ({
      afterClosed: () => of({ confirmed: false, answers: [] }),
    }));
    const eventPageData = defaultEventPageData({
      event: {
        ...defaultEventPageData().event,
        allowSubscription: true,
        startDate: '2026-12-03T10:00:00.000Z',
        endDate: '2026-12-03T11:00:00.000Z',
      },
    });
    const newFixture = await createEventComponentFixture(
      {},
      {
        authenticated: true,
        eventPageData,
        formsApi: {
          listCurrentUserForms: vi.fn(() => of([form])),
          getCurrentUserResponse: vi.fn(() => of(existingResponse)),
        },
        dialog: { open: open as never },
      },
    );
    await newFixture.whenStable();

    newFixture.componentInstance.subscribe(eventPageData);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(open).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        data: expect.objectContaining({
          forms: [
            expect.objectContaining({
              submitted: true,
              editable: true,
            }),
          ],
        }),
      }),
    );
  });

  it('displays available forms for authenticated attendees without requiring a subscription', async () => {
    TestBed.resetTestingModule();
    const form = {
      ...subscriptionFormFixture(),
      links: [
        {
          ...subscriptionFormFixture().links[0],
          insertInSubscriptionFlow: false,
          availableFrom: '2026-07-01T10:00:00.000Z',
          availableUntil: null,
        },
      ],
    };
    const listCurrentUserForms = vi.fn(() => of([form]));
    const eventPageData = defaultEventPageData({
      currentUserAttendance: {
        eventId: 'event-1',
        attendedAt: '2026-07-06T12:00:00.000Z',
      },
      currentUserSubscription: null,
    });
    const newFixture = await createEventComponentFixture(
      {},
      {
        authenticated: true,
        eventPageData,
        formsApi: { listCurrentUserForms },
      },
    );
    await newFixture.whenStable();
    newFixture.detectChanges();
    await newFixture.whenStable();

    const compiled = newFixture.nativeElement as HTMLElement;

    expect(listCurrentUserForms).toHaveBeenCalledWith({
      targetType: 'EVENT',
      eventId: 'event-1',
      majorEventId: null,
    });
    expect(compiled.textContent).toContain('Formulários');
    expect(compiled.textContent).toContain('Pesquisa de camiseta');
    const [formLink] = newFixture.componentInstance.attendeeFormLinks();
    expect(newFixture.componentInstance.formRoute(formLink)).toEqual(['/profile', 'forms', 'form-1']);
    expect(newFixture.componentInstance.formQueryParams(formLink)).toEqual({
      targetType: 'EVENT',
      targetId: 'event-1',
      linkId: 'link-1',
    });
  });

  it('does not request event page forms for authenticated users without attendance', async () => {
    TestBed.resetTestingModule();
    const listCurrentUserForms = vi.fn(() => of([subscriptionFormFixture()]));
    const newFixture = await createEventComponentFixture(
      {},
      {
        authenticated: true,
        eventPageData: defaultEventPageData({
          currentUserAttendance: null,
          currentUserSubscription: null,
        }),
        formsApi: { listCurrentUserForms },
      },
    );
    await newFixture.whenStable();
    newFixture.detectChanges();

    expect(listCurrentUserForms).not.toHaveBeenCalled();
    expect((newFixture.nativeElement as HTMLElement).textContent).not.toContain('Formulários');
  });

  it('shows released results and hides closed forms without released results for attendees', async () => {
    TestBed.resetTestingModule();
    const answerClosedForm = {
      ...subscriptionFormFixture(),
      id: 'form-closed',
      name: 'Formulário encerrado',
      resultsPublic: false,
      resultsLive: false,
      links: [
        {
          ...subscriptionFormFixture().links[0],
          id: 'link-closed',
          formId: 'form-closed',
          availableFrom: '2026-07-01T10:00:00.000Z',
          availableUntil: '2026-07-02T10:00:00.000Z',
        },
      ],
    };
    const releasedResultsForm = {
      ...subscriptionFormFixture(),
      id: 'form-results',
      name: 'Avaliação publicada',
      resultsPublic: true,
      resultsLive: false,
      links: [
        {
          ...subscriptionFormFixture().links[0],
          id: 'link-results',
          formId: 'form-results',
          availableFrom: '2026-07-01T10:00:00.000Z',
          availableUntil: '2026-07-02T10:00:00.000Z',
        },
      ],
    };
    const newFixture = await createEventComponentFixture(
      {},
      {
        authenticated: true,
        eventPageData: defaultEventPageData({
          currentUserAttendance: {
            eventId: 'event-1',
            attendedAt: '2026-07-06T12:00:00.000Z',
          },
        }),
        formsApi: {
          listCurrentUserForms: vi.fn(() => of([answerClosedForm, releasedResultsForm])),
        },
      },
    );
    await newFixture.whenStable();
    newFixture.detectChanges();
    await newFixture.whenStable();

    const text = (newFixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('Formulário encerrado');
    expect(text).toContain('Resultados: Avaliação publicada');
  });
});
