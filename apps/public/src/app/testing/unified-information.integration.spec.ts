import './observer-mocks';
import { signal, type Type } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import {
  createParticipationInformationFixture,
  participationInformationGraphqlData,
  type ParticipationInformationOptions,
} from '@cacic-fct/event-manager-public-testing';
import { NEVER } from 'rxjs';
import { Event } from '../events/detail/event-page';
import { MajorEventInfoPage } from '../major-events/info/major-event-info-page';
import { EventGroupInfoPage } from '../events/group/event-group-info-page';
import { NetworkStatusService } from '../shared/network-status.service';
import { EventSubscriptionRealtimeService } from '../events/detail/subscription-realtime.service';
import { PublicPrizeDrawApiService } from '../prize-draws/prize-draw-api.service';
import { RealtimeInvalidationService } from '../shared/realtime-invalidation.service';
import { of } from 'rxjs';

describe('unified information pages HTTP integration', () => {
  let http: HttpTestingController;
  const navigate = vi.fn();

  afterEach(() => http.verify());

  async function setup<T>(component: Type<T>, options: ParticipationInformationOptions = {}, authenticated = true) {
    const data = createParticipationInformationFixture(options);
    const getMaterials = vi.fn(async () => ({ links: [], updatedAt: null }));
    const params = {
      eventId: data.targetId,
      majorEventId: data.targetId,
      eventGroupId: data.targetId,
      eventType: data.targetType,
    };
    TestBed.configureTestingModule({
      imports: [component],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: signal(authenticated),
            user: () => (authenticated ? { sub: 'participant' } : null),
            login: vi.fn(),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap(params)), queryParamMap: of(convertToParamMap({})) },
        },
        { provide: RouteErrorService, useValue: { navigate } },
        { provide: NetworkStatusService, useValue: { isOnline: signal(true) } },
        {
          provide: PublicDataAccessService,
          useValue: { replaceAttendanceDetail: async () => undefined, getAttendanceDetail: async () => null },
        },
        { provide: EventPreparationApiService, useValue: { getMaterials } },
        { provide: EventSubscriptionRealtimeService, useValue: { watch: () => NEVER } },
        { provide: PublicPrizeDrawApiService, useValue: { availability: () => of([]), watch: () => NEVER } },
        { provide: RealtimeInvalidationService, useValue: { watchCatalog: () => NEVER } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(component);
    const queries: string[] = [];
    fixture.detectChanges();
    async function settleRequests() {
      for (let pass = 0; pass < 8; pass++) {
        await fixture.whenStable();
        for (const request of http.match('/api/graphql')) {
          queries.push(request.request.body.query);
          request.flush({
            data: participationInformationGraphqlData(
              request.request.body.query,
              request.request.body.variables ?? {},
              data,
            ),
          });
        }
        fixture.detectChanges();
      }
    }
    await settleRequests();
    return { fixture, data, host: fixture.nativeElement as HTMLElement, queries, getMaterials, settleRequests };
  }

  async function selectTab<T>(fixture: ComponentFixture<T>, index: number) {
    const tabs = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="tab"]');
    if (!tabs[index]) throw new Error('Expected subscription and information subtabs.');
    tabs[index].click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('defaults to subscription tools and shows public facts only in the general tab', async () => {
    const { host, fixture } = await setup(Event);
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(host.textContent).toContain('Meu certificado');
    expect(host.textContent).toContain('Orientações');
    expect(host.querySelector('.reference-information')).toBeNull();
    const cancellation = host.querySelector('.subscription-management');
    expect(cancellation?.closest('.participation-workspace')).not.toBeNull();
    const certificate = host.querySelector('.certificate-summary');
    expect(
      cancellation &&
        certificate &&
        cancellation.compareDocumentPosition(certificate) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await selectTab(fixture, 1);
    const general = host.querySelector('.mat-mdc-tab-body-active');
    expect(general?.textContent).toContain('Laboratório de informática');
    expect(general?.textContent).not.toContain('Meu certificado');
    expect(host.querySelector('.reference-information')).not.toBeNull();
    await selectTab(fixture, 0);
    http.expectNone((request) => request.body?.query?.includes('query CurrentUserEventDetails'));
    expect(host.querySelectorAll('app-more-info')).toHaveLength(1);
  });

  it('keeps guests on a public view without fetching private participation data', async () => {
    const { host, queries } = await setup(Event, { subscribed: false }, false);
    expect(host.textContent).toContain('Entrar para inscrever-se');
    expect(host.textContent).not.toContain('Meu certificado');
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(queries.some((query) => query.includes('query CurrentUserEventDetails'))).toBe(false);
  });

  it('shows the full major-event program with the signed-in person’s payment and participation tools', async () => {
    const { host, data, fixture, queries, getMaterials } = await setup(MajorEventInfoPage, {
      targetType: 'major-event',
      subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
    });
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.textContent).toContain('Enviar comprovante');
    expect(host.textContent).toContain('Meu certificado');
    expect(host.querySelector('section.program')).toBeNull();
    expect(host.querySelector('mat-expansion-panel')).toBeNull();
    expect(getMaterials).not.toHaveBeenCalled();
    expect(queries.some((query) => query.includes('CurrentUserEventSubscriberInformation'))).toBe(false);
    expect(host.textContent).toContain('Eventos inscritos');
    await selectTab(fixture, 1);
    expect(host.querySelector('.mat-mdc-tab-body-active')?.textContent).toContain('Programação');
    expect(host.querySelector('section.program')?.textContent).toContain(data.events[2].name);
  });

  it('shows an event group’s full activity list and aggregate participation tools', async () => {
    const { host, data } = await setup(EventGroupInfoPage, { targetType: 'event-group', eventCount: 4 });
    expect(host.textContent).toContain('Grupo de eventos');
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.querySelectorAll('section.program a')).toHaveLength(data.events.length);
    expect(host.textContent).toContain('Meu certificado');
  });

  it('keeps group child materials and orientations lazy and available inside their own panels', async () => {
    const { host, fixture, data, getMaterials, settleRequests } = await setup(EventGroupInfoPage, {
      targetType: 'event-group',
      eventCount: 3,
    });
    expect(getMaterials).not.toHaveBeenCalled();
    const panels = Array.from(host.querySelectorAll<HTMLElement>('mat-expansion-panel-header'));
    panels.find((panel) => panel.textContent?.trim() === 'Materiais')?.click();
    fixture.detectChanges();
    await settleRequests();
    expect(getMaterials).toHaveBeenCalledTimes(data.events.length);
    panels.find((panel) => panel.textContent?.trim() === 'Orientações')?.click();
    fixture.detectChanges();
    await settleRequests();
    expect(host.textContent).toContain('Leve seu notebook');
  });

  it('loads the complete public group program beyond the API’s first page', async () => {
    const { host, queries } = await setup(
      EventGroupInfoPage,
      {
        targetType: 'event-group',
        eventCount: 101,
        subscribed: false,
      },
      false,
    );
    expect(host.querySelectorAll('section.program a')).toHaveLength(101);
    expect(queries.filter((query) => query.includes('query PublicEventGroupEvents'))).toHaveLength(2);
  });

  it('preserves the certificate-only experience on the unified event page', async () => {
    const { host } = await setup(Event, { subscribed: false, issuedCertificate: true });
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.textContent).toContain('Baixar certificado');
    expect(host.textContent).not.toContain('Cancelar inscrição');
  });
});
