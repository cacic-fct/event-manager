import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AttendancesApiService } from './attendances-api.service';
import { PublicEvent } from '@cacic-fct/shared-utils';
import { firstValueFrom } from 'rxjs';

describe('AttendancesApiService', () => {
  let service: AttendancesApiService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AttendancesApiService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('derives major-event not subscribed events from the public event list', async () => {
    const selectedEvent = eventFixture('selected-event', 'Evento inscrito');
    const notSubscribedEvent = eventFixture('not-subscribed-event', 'Evento não inscrito');

    const detailsPromise = firstValueFrom(service.getMajorEventDetails('major-event-1'));

    const requests = httpTesting.match('/api/graphql');
    expect(requests.length).toBe(3);

    const detailsRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserMajorEventDetails'),
    );
    const feedRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserMajorEventFeedItem'),
    );
    const organizerRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserOrganizerInfo'),
    );

    expect(detailsRequest).toBeTruthy();
    expect(feedRequest).toBeTruthy();
    expect(organizerRequest).toBeTruthy();

    detailsRequest?.flush({
      data: {
        currentUserMajorEventSubscription: {
          id: 'subscription-1',
          majorEventId: 'major-event-1',
          subscriptionStatus: 'CONFIRMED',
          amountPaid: null,
          paymentDate: null,
          paymentTier: null,
          majorEvent: majorEventFixture(),
          selectedEvents: [selectedEvent],
          notSubscribedEvents: [],
        },
        currentUserEventAttendances: [],
        publicEvents: [selectedEvent, notSubscribedEvent],
      },
    });
    feedRequest?.flush({
      data: {
        currentUserMajorEventFeed: [
          {
            id: 'subscription-1',
            majorEventId: 'major-event-1',
            subscriptionStatus: 'CONFIRMED',
            amountPaid: null,
            paymentDate: null,
            paymentTier: null,
            majorEvent: majorEventFixture(),
            participation: {
              isSubscribed: true,
              isLecturer: false,
              hasIssuedCertificate: false,
            },
          },
        ],
      },
    });
    organizerRequest?.flush({
      data: {
        currentUserOrganizerInfo: null,
      },
    });

    const details = await detailsPromise;
    expect(details.subscription?.selectedEvents?.map((event) => event.id)).toEqual(['selected-event']);
    expect(details.subscription?.notSubscribedEvents?.map((event) => event.id)).toEqual(['not-subscribed-event']);
  });
});

function majorEventFixture() {
  return {
    id: 'major-event-1',
    name: 'Grande evento',
    emoji: '🎉',
    startDate: '2026-05-01T12:00:00.000Z',
    endDate: '2026-05-03T12:00:00.000Z',
    description: null,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    maxCoursesPerAttendee: null,
    maxLecturesPerAttendee: null,
    buttonText: null,
    buttonLink: null,
    contactInfo: null,
    contactType: null,
    isPaymentRequired: false,
    additionalPaymentInfo: null,
    shouldIssueCertificate: false,
    paymentInfo: null,
  };
}

function eventFixture(id: string, name: string): PublicEvent {
  return {
    id,
    name,
    creditMinutes: 60,
    startDate: '2026-05-01T12:00:00.000Z',
    endDate: '2026-05-01T14:00:00.000Z',
    emoji: '🎉',
    type: 'OTHER',
    description: null,
    shortDescription: null,
    latitude: null,
    longitude: null,
    locationDescription: null,
    majorEventId: 'major-event-1',
    majorEvent: majorEventFixture(),
    eventGroupId: null,
    eventGroup: null,
    allowSubscription: true,
    subscriptionStartDate: null,
    subscriptionEndDate: null,
    slots: null,
    slotsAvailable: null,
    queueCount: 0,
    autoSubscribe: false,
    shouldIssueCertificate: false,
    shouldCollectAttendance: false,
    isOnlineAttendanceAllowed: false,
    onlineAttendanceStartDate: null,
    onlineAttendanceEndDate: null,
    publiclyVisible: true,
    youtubeCode: null,
    buttonText: null,
    buttonLink: null,
  };
}
