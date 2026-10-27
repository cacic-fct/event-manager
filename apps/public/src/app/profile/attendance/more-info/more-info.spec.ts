import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicDatabaseProvider } from '@cacic-fct/public-indexed-db';
import type { DetailViewModel } from '@cacic-fct/shared-utils';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { PublicPrizeDrawApiService } from '../../../prize-draws/prize-draw-api.service';
import { AttendancesApiService } from '../attendances-api.service';
import { MoreInfo } from './more-info';

describe('MoreInfo', () => {
  let component: MoreInfo;
  let fixture: ComponentFixture<MoreInfo>;
  let httpTesting: HttpTestingController;
  let routeParams: Subject<ParamMap>;
  const online = signal(true);
  let prizeDrawsApi: {
    availability: ReturnType<typeof vi.fn>;
    watch: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    routeParams = new Subject<ParamMap>();
    online.set(true);
    prizeDrawsApi = {
      availability: vi.fn(() => of([])),
      watch: vi.fn(() => NEVER),
    };
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
            isOnline: online,
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: routeParams,
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
        {
          provide: PublicPrizeDrawApiService,
          useValue: prizeDrawsApi,
        },
      ],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(AttendancesApiService), 'getSubscriberInformation').mockReturnValue(of(null));
    vi.spyOn(TestBed.inject(AttendancesApiService), 'getSubscriberInformationForEvents').mockReturnValue(of([]));
    vi.spyOn(TestBed.inject(AttendancesApiService), 'getCurrentUserCertificatesForTargets').mockReturnValue(of([]));
    vi.spyOn(TestBed.inject(AttendancesApiService), 'getCertificateParticipation').mockReturnValue(
      of({ status: 'ATTENDANCE_CONFIRMED' }),
    );
    fixture = TestBed.createComponent(MoreInfo);
    component = fixture.componentInstance;
  });

  afterEach(() => httpTesting.verify());

  it.each([false, true])(
    'renders certificate availability independently of issuance setting %s',
    async (shouldIssueCertificate) => {
      fixture.detectChanges();
      routeParams.next(convertToParamMap({ eventType: 'event', eventId: 'event-1' }));
      await fixture.whenStable();
      const detailsRequest = expectGraphqlRequest(httpTesting, 'CurrentUserEventDetails');
      const certificatesRequest = expectGraphqlRequest(httpTesting, 'CurrentUserCertificates');
      const organizerRequest = expectGraphqlRequest(httpTesting, 'CurrentUserOrganizerInfo');
      const publicEventRequest = expectGraphqlRequest(httpTesting, 'PublicEventForAttendanceDetails');

      detailsRequest.flush({
        data: {
          currentUserEventSubscription: {
            eventId: 'event-1',
            eventGroupSubscriptionId: null,
            createdAt: publicFixtureDateFromNow(-1, 12),
            event: {
              id: 'event-1',
              name: 'Evento teste',
              creditMinutes: 60,
              startDate: publicFixtureDateFromNow(1, 12),
              endDate: publicFixtureDateFromNow(1, 14),
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
              shouldIssueCertificate,
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
            startDate: publicFixtureDateFromNow(1, 12),
            endDate: publicFixtureDateFromNow(1, 14),
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
            shouldIssueCertificate,
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
      certificatesRequest.flush({
        data: {
          currentUserCertificates: [],
        },
      });
      organizerRequest.flush({
        data: {
          currentUserOrganizerInfo: null,
        },
      });
      publicEventRequest.flush({
        data: {
          publicEvent: null,
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const formsRequest = expectGraphqlRequest(httpTesting, 'CurrentUserEventForms');
      formsRequest.flush({
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
      expect(host.textContent).toContain('Meu certificado');
      expect(host.textContent).toContain('O certificado aguarda a liberação da organização.');
      expect(
        Array.from(host.querySelectorAll('button')).some(
          (button) => button.textContent?.trim() === 'workspace_premium Certificados',
        ),
      ).toBe(false);
      const certificatesApi = vi.mocked(TestBed.inject(AttendancesApiService).getCurrentUserCertificatesForTargets);
      certificatesApi.mockReturnValueOnce(throwError(() => new Error('Unavailable')));
      component.retryCertificates();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.textContent).toContain('Não foi possível consultar');
      certificatesApi.mockReturnValueOnce(
        of([
          {
            id: 'issued',
            configId: 'config',
            issuedAt: publicFixtureDateFromNow(-1, 12),
            config: {
              id: 'config',
              name: 'Participação',
              scope: 'EVENT',
              certificateTemplate: { id: 'template', name: 'Modelo' },
            },
            certificateTemplate: { id: 'template', name: 'Modelo' },
          },
        ]),
      );
      component.retryCertificates();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.issuedCertificates()).toHaveLength(1);
      expect(host.textContent).toContain('Certificado disponível');
      expect(host.textContent).toContain('Baixar certificado');
      online.set(false);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.textContent).toContain('Conecte-se à internet');
      online.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.certificateState().status).toBe('ready');
    },
  );

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

  it('updates participation prize-draw discovery live and preserves it on refresh failure', async () => {
    const updates = new Subject<void>();
    prizeDrawsApi.availability
      .mockReset()
      .mockReturnValueOnce(of([]))
      .mockReturnValueOnce(of([{ targetType: 'EVENT', targetId: 'event-1', drawCount: 1 }]))
      .mockReturnValueOnce(throwError(() => new Error('Falha transitória')))
      .mockReturnValueOnce(of([]));
    prizeDrawsApi.watch.mockReturnValue(updates);

    fixture.detectChanges();
    routeParams.next(convertToParamMap({ eventType: 'event', eventId: 'event-1' }));
    await fixture.whenStable();
    const detailsRequest = expectGraphqlRequest(httpTesting, 'CurrentUserEventDetails');
    const certificatesRequest = expectGraphqlRequest(httpTesting, 'CurrentUserCertificates');
    const organizerRequest = expectGraphqlRequest(httpTesting, 'CurrentUserOrganizerInfo');
    const publicEventRequest = expectGraphqlRequest(httpTesting, 'PublicEventForAttendanceDetails');

    detailsRequest.flush({
      data: {
        currentUserEventSubscription: {
          eventId: 'event-1',
          eventGroupSubscriptionId: null,
          createdAt: publicFixtureDateFromNow(-1, 12),
          event: createPublicEvent({
            id: 'event-1',
            name: 'Evento teste',
            startDate: publicFixtureDateFromNow(1, 12),
            endDate: publicFixtureDateFromNow(1, 14),
          }),
        },
        currentUserEventAttendance: null,
      },
    });
    certificatesRequest.flush({ data: { currentUserCertificates: [] } });
    organizerRequest.flush({ data: { currentUserOrganizerInfo: null } });
    publicEventRequest.flush({ data: { publicEvent: null } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const formsRequest = expectGraphqlRequest(httpTesting, 'CurrentUserEventForms');
    formsRequest.flush({ data: { currentUserEventForms: [] } });
    await fixture.whenStable();

    expect(component.detailState()).toEqual(expect.objectContaining({ status: 'ready', hasPrizeDraws: false }));

    updates.next();
    await waitForDrawRefresh(fixture);
    expect(component.detailState()).toEqual(expect.objectContaining({ status: 'ready', hasPrizeDraws: true }));

    updates.next();
    await waitForDrawRefresh(fixture);
    expect(component.detailState()).toEqual(expect.objectContaining({ status: 'ready', hasPrizeDraws: true }));

    updates.next();
    await waitForDrawRefresh(fixture);
    expect(component.detailState()).toEqual(expect.objectContaining({ status: 'ready', hasPrizeDraws: false }));
  });
});

async function waitForDrawRefresh(fixture: ComponentFixture<MoreInfo>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 120));
  await fixture.whenStable();
}

function expectGraphqlRequest(httpTesting: HttpTestingController, operationName: string) {
  return httpTesting.expectOne(
    (request) => request.url === '/api/graphql' && String(request.body?.query).includes(`query ${operationName}`),
    `Expected exactly one /api/graphql request for ${operationName}`,
  );
}
