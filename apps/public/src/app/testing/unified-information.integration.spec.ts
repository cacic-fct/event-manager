import './observer-mocks';
import { signal, type Type } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, type TestRequest } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { formatDateTime } from '@cacic-fct/shared-utils';
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

  async function setup<T>(
    component: Type<T>,
    options: ParticipationInformationOptions = {},
    authenticated = true,
    queryParams: Record<string, string> = {},
    holdQuery?: string,
  ) {
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
          useValue: {
            paramMap: of(convertToParamMap(params)),
            queryParamMap: of(convertToParamMap(queryParams)),
          },
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
    const heldRequests: TestRequest[] = [];
    let holding = Boolean(holdQuery);
    fixture.detectChanges();
    function flush(request: TestRequest) {
      request.flush({
        data: participationInformationGraphqlData(
          request.request.body.query,
          request.request.body.variables ?? {},
          data,
        ),
      });
    }
    async function settleRequests() {
      for (let pass = 0; pass < 8; pass++) {
        await fixture.whenStable();
        for (const request of http.match('/api/graphql')) {
          queries.push(request.request.body.query);
          if (holding && request.request.body.query.includes(`query ${holdQuery}(`)) {
            heldRequests.push(request);
          } else {
            flush(request);
          }
        }
        fixture.detectChanges();
      }
    }
    await settleRequests();
    async function releaseRequests() {
      expect(heldRequests).toHaveLength(1);
      holding = false;
      heldRequests.splice(0).forEach(flush);
      fixture.detectChanges();
      await settleRequests();
    }
    return {
      fixture,
      data,
      host: fixture.nativeElement as HTMLElement,
      queries,
      getMaterials,
      settleRequests,
      releaseRequests,
    };
  }

  it('keeps the public major-event program hidden until the subscription check resolves', async () => {
    const { host, releaseRequests } = await setup(
      MajorEventInfoPage,
      { targetType: 'major-event' },
      true,
      {},
      'CurrentUserMajorEventSubscription',
    );
    expect(host.querySelector('h1')).toBeTruthy();
    expect(host.textContent).toContain('Consultando sua participação…');
    expect(host.querySelector('#program-heading')).toBeNull();
    expect(host.querySelector('[role="tablist"]')).toBeNull();

    await releaseRequests();
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Minha inscrição');
    expect(host.querySelector('#program-heading')).toBeNull();
  });

  it('waits for group participation before showing the activity list and registration guidance', async () => {
    const { host, releaseRequests } = await setup(
      EventGroupInfoPage,
      { targetType: 'event-group' },
      true,
      {},
      'CurrentUserEventGroupDetails',
    );
    expect(host.querySelector('h1')).toBeTruthy();
    expect(host.textContent).toContain('Consultando sua participação…');
    expect(host.querySelector('#group-program-heading')).toBeNull();
    expect(host.querySelector('#group-registration-heading')).toBeNull();

    await releaseRequests();
    expect(host.querySelector('#group-program-heading')).toBeTruthy();
    expect(host.querySelector('#workspace-heading')).toBeTruthy();
    expect(host.querySelector('#group-registration-heading')).toBeNull();
  });

  it('waits for certificate-only participation before inserting public event information below it', async () => {
    const { host, releaseRequests } = await setup(
      Event,
      { subscribed: false, issuedCertificate: true },
      true,
      {},
      'CurrentUserEventDetails',
    );
    expect(host.querySelector('h1')).toBeTruthy();
    expect(host.textContent).toContain('Consultando sua participação…');
    expect(host.querySelector('.detail-section')).toBeNull();

    await releaseRequests();
    expect(host.querySelector('#certificate-heading')).toBeTruthy();
    expect(host.querySelector('.detail-section')).toBeTruthy();
    expect(host.querySelector('[role="tablist"]')).toBeNull();
  });

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
    expect(host.textContent).toContain('Certificado');
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
    expect(general?.textContent).not.toContain('Certificado');
    expect(host.querySelector('.reference-information')).not.toBeNull();
    await selectTab(fixture, 0);
    http.expectNone((request) => request.body?.query?.includes('query CurrentUserEventDetails'));
    expect(host.querySelectorAll('app-more-info')).toHaveLength(1);
  });

  it('keeps guests on a public view without fetching private participation data', async () => {
    const { host, queries } = await setup(Event, { subscribed: false }, false);
    expect(host.textContent).toContain('Entrar para inscrever-se');
    expect(host.textContent).not.toContain('Certificado');
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(queries.some((query) => query.includes('query CurrentUserEventDetails'))).toBe(false);
  });

  it.each([true, false])('shows a child event’s attendance with subscription = %s', async (subscribed) => {
    const { host, data } = await setup(Event, { underMajorEvent: true, attended: true, subscribed });
    const summary = host.querySelector('app-major-event-participation-summary');
    const timestamp = data.attendances[0].attendedAt;
    expect(summary?.textContent).toContain('Sua participação');
    expect(summary?.querySelector('time')?.getAttribute('datetime')).toBe(timestamp);
    expect(summary?.textContent).toContain(formatDateTime(timestamp));
    expect(summary?.textContent?.includes(`incluído na sua inscrição em ${data.majorEvent.name}`)).toBe(subscribed);
    expect(Boolean(host.querySelector('[role="tablist"]'))).toBe(subscribed);
    expect(host.textContent).not.toContain('Cancelar inscrição');
  });

  it('summarizes only the registered and attended activities of a group under a major event', async () => {
    const { host, data } = await setup(EventGroupInfoPage, {
      targetType: 'event-group',
      underMajorEvent: true,
      subscribedEventCount: 2,
      attendedEventCount: 1,
    });
    const summary = host.querySelector('app-major-event-participation-summary');
    expect(summary?.textContent).toContain(`2 eventos do grupo incluídos na sua inscrição em ${data.majorEvent.name}.`);
    expect(summary?.textContent).toContain('Presença registrada em 1 evento.');
    const program = host.querySelector('#group-program-heading')?.parentElement;
    expect(program?.querySelectorAll('app-calendar-event-list-item')).toHaveLength(3);
    expect(program?.textContent).toContain(formatDateTime(data.attendances[0].attendedAt));
    expect(host.querySelector('.parent-event-link')?.getAttribute('href')).toContain(
      `/major-event/${data.majorEvent.id}`,
    );
    expect(host.querySelector('#group-registration-heading')).toBeNull();
  });

  it('shows the nested group program to guests without looking up private participation', async () => {
    const { host, queries } = await setup(
      EventGroupInfoPage,
      { targetType: 'event-group', underMajorEvent: true },
      false,
    );
    expect(host.querySelector('#group-program-heading')).not.toBeNull();
    expect(host.querySelector('app-major-event-participation-summary')).toBeNull();
    expect(queries.some((query) => query.includes('query CurrentUserMajorEventGroupParticipation'))).toBe(false);
  });

  it('links a grouped activity to its group and the major event', async () => {
    const { host, data } = await setup(Event, { targetType: 'event-group', underMajorEvent: true });
    const hrefs = [...host.querySelectorAll<HTMLAnchorElement>('.parent-event-link')].map((link) => link.pathname);
    expect(hrefs).toEqual([`/major-event/${data.majorEvent.id}`, `/event-group/${data.eventGroup.id}`]);
  });

  it('shows the full major-event program with the signed-in person’s payment and participation tools', async () => {
    const { host, data, fixture, queries, getMaterials } = await setup(MajorEventInfoPage, {
      targetType: 'major-event',
      subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
    });
    expect(host.querySelectorAll('h1')).toHaveLength(1);
    expect(host.textContent).toContain('Enviar comprovante');
    expect(host.textContent).toContain('Certificado');
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
    expect(host.textContent).toContain('Certificado');
  });

  it('omits empty materials and shows available group guidance in its own panel', async () => {
    const { host, fixture, data, getMaterials, settleRequests } = await setup(EventGroupInfoPage, {
      targetType: 'event-group',
      eventCount: 3,
    });
    expect(getMaterials).toHaveBeenCalledTimes(data.events.length);
    expect(host.querySelector('mat-expansion-panel.empty-section')?.textContent).toContain('Materiais');
    const panels = Array.from(host.querySelectorAll<HTMLElement>('mat-expansion-panel-header'));
    const guidance = panels.find((panel) => panel.textContent?.trim() === 'Orientações');
    expect(guidance).toBeDefined();
    guidance?.click();
    fixture.detectChanges();
    await settleRequests();
    expect(host.textContent).toContain('Leve seu notebook');
  });

  it('keeps the certificate visible and omits empty participation tools for a certificate-only major event', async () => {
    const { host } = await setup(MajorEventInfoPage, {
      targetType: 'major-event',
      subscribed: false,
      issuedCertificate: true,
    });

    expect(host.textContent).toContain('Baixar certificado');
    expect(host.textContent).not.toMatch(/Sua participação|Eventos com participação|Detalhes da participação/);
    expect(host.querySelector('mat-expansion-panel')).toBeNull();
  });

  it('shows recorded attendance without labeling the person as subscribed', async () => {
    const { fixture, host } = await setup(MajorEventInfoPage, {
      targetType: 'major-event',
      subscribed: false,
      attended: true,
    });
    const header = host.querySelector<HTMLElement>('mat-expansion-panel-header');
    expect(header?.textContent).toContain('Eventos com presença registrada');
    header?.click();
    fixture.detectChanges();
    expect(host.querySelector('[aria-label^="Presença registrada em"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Não inscrito"]')).not.toBeNull();
  });

  it('omits guidance for an unsubscribed group when none is available', async () => {
    const { host } = await setup(EventGroupInfoPage, {
      targetType: 'event-group',
      subscribed: false,
      attended: true,
    });
    expect(host.querySelector('app-subscriber-information mat-expansion-panel')).toBeNull();
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

  it('restores later pages of a major-event program when returning from an activity', async () => {
    const { host, data, queries } = await setup(
      MajorEventInfoPage,
      { targetType: 'major-event', eventCount: 101, subscribed: false },
      false,
      { programPages: '2' },
    );

    const program = host.querySelector('section.program');
    expect(program?.querySelectorAll('a')).toHaveLength(data.events.length);
    expect(program?.textContent).toContain(data.events[0].name);
    expect(program?.textContent).toContain(data.events[100].name);
    expect(program?.textContent).not.toContain('Carregar mais atividades');
    expect(queries.filter((query) => query.includes('query PublicMajorEventProgram'))).toHaveLength(2);
  });

  it('preserves the certificate-only experience on the unified event page', async () => {
    const { host } = await setup(Event, { subscribed: false, issuedCertificate: true });
    expect(host.querySelector('[role="tablist"]')).toBeNull();
    expect(host.textContent).toContain('Baixar certificado');
    expect(host.textContent).not.toContain('Cancelar inscrição');
  });
});
