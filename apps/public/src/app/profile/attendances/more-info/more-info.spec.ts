import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of } from 'rxjs';
import { MoreInfo } from './more-info';

describe('MoreInfo', () => {
  let component: MoreInfo;
  let fixture: ComponentFixture<MoreInfo>;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoreInfo, NoopAnimationsModule],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(
              convertToParamMap({ eventType: 'event', eventId: 'event-1' }),
            ),
            snapshot: {
              paramMap: convertToParamMap({
                eventType: 'event',
                eventId: 'event-1',
              }),
            },
          },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MoreInfo);
    component = fixture.componentInstance;
    fixture.detectChanges();
    const requests = httpTesting.match('/api/graphql');
    expect(requests.length).toBe(2);

    const detailsRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserEventDetails'),
    );
    const certificatesRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserCertificates'),
    );
    expect(detailsRequest).toBeTruthy();
    expect(certificatesRequest).toBeTruthy();

    detailsRequest?.flush({
      data: {
        currentUserEventSubscription: {
          eventId: 'event-1',
          eventGroupSubscriptionId: null,
          createdAt: '2026-04-01T12:00:00.000Z',
          event: {
            id: 'event-1',
            name: 'Evento teste',
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
            majorEventId: null,
            eventGroupId: null,
            allowSubscription: true,
            slots: null,
            shouldIssueCertificate: false,
            shouldCollectAttendance: false,
            isOnlineAttendanceAllowed: false,
            onlineAttendanceStartDate: null,
            onlineAttendanceEndDate: null,
            publiclyVisible: true,
            youtubeCode: null,
            buttonText: null,
            buttonLink: null,
            majorEvent: null,
            eventGroup: null,
          },
        },
        currentUserEventAttendance: null,
        publicEvent: {
          id: 'event-1',
          name: 'Evento teste',
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
          majorEventId: null,
          eventGroupId: null,
          allowSubscription: true,
          slots: null,
          shouldIssueCertificate: false,
          shouldCollectAttendance: false,
          isOnlineAttendanceAllowed: false,
          onlineAttendanceStartDate: null,
          onlineAttendanceEndDate: null,
          publiclyVisible: true,
          youtubeCode: null,
          buttonText: null,
          buttonLink: null,
          majorEvent: null,
          eventGroup: null,
        },
      },
    });
    certificatesRequest?.flush({
      data: {
        currentUserCertificates: [],
      },
    });
    await fixture.whenStable();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
