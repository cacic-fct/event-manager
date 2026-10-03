import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { createTicketPurchaseOption } from '@cacic-fct/shared-ticketing/testing';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AnalyticsService } from '../../../analytics/analytics.service';
import { PublicPrizeDrawApiService } from '../../../prize-draws/prize-draw-api.service';
import { PublicEventFormApiService } from '../../../forms/event-form-api.service';
import { TicketingApiService } from '../../ticketing/ticketing-api.service';
import { AttendancesApiService } from '../attendances-api.service';
import { MoreInfo } from './more-info';
import { of } from 'rxjs';

describe('MoreInfo ticket purchase placement integration', () => {
  let http: HttpTestingController;

  afterEach(() => {
    http?.verify();
    TestBed.resetTestingModule();
  });

  async function setup(subscriptionStatus: string): Promise<ComponentFixture<MoreInfo>> {
    const majorEvent = createPublicMajorEvent({
      id: 'major-1',
      name: 'Congresso com festa paga',
      emoji: '🎓',
      startDate: new Date(Date.now() + 86_400_000).toISOString(),
      endDate: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      description: 'Informações gerais do congresso.',
    });
    const subscription = {
      id: 'subscription-1',
      majorEventId: 'major-1',
      majorEvent,
      subscriptionStatus,
      amountPaid: 10000,
      paymentTier: 'Estudante',
      selectedEvents: [],
      notSubscribedEvents: [],
    };
    await TestBed.configureTestingModule({
      imports: [MoreInfo],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ eventType: 'major-event', eventId: 'major-1' }) },
            paramMap: of(convertToParamMap({ eventType: 'major-event', eventId: 'major-1' })),
          },
        },
        { provide: AuthService, useValue: { user: () => ({ sub: 'user-1' }) } },
        { provide: NetworkStatusService, useValue: { isOnline: () => true } },
        {
          provide: PublicDataAccessService,
          useValue: { replaceAttendanceDetail: () => Promise.resolve(), getAttendanceDetail: () => Promise.resolve(null) },
        },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: AttendancesApiService, useValue: { getMajorEventDetails: () => of({ subscription, attendances: [] }) } },
        { provide: PublicEventFormApiService, useValue: { listCurrentUserForms: () => of([]) } },
        { provide: PublicPrizeDrawApiService, useValue: { availability: () => of([]), watch: () => of() } },
        { provide: TicketingApiService, useValue: { watchCurrentUser: () => of() } },
        { provide: AnalyticsService, useValue: { trackEvent: vi.fn(), trackMajorEventTransaction: vi.fn() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(MoreInfo);
  }

  it('places confirmed ticket offers after participation actions and before event details', async () => {
    const fixture = await setup('CONFIRMED');
    fixture.detectChanges();
    const optionsRequest = http.expectOne((request) => request.url === '/api/graphql' && request.body.query.includes('myTicketPurchaseOptions'));
    optionsRequest.flush({ data: { myTicketPurchaseOptions: [createTicketPurchaseOption({
      eventId: 'party-event',
      majorEventId: 'major-1',
      ticketConfigId: 'party-config',
      name: 'Festa de encerramento',
      event: { id: 'party-event', name: 'Festa de encerramento' },
    })] } });
    const purchasesRequest = http.expectOne((request) => request.url === '/api/graphql' && request.body.query.includes('myTicketPurchases'));
    purchasesRequest.flush({ data: { myTicketPurchases: [] } });
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const actions = host.querySelector('.actions');
    const offers = host.querySelector('.ticket-purchase-section');
    const about = Array.from(host.querySelectorAll('.detail-section')).find((section) => section.querySelector('h2')?.textContent?.trim() === 'Sobre');
    expect(actions).not.toBeNull();
    expect(offers).not.toBeNull();
    expect(about).not.toBeUndefined();
    expect(host.textContent).toContain('Bilhetes adicionais');
    expect(host.textContent).toContain('Festa de encerramento');
    if (!actions || !offers || !about) throw new Error('The offer section and surrounding detail sections must render.');
    expect(actions.compareDocumentPosition(offers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(offers.compareDocumentPosition(about) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fixture.destroy();
  });

  it('does not request or reveal add-on offers while the parent receipt is unvalidated', async () => {
    const fixture = await setup('RECEIPT_UNDER_REVIEW');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Bilhetes adicionais');
    expect(http.match((request) => request.url === '/api/graphql' && request.body.query.includes('myTicketPurchaseOptions'))).toHaveLength(0);
    fixture.destroy();
  });
});
