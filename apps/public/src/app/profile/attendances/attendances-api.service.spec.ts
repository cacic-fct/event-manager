import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AttendancesApiService } from './attendances-api.service';

describe('AttendancesApiService', () => {
  let httpTesting: HttpTestingController;
  let service: AttendancesApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AttendancesApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('maps the mixed subscription feed into the public profile model', async () => {
    const responsePromise = firstValueFrom(service.getSubscriptionsFeed());

    const request = httpTesting.expectOne('/api/graphql');
    expect(String(request.request.body.query)).toContain('CurrentUserSubscriptionsFeed');

    request.flush({
      data: {
        currentUserMajorEventFeed: [majorEventFeedItem()],
        currentUserSubscriptionFeed: {
          items: [
            {
              type: 'SINGLE_EVENT',
              subscriptionId: 'event-subscription-1',
              eventId: 'event-1',
              date: '2026-07-01T12:00:00.000Z',
              createdAt: '2026-06-26T12:00:00.000Z',
              event: eventFixture('event-1', 'Oficina avulsa'),
              participation: participationFixture(),
            },
            {
              type: 'EVENT_GROUP',
              subscriptionId: 'group-subscription-1',
              eventGroupId: 'group-1',
              date: '2026-07-02T12:00:00.000Z',
              createdAt: '2026-06-26T12:00:00.000Z',
              eventGroup: {
                id: 'group-1',
                name: 'Trilha de integração',
                emoji: '🔗',
              },
              participation: participationFixture(),
            },
          ],
        },
        currentUserEventAttendances: [
          {
            eventId: 'event-1',
            attendedAt: '2026-07-01T12:30:00.000Z',
            event: {
              id: 'event-1',
              majorEventId: null,
              eventGroupId: null,
            },
          },
        ],
      },
    });

    await expect(responsePromise).resolves.toEqual({
      majorEventItems: [majorEventFeedItem()],
      eventItems: [
        {
          __typename: 'SubscribedSingleEventItem',
          id: 'event-1',
          type: 'single',
          startDate: '2026-07-01T12:00:00.000Z',
          event: eventFixture('event-1', 'Oficina avulsa'),
          participation: participationFixture(),
        },
        {
          __typename: 'SubscribedEventGroupItem',
          id: 'group-subscription-1',
          type: 'group',
          startDate: '2026-07-02T12:00:00.000Z',
          eventGroup: {
            id: 'group-1',
            name: 'Trilha de integração',
            emoji: '🔗',
          },
          events: [],
          participation: participationFixture(),
        },
      ],
      attendances: [
        {
          eventId: 'event-1',
          attendedAt: '2026-07-01T12:30:00.000Z',
          event: {
            id: 'event-1',
            majorEventId: null,
            eventGroupId: null,
          },
        },
      ],
    });
  });

  it('deduplicates certificate downloads across certificate targets', async () => {
    const responsePromise = firstValueFrom(
      service.getCurrentUserCertificatesForTargets([
        { scope: 'EVENT', targetId: 'event-1' },
        { scope: 'EVENT_GROUP', targetId: 'group-1' },
      ]),
    );

    const firstRequest = httpTesting.expectOne(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        request.body?.variables?.targetId === 'event-1',
    );
    firstRequest.flush({
      data: {
        currentUserCertificates: [
          certificateFixture('certificate-older', '2026-06-01T12:00:00.000Z'),
          certificateFixture('certificate-shared', '2026-06-02T12:00:00.000Z'),
        ],
      },
    });

    const secondRequest = httpTesting.expectOne(
      (request) =>
        request.url === '/api/graphql' &&
        typeof request.body === 'object' &&
        request.body?.variables?.targetId === 'group-1',
    );
    secondRequest.flush({
      data: {
        currentUserCertificates: [
          certificateFixture('certificate-newer', '2026-06-03T12:00:00.000Z'),
          certificateFixture('certificate-shared', '2026-06-02T12:00:00.000Z'),
        ],
      },
    });

    await expect(responsePromise).resolves.toEqual([
      certificateFixture('certificate-newer', '2026-06-03T12:00:00.000Z'),
      certificateFixture('certificate-shared', '2026-06-02T12:00:00.000Z'),
      certificateFixture('certificate-older', '2026-06-01T12:00:00.000Z'),
    ]);
  });

  it('does not expose an attended child event as a standalone event detail', async () => {
    const responsePromise = firstValueFrom(service.getEventDetails('child-event'));

    flushGraphql('CurrentUserEventDetails', {
      currentUserEventSubscription: null,
      currentUserEventAttendance: {
        eventId: 'child-event',
        attendedAt: '2026-07-01T12:30:00.000Z',
      },
    });
    flushGraphql('CurrentUserCertificates', {
      currentUserCertificates: [],
    });
    flushGraphql('CurrentUserOrganizerInfo', {
      currentUserOrganizerInfo: null,
    });
    flushGraphql('PublicEventForAttendanceDetails', {
      publicEvent: {
        ...eventFixture('child-event', 'Atividade do grande evento'),
        majorEventId: 'major-1',
        eventGroupId: null,
      },
    });

    await expect(responsePromise).resolves.toEqual({
      subscription: null,
      event: null,
      hasIssuedCertificate: false,
      isLecturer: false,
      attendance: null,
    });
  });

  it('does not expose an attended major-event group as a standalone group detail', async () => {
    const responsePromise = firstValueFrom(service.getEventGroupDetails('major-group'));

    flushGraphql('CurrentUserEventGroupDetails', {
      currentUserEventGroupSubscription: null,
      currentUserEventAttendances: [
        {
          eventId: 'child-event',
          attendedAt: '2026-07-01T12:30:00.000Z',
        },
      ],
      publicEvents: [
        {
          ...eventFixture('child-event', 'Atividade em grupo de grande evento'),
          majorEventId: 'major-1',
          eventGroupId: 'major-group',
          eventGroup: {
            id: 'major-group',
            name: 'Grupo do grande evento',
            emoji: '🎓',
          },
        },
      ],
    });
    flushGraphql('CurrentUserCertificates', {
      currentUserCertificates: [],
    });
    flushGraphql('CurrentUserOrganizerInfo', {
      currentUserOrganizerInfo: null,
    });

    await expect(responsePromise).resolves.toEqual({
      subscription: null,
      eventGroup: null,
      events: [],
      hasIssuedCertificate: false,
      isLecturer: false,
      attendances: [],
    });
  });

  it('downloads all current-user certificates as an archive', async () => {
    const responsePromise = firstValueFrom(service.downloadCurrentUserCertificatesArchive());

    const request = httpTesting.expectOne('/api/graphql');
    expect(String(request.request.body.query)).toContain('downloadCurrentUserCertificatesArchive');

    request.flush({
      data: {
        downloadCurrentUserCertificatesArchive: {
          fileName: 'certificados.zip',
          mimeType: 'application/zip',
          contentBase64: 'UEs=',
        },
      },
    });

    await expect(responsePromise).resolves.toEqual({
      fileName: 'certificados.zip',
      mimeType: 'application/zip',
      contentBase64: 'UEs=',
    });
  });
});

