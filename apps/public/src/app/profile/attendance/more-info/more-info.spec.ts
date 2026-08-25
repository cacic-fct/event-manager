import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicDatabaseProvider } from '@cacic-fct/public-indexed-db';
import type { DetailViewModel } from '@cacic-fct/shared-utils';
import { NetworkStatusService } from '../../../shared/network-status.service';
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
          provide: AuthService,
          useValue: {
            user: () => ({ sub: 'user-1' }),
          },
        },
        {
          provide: NetworkStatusService,
          useValue: {
            isOnline: () => true,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ eventType: 'event', eventId: 'event-1' })),
            snapshot: {
              paramMap: convertToParamMap({
                eventType: 'event',
                eventId: 'event-1',
              }),
            },
          },
        },
        {
          provide: PublicDatabaseProvider,
          useValue: { getDatabase: () => null },
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MoreInfo);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    try {
      httpTesting.verify();
    } catch {
      // Ignore verification errors if no requests match
    }
  });

  it('renders the event name in the page body instead of the toolbar', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const requests = httpTesting.match(() => true);

    const detailsRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserEventDetails'),
    );
    const certificatesRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserCertificates'),
    );
    const organizerRequest = requests.find((request) =>
      String(request.request.body.query).includes('CurrentUserOrganizerInfo'),
    );
    const publicEventRequest = requests.find((request) =>
      String(request.request.body.query).includes('PublicEventForAttendanceDetails'),
    );

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
            isPubliclyListed: true,
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
          isPubliclyListed: true,
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
    organizerRequest?.flush({
      data: {
        currentUserOrganizerInfo: null,
      },
    });
    publicEventRequest?.flush({
      data: {
        publicEvent: null,
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const formsRequest = httpTesting.match((request) =>
      String(request.body.query).includes('CurrentUserEventForms'),
    )[0];
    formsRequest?.flush({
      data: {
        currentUserEventForms: [],
      },
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component).toBeTruthy();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('mat-toolbar > span')?.textContent?.trim()).toBe('Detalhes');
    expect(host.querySelector('mat-toolbar h1')).toBeNull();
    expect(host.querySelector('.detail-header h1')?.textContent?.trim()).toBe('Evento teste');
  });

  it('builds direct sports and representative-area routes', () => {
    expect(
      component.sportsPanelRoute({ sportsTournamentId: 'tournament-1' } as Parameters<MoreInfo['sportsPanelRoute']>[0]),
    ).toEqual(['/tournament', 'tournament-1']);
    expect(component.representativeTeamRoute('team-1')).toEqual(['/sports', 'team', 'team-1']);
  });

  it('uses one contextual icon for the concise status summary', () => {
    const attendanceDetail = {
      targetType: 'event',
      statusLabel: 'Presença registrada',
      subscriptionStatus: undefined,
    } as DetailViewModel;

    expect(component.statusIcon(attendanceDetail)).toBe('how_to_reg');
    expect(component.statusIcon({ ...attendanceDetail, statusLabel: 'Certificado emitido' })).toBe('workspace_premium');
    expect(
      component.statusIcon({
        ...attendanceDetail,
        targetType: 'major-event',
        statusLabel: 'Comprovante pendente',
        subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
      }),
    ).toBe('receipt_long');
  });
});
