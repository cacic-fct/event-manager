import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  createPublicEvent,
  createPublicMajorEvent,
  publicFixtureDateFromNow,
} from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import { AttendancesApiService } from './attendances-api.service';

describe('AttendancesApiService uncovered operations', () => {
  let service: AttendancesApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AttendancesApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('maps major-event details, derives non-subscribed events, and filters attendances to that major event', async () => {
    const selectedEvent = eventFixture('event-selected', 'Selecionado');
    const otherEvent = eventFixture('event-other', 'Ainda disponível');
    const majorEvent = majorEventFixture();
    const result = firstValueFrom(service.getMajorEventDetails('major-1'));

    const detailsRequest = http.expectOne(
      (request) =>
        request.url === '/api/graphql' && String(request.body?.query).includes('CurrentUserMajorEventDetails'),
    );
    expect(detailsRequest.request.body.variables).toEqual({ majorEventId: 'major-1' });
    detailsRequest.flush({
      data: {
        currentUserMajorEventSubscription: {
          id: 'major-subscription-1',
          majorEventId: 'major-1',
          subscriptionStatus: 'CONFIRMED',
          amountPaid: null,
          paymentDate: null,
          paymentTier: null,
          majorEvent,
          selectedEvents: [],
          notSubscribedEvents: [],
        },
        currentUserMajorEventEventSubscriptions: [
          {
            eventId: selectedEvent.id,
            eventGroupSubscriptionId: null,
            createdAt: publicFixtureDateFromNow(0, 12),
            event: selectedEvent,
          },
        ],
        currentUserEventAttendances: [
          { eventId: selectedEvent.id, attendedAt: publicFixtureDateFromNow(0, 12) },
          { eventId: 'outside-event', attendedAt: publicFixtureDateFromNow(0, 12) },
        ],
        publicEvents: [selectedEvent, otherEvent],
      },
    });

    const feedRequest = http.expectOne(
      (request) =>
        request.url === '/api/graphql' && String(request.body?.query).includes('CurrentUserMajorEventFeedItem'),
    );
    expect(feedRequest.request.body.variables).toBeUndefined();
    feedRequest.flush({
      data: {
        currentUserMajorEventFeed: [
          {
            id: 'major-subscription-1',
            majorEventId: 'major-1',
            subscriptionStatus: 'CONFIRMED',
            amountPaid: null,
            paymentDate: null,
            paymentTier: null,
            sportsRepresentativeTeams: [{ id: 'team-1', name: 'Equipe' }],
            majorEvent,
            participation: {
              isSubscribed: true,
              isLecturer: false,
              hasIssuedCertificate: true,
              isSportsManager: false,
            },
          },
        ],
      },
    });

    const organizerRequest = http.expectOne(
      (request) => request.url === '/api/graphql' && String(request.body?.query).includes('CurrentUserOrganizerInfo'),
    );
    expect(organizerRequest.request.body.variables).toEqual({ targetType: 'major-event', targetId: 'major-1' });
    organizerRequest.flush({ data: { currentUserOrganizerInfo: null } });

    await expect(result).resolves.toEqual({
      subscription: {
        id: 'major-subscription-1',
        majorEventId: 'major-1',
        subscriptionStatus: 'CONFIRMED',
        amountPaid: null,
        paymentDate: null,
        paymentTier: null,
        majorEvent,
        selectedEvents: [selectedEvent],
        notSubscribedEvents: [otherEvent],
      },
      majorEvent,
      events: [selectedEvent, otherEvent],
      hasIssuedCertificate: true,
      isLecturer: false,
      sportsRepresentativeTeams: [{ id: 'team-1', name: 'Equipe' }],
      attendances: [{ eventId: selectedEvent.id, attendedAt: expect.any(String) }],
    });
  });

  it('maps organizer information and safely falls back to null on organizer errors', async () => {
    const organizer = {
      targetType: 'EVENT',
      targetId: 'event-1',
      title: 'Organização',
      events: [
        {
          subscriberCount: 10,
          attendanceCount: 7,
          onlineAttendanceCode: null,
          canDownloadSubscriberList: true,
          event: createPublicEvent({ id: 'event-1', name: 'Evento' }),
        },
      ],
    };
    const success = firstValueFrom(service.getOrganizerInfo('event', 'event-1'));
    const successRequest = http.expectOne('/api/graphql');
    expect(successRequest.request.body.variables).toEqual({ targetType: 'event', targetId: 'event-1' });
    successRequest.flush({ data: { currentUserOrganizerInfo: organizer } });
    await expect(success).resolves.toEqual(organizer);

    const failure = firstValueFrom(service.getOrganizerInfo('event', 'event-1'));
    http.expectOne('/api/graphql').flush({ errors: [{ message: 'Sem permissão' }] });
    await expect(failure).resolves.toBeNull();
  });

  it('loads and updates the current-user lecturer profile with exact mutation input', async () => {
    const profile = {
      id: 'profile-1',
      personId: 'person-1',
      displayName: 'Professora',
      biography: null,
      publishGoogleUserPicture: true,
      googleUserPicture: 'https://images.example.test/profile.png',
      email: 'prof@example.test',
      whatsapp: null,
    };
    const read = firstValueFrom(service.getCurrentUserLecturerProfile());
    const readRequest = http.expectOne('/api/graphql');
    expect(readRequest.request.body.query).toContain('query CurrentUserLecturerProfile');
    expect(readRequest.request.body.variables).toBeUndefined();
    readRequest.flush({ data: { currentUserLecturerProfile: profile } });
    await expect(read).resolves.toEqual(profile);

    const input = {
      displayName: 'Professora atualizada',
      biography: 'Bio',
      publishGoogleUserPicture: false,
      email: null,
      whatsapp: '+5511999999999',
    };
    const before = structuredClone(input);
    const update = firstValueFrom(service.upsertCurrentUserLecturerProfile(input));
    const updateRequest = http.expectOne('/api/graphql');
    expect(updateRequest.request.body.query).toContain('mutation UpsertCurrentUserLecturerProfile');
    expect(updateRequest.request.body.variables).toEqual({ input });
    updateRequest.flush({ data: { upsertCurrentUserLecturerProfile: profile } });

    await expect(update).resolves.toEqual(profile);
    expect(input).toEqual(before);
  });

  it('downloads an event subscriber list through the public GraphQL contract', async () => {
    const result = firstValueFrom(service.downloadEventSubscriberList('event / 1'));
    const request = http.expectOne('/api/graphql');
    const download = {
      fileName: 'inscritos.csv',
      mimeType: 'text/csv',
      contentBase64: 'Y29udGVudA==',
    };

    expect(request.request.body.query).toContain('query DownloadCurrentUserEventSubscriberList');
    expect(request.request.body.variables).toEqual({ eventId: 'event / 1' });
    request.flush({ data: { downloadCurrentUserEventSubscriberList: download } });

    await expect(result).resolves.toEqual(download);
  });

  it('rejects missing GraphQL data for subscriber-list downloads', async () => {
    const result = firstValueFrom(service.downloadEventSubscriberList('event-1'));
    http.expectOne('/api/graphql').flush({});

    await expect(result).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});

function eventFixture(id: string, name: string) {
  return createPublicEvent({ id, name });
}

function majorEventFixture() {
  return createPublicMajorEvent({ id: 'major-1', name: 'Grande evento' });
}