function majorEventFeedItem() {
  return {
    id: 'major-subscription-1',
    majorEventId: 'major-1',
    subscriptionStatus: 'CONFIRMED',
    amountPaid: null,
    paymentDate: null,
    paymentTier: null,
    majorEvent: {
      id: 'major-1',
      name: 'SECOMPP',
      emoji: '🎓',
      startDate: '2026-07-01T12:00:00.000Z',
      endDate: '2026-07-03T20:00:00.000Z',
      description: 'Grande evento.',
    },
    participation: participationFixture(),
  };
}

function eventFixture(id: string, name: string) {
  return {
    id,
    name,
    startDate: '2026-07-01T12:00:00.000Z',
    endDate: '2026-07-01T14:00:00.000Z',
    emoji: '🎓',
    type: 'OTHER',
    description: 'Atividade pública.',
    shortDescription: 'Atividade.',
    locationDescription: 'Auditório',
    majorEventId: null,
    eventGroupId: null,
    eventGroup: null,
  };
}

function participationFixture() {
  return {
    isSubscribed: true,
    isLecturer: false,
    hasIssuedCertificate: true,
  };
}

function certificateFixture(id: string, issuedAt: string) {
  return {
    id,
    configId: 'config-1',
    issuedAt,
    config: {
      id: 'config-1',
      name: 'Participante',
      scope: 'EVENT',
      certificateText: 'Certificamos a participação.',
      certificateTemplate: {
        id: 'template-1',
        name: 'Modelo',
        version: 1,
      },
    },
    certificateTemplate: {
      id: 'template-1',
      name: 'Modelo',
      version: 1,
    },
  };
}

function flushGraphql(operationName: string, data: object) {
  const request = TestBed.inject(HttpTestingController).expectOne(
    (candidate) =>
      candidate.url === '/api/graphql' &&
      typeof candidate.body === 'object' &&
      String(candidate.body?.query).includes(operationName),
  );

  request.flush({ data });
}
