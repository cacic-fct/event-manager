import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { of, Subject, throwError } from 'rxjs';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { RealtimeInvalidationService } from '../../../shared/realtime-invalidation.service';
import { AttendancesApiService } from '../attendances-api.service';
import { Attendances } from './attendances';
import { CertificateDialog } from '../certificate-dialog/certificate-dialog';

describe('Attendances', () => {
  it('lists online subscriptions and stores the feed for offline use', async () => {
    const { fixture, offlineData } = await createFixture();

    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('SECOMPP');
    expect(fixture.nativeElement.textContent).toContain('Oficina pública');
    expect(fixture.nativeElement.textContent).toContain('Atividades complementares');
    expect(offlineData.replaceAttendanceFeed).toHaveBeenCalledWith('user-1', subscriptionsFeedFixture);
  });

  it('renders ordered status icons with accessible labels and preserves detailed status text for assistive technology', async () => {
    const { component, fixture } = await createFixture();

    await settle(fixture);

    const statusIcons = Array.from(fixture.nativeElement.querySelectorAll('.status-icon')) as HTMLElement[];
    expect(statusIcons.map((statusIcon) => statusIcon.getAttribute('aria-label'))).toEqual([
      'Certificado emitido',
      'Presença registrada',
      'Certificado emitido',
    ]);
    expect(statusIcons.map((statusIcon) => statusIcon.textContent?.trim())).toEqual([
      'workspace_premium',
      'how_to_reg',
      'workspace_premium',
    ]);
    expect(component.statusItems('Presença registrada em 1 de 2 eventos, Palestrante, Certificado emitido')).toEqual([
      { label: 'Presença registrada em 1 de 2 eventos', icon: 'how_to_reg' },
      { label: 'Palestrante', icon: 'record_voice_over' },
      { label: 'Certificado emitido', icon: 'workspace_premium' },
    ]);
  });

  it('shows actionable pendencies as short text and warning icons with matching accessible labels', async () => {
    const majorEvent = subscriptionsFeedFixture.majorEventItems[0];
    if (!majorEvent) throw new Error('Expected a major-event fixture.');
    const pendingReceipt = { ...majorEvent, id: 'receipt-item', subscriptionStatus: 'WAITING_RECEIPT_UPLOAD' };
    const scheduleConflict = {
      ...majorEvent,
      id: 'schedule-item',
      majorEventId: 'major-2',
      majorEvent: { ...majorEvent.majorEvent, id: 'major-2', name: 'Evento para revisar' },
      subscriptionStatus: 'REJECTED_SCHEDULE_CONFLICT',
    };
    const { component, fixture } = await createFixture({
      onlineFeed: { ...subscriptionsFeedFixture, majorEventItems: [pendingReceipt, scheduleConflict] },
    });

    await settle(fixture);

    const warningMessages = Array.from(fixture.nativeElement.querySelectorAll('.warning-messages')) as HTMLElement[];
    const warningIcons = Array.from(fixture.nativeElement.querySelectorAll('.warning-icon')) as HTMLElement[];
    expect(warningMessages.map(({ textContent }) => textContent?.trim())).toEqual([
      'Envie o comprovante de pagamento.',
      'Revise os eventos escolhidos.',
    ]);
    expect(warningIcons.map(({ textContent }) => textContent?.trim())).toEqual(['payments', 'rate_review']);
    expect(warningIcons.map((icon) => icon.getAttribute('aria-label'))).toEqual([
      'Envie o comprovante de pagamento.',
      'Revise os eventos escolhidos.',
    ]);
    expect(component.visibleParticipations().map((item) => component.itemAriaLabel(item))).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Pendências: Envie o comprovante de pagamento.'),
        expect.stringContaining('Pendências: Revise os eventos escolhidos.'),
      ]),
    );
  });

  it('uses the generic warning icon and copy for an unknown actionable subscription status', async () => {
    const majorEvent = subscriptionsFeedFixture.majorEventItems[0];
    if (!majorEvent) throw new Error('Expected a major-event fixture.');
    const { fixture } = await createFixture({
      onlineFeed: {
        ...subscriptionsFeedFixture,
        majorEventItems: [{ ...majorEvent, subscriptionStatus: 'ACTION_REQUIRED' }],
      },
    });

    await settle(fixture);

    const warningIcon = fixture.nativeElement.querySelector('.warning-icon') as HTMLElement;
    expect(warningIcon.textContent?.trim()).toBe('warning');
    expect(warningIcon.getAttribute('aria-label')).toBe('Há uma pendência nesta inscrição.');
    expect(fixture.nativeElement.querySelector('.warning-messages')?.textContent).toContain(
      'Há uma pendência nesta inscrição.',
    );
  });

  it('uses absolute attendance detail routes', async () => {
    const { component } = await createFixture();
    const majorEvent = component.visibleParticipations().find((item) => item.title === 'SECOMPP');
    const event = component.visibleParticipations().find((item) => item.title === 'Oficina pública');
    if (!majorEvent || !event) {
      throw new Error('Expected attendance fixtures');
    }

    expect(majorEvent.route).toEqual(['/profile/attendances', 'major-event', 'major-1']);
    expect(event.route).toEqual(['/profile/attendances', 'event', 'event-1']);
  });

  it('keeps mixed major-event participation on the regular detail when regular events are selected', async () => {
    const majorEvent = subscriptionsFeedFixture.majorEventItems[0];
    if (!majorEvent) throw new Error('Expected a major-event fixture.');
    const { component } = await createFixture({
      onlineFeed: {
        ...subscriptionsFeedFixture,
        majorEventItems: [
          {
            ...majorEvent,
            majorEvent: {
              ...majorEvent.majorEvent,
              sportsTournament: { id: 'tournament-1', selfSubscriptionEnabled: true, registrationOpen: true },
            },
            selectedEvents: [{ id: 'event-1' }] as never,
          },
        ],
      },
    });

    expect(component.visibleParticipations().find((item) => item.title === 'SECOMPP')?.route).toEqual([
      '/profile/attendances',
      'major-event',
      majorEvent.majorEvent.id,
    ]);
  });

  it('keeps tournament-only participation on the major-event detail so subscription actions remain reachable', async () => {
    const { component } = await createFixture({ onlineFeed: sportsManagerSubscriptionsFeedFixture });
    const tournamentOnlyItem = component
      .visibleParticipations()
      .find((item) => item.title === 'Torneio com gestão esportiva');
    if (!tournamentOnlyItem) throw new Error('Expected a tournament fixture.');

    expect(tournamentOnlyItem.route).toEqual(['/profile/attendances', 'major-event', 'sports-major']);
  });

  it('falls back to the last offline feed when the network request fails', async () => {
    const { fixture, offlineData } = await createFixture({
      onlineFeedError: new Error('offline'),
      offlineFeed: offlineSubscriptionsFeedFixture,
    });

    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Feed salvo');
    expect(offlineData.getAttendanceFeed).toHaveBeenCalledWith('user-1');
  });

  it('refreshes the visible feed from a current-user invalidation and keeps it on a transient failure', async () => {
    const { fixture, component, api, currentUserChanges, offlineData } = await createFixture();
    await settle(fixture);

    const updatedFeed: SubscriptionsFeed = {
      ...subscriptionsFeedFixture,
      majorEventItems: [
        {
          ...subscriptionsFeedFixture.majorEventItems[0],
          majorEvent: {
            ...subscriptionsFeedFixture.majorEventItems[0]?.majorEvent,
            name: 'SECOMPP atualizado',
          },
        },
      ],
    };
    api.getSubscriptionsFeed.mockReturnValueOnce(of(updatedFeed));
    currentUserChanges.next();
    await settle(fixture);

    expect(component.feedState()).toEqual(expect.objectContaining({ status: 'ready' }));
    expect(api.getSubscriptionsFeed).toHaveBeenCalledTimes(2);
    expect(component.visibleParticipations().map((item) => item.title)).toContain('SECOMPP atualizado');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('SECOMPP atualizado');

    offlineData.getAttendanceFeed.mockResolvedValueOnce(updatedFeed);
    api.getSubscriptionsFeed.mockReturnValueOnce(throwError(() => new Error('Falha transitória')));
    currentUserChanges.next();
    await settle(fixture);

    expect(component.feedState()).toEqual(expect.objectContaining({ status: 'ready' }));
    fixture.detectChanges();
    expect(component.visibleParticipations().map((item) => item.title)).toContain('SECOMPP atualizado');
    expect(fixture.nativeElement.textContent).toContain('SECOMPP atualizado');
  });

  it('loads the latest offline user snapshot when the browser is offline', async () => {
    const { fixture, api, offlineData } = await createFixture({
      online: false,
      latestUserSnapshot: { userId: 'offline-user' },
      offlineFeed: offlineSubscriptionsFeedFixture,
      user: null,
    });

    await settle(fixture);

    expect(api.getSubscriptionsFeed).not.toHaveBeenCalled();
    expect(offlineData.getAttendanceFeed).toHaveBeenCalledWith('offline-user');
    expect(fixture.nativeElement.textContent).toContain('Feed salvo');
  });

  it('renders stale offline feeds without standalone certificate folders', async () => {
    const { fixture } = await createFixture({
      online: false,
      latestUserSnapshot: { userId: 'offline-user' },
      offlineFeed: {
        majorEventItems: offlineSubscriptionsFeedFixture.majorEventItems,
        eventItems: offlineSubscriptionsFeedFixture.eventItems,
        attendances: offlineSubscriptionsFeedFixture.attendances,
      },
      user: null,
    });

    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('Feed salvo');
    expect(fixture.nativeElement.textContent).toContain('Nenhum certificado avulso disponível.');
  });

  it('purges offline user data and renders an empty feed when the online user is anonymous', async () => {
    const { fixture, api, offlineData } = await createFixture({ user: null });

    await settle(fixture);

    expect(api.getSubscriptionsFeed).not.toHaveBeenCalled();
    expect(offlineData.purgeUserData).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Nenhuma participação encontrada.');
  });

  it('combines granular type and status filters while keeping attendance-only items', async () => {
    const { component, fixture } = await createFixture({ onlineFeed: filterableSubscriptionsFeedFixture });

    await settle(fixture);

    component.setStatusFilter('present', true);
    fixture.detectChanges();

    expect(component.visibleParticipations().map((item) => item.title)).toEqual(
      expect.arrayContaining([
        'Grande evento com presença',
        'Evento presente sem inscrição',
        'Grupo presente sem inscrição',
        'Grupo com evento filho presente',
      ]),
    );

    component.setTypeFilter('event', true);
    fixture.detectChanges();

    expect(component.visibleParticipations().map((item) => item.title)).toEqual(['Evento presente sem inscrição']);
    expect(fixture.nativeElement.textContent).not.toContain('4 de 6 participações');
  });

  it('filters sports management tournaments alongside major events', async () => {
    const { component, fixture } = await createFixture({ onlineFeed: sportsManagerSubscriptionsFeedFixture });

    await settle(fixture);

    component.setStatusFilter('sportsManager', true);
    fixture.detectChanges();

    const sportsManagerItem = component.visibleParticipations()[0];
    if (!sportsManagerItem) {
      throw new Error('Expected sports management attendance fixture');
    }

    expect(fixture.nativeElement.textContent).toContain('Torneio com gestão esportiva');
    expect(fixture.nativeElement.textContent).not.toContain('Grande evento sem gestão esportiva');
    expect(fixture.nativeElement.textContent).not.toContain('1 de 2 participações');
    expect(sportsManagerItem.route).toEqual(['/profile/attendances', 'major-event', 'sports-major']);
  });

  it('merges standalone event-group children into one event-group item', async () => {
    const { component, fixture } = await createFixture({ onlineFeed: standaloneEventGroupChildrenFeedFixture });

    await settle(fixture);

    expect(component.visibleParticipations()).toEqual([
      expect.objectContaining({
        title: 'Grupo de atividades',
        type: 'eventGroup',
        typeLabel: 'Grupo de eventos',
        route: ['/profile/attendances', 'event-group', 'standalone-group'],
        statuses: ['subscribed', 'certificate'],
      }),
    ]);
    expect(fixture.nativeElement.textContent).toContain('Grupo de atividades');
    expect(fixture.nativeElement.textContent).not.toContain('Primeira atividade do grupo');
    expect(fixture.nativeElement.textContent).not.toContain('Segunda atividade do grupo');
  });

  it('sorts the unified feed by most recent start date and formats compact Portuguese date ranges', async () => {
    const { component } = await createFixture();

    expect(component.visibleParticipations().map((item) => item.title)).toEqual(['SECOMPP', 'Oficina pública']);
    expect(component.participationDateLine('2024-04-26T18:00:00', '2024-04-26T22:00:00')).toBe(
      '26 abr 2024, 18:00-22:00',
    );
    expect(component.participationDateLine('2024-04-26T09:00:00', '2024-04-28T18:00:00')).toBe('26 a 28 abr 2024');
    expect(component.participationDateLine('2024-04-30T09:00:00', '2024-05-02T18:00:00')).toBe('30 abr a 2 mai 2024');
  });

  it('expands and clears the filter panel without participation counters', async () => {
    const { component, fixture } = await createFixture();

    component.toggleFilters();
    fixture.detectChanges();
    const clearFiltersButton = fixture.nativeElement.querySelector('.clear-filters') as HTMLButtonElement;
    expect(clearFiltersButton.disabled).toBe(true);

    component.setTypeFilter('majorEvent', true);
    component.setStatusFilter('certificate', true);
    fixture.detectChanges();

    expect(component.filtersOpen()).toBe(true);
    expect(component.activeFilterCount()).toBe(2);
    expect(clearFiltersButton.disabled).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Tipo de participação');
    expect(fixture.nativeElement.textContent).not.toContain('2 participações');
    expect(fixture.nativeElement.querySelector('.mat-button-toggle-checkbox-wrapper')).toBeNull();

    component.clearFilters();
    fixture.detectChanges();
    expect(component.activeFilterCount()).toBe(0);
    expect(clearFiltersButton.disabled).toBe(true);
  });

  it('downloads all certificates through the shared browser file service', async () => {
    const { component, fileDownload, snackBar } = await createFixture();

    component.downloadCertificatesArchive();

    expect(fileDownload.saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'certificados.zip');
    expect(snackBar.open).toHaveBeenCalledWith('Download dos certificados iniciado.', 'Fechar', { duration: 3000 });
    expect(component.isDownloadingCertificates()).toBe(false);
  });

  it('shows indeterminate progress while the streamed certificate archive is being prepared', async () => {
    const { api, component, fixture } = await createFixture();
    const download = new Subject<{ blob: Blob; fileName: string; cooldownSeconds: number }>();
    api.downloadCurrentUserCertificatesArchive.mockReturnValue(download);

    component.downloadCertificatesArchive();
    fixture.detectChanges();

    expect(component.isDownloadingCertificates()).toBe(true);
    expect(fixture.nativeElement.querySelector('.download-button mat-progress-spinner')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.download-button')?.textContent).toContain('Preparando certificados');

    download.next({ blob: new Blob(['PK']), fileName: 'certificados.zip', cooldownSeconds: 0 });
    download.complete();
    fixture.detectChanges();
    expect(component.isDownloadingCertificates()).toBe(false);
  });

  it('shows the empty-certificates message only for a missing archive', async () => {
    const { api, component, snackBar } = await createFixture();
    api.downloadCurrentUserCertificatesArchive.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 404 })),
    );

    component.downloadCertificatesArchive();

    expect(snackBar.open).toHaveBeenCalledWith('Nenhum certificado disponível para download.', 'Fechar', {
      duration: 5000,
    });
  });

  it('shows the archive cooldown inside the disabled download button after the final permitted download', async () => {
    const { api, component, fixture } = await createFixture();
    api.downloadCurrentUserCertificatesArchive.mockReturnValue(
      of({ blob: new Blob(['PK']), fileName: 'certificados.zip', cooldownSeconds: 900 }),
    );

    component.downloadCertificatesArchive();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.download-button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Disponível em 15:00');
  });

  it('recovers into the cooldown state when another tab receives a rate-limit response', async () => {
    const { api, component, fixture, snackBar } = await createFixture();
    api.downloadCurrentUserCertificatesArchive.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 429,
            headers: new HttpHeaders({ 'retry-after': '900' }),
          }),
      ),
    );

    component.downloadCertificatesArchive();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.download-button')?.textContent).toContain('Disponível em 15:00');
    expect(snackBar.open).toHaveBeenCalledWith('Aguarde antes de solicitar outro arquivo de certificados.', 'Fechar', {
      duration: 5000,
    });
  });

  it('shows a generic message when the archive download fails for another reason', async () => {
    const { api, component, snackBar } = await createFixture();
    api.downloadCurrentUserCertificatesArchive.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    );

    component.downloadCertificatesArchive();

    expect(snackBar.open).toHaveBeenCalledWith('Não foi possível baixar seus certificados.', 'Fechar', {
      duration: 5000,
    });
  });

  it('opens standalone certificate folders in the certificate dialog', async () => {
    const { component, dialog } = await createFixture();
    const folder = subscriptionsFeedFixture.standaloneCertificateFolders?.[0];
    if (!folder) {
      throw new Error('Expected standalone certificate fixture');
    }

    component.openStandaloneCertificates(folder);

    expect(dialog.open).toHaveBeenCalledWith(
      CertificateDialog,
      expect.objectContaining({
        data: {
          title: 'Atividades complementares',
          certificates: folder.certificates,
        },
      }),
    );
  });
});

async function createFixture({
  latestUserSnapshot = null,
  online = true,
  onlineFeed = subscriptionsFeedFixture,
  onlineFeedError = null,
  offlineFeed = null,
  user = { sub: 'user-1' },
}: {
  latestUserSnapshot?: { userId: string } | null;
  online?: boolean;
  onlineFeed?: SubscriptionsFeed;
  onlineFeedError?: Error | null;
  offlineFeed?: SubscriptionsFeed | null;
  user?: { sub: string } | null;
} = {}): Promise<{
  api: {
    getSubscriptionsFeed: ReturnType<typeof vi.fn>;
    downloadCurrentUserCertificatesArchive: ReturnType<typeof vi.fn>;
  };
  component: Attendances;
  fileDownload: { saveBlob: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<Attendances>;
  dialog: { open: ReturnType<typeof vi.fn> };
  offlineData: {
    getAttendanceFeed: ReturnType<typeof vi.fn>;
    getLatestUserSnapshot: ReturnType<typeof vi.fn>;
    purgeUserData: ReturnType<typeof vi.fn>;
    replaceAttendanceFeed: ReturnType<typeof vi.fn>;
  };
  snackBar: { open: ReturnType<typeof vi.fn> };
  currentUserChanges: Subject<void>;
}> {
  const api = {
    getSubscriptionsFeed: vi.fn(() => (onlineFeedError ? throwError(() => onlineFeedError) : of(onlineFeed))),
    downloadCurrentUserCertificatesArchive: vi.fn(() =>
      of({
        blob: new Blob(['PK']),
        fileName: 'certificados.zip',
        cooldownSeconds: 0,
      }),
    ),
  };
  const offlineData = {
    getAttendanceFeed: vi.fn(() => Promise.resolve(offlineFeed)),
    getLatestUserSnapshot: vi.fn(() => Promise.resolve(latestUserSnapshot)),
    purgeUserData: vi.fn(() => Promise.resolve()),
    replaceAttendanceFeed: vi.fn(() => Promise.resolve()),
  };
  const fileDownload = {
    saveBlob: vi.fn(),
  };
  const snackBar = {
    open: vi.fn(),
  };
  const dialog = {
    open: vi.fn(),
  };
  const currentUserChanges = new Subject<void>();
  const catalogChanges = new Subject<void>();

  await TestBed.configureTestingModule({
    imports: [Attendances],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          user: () => user,
        },
      },
      {
        provide: AttendancesApiService,
        useValue: api,
      },
      {
        provide: NetworkStatusService,
        useValue: {
          isOnline: () => online,
        },
      },
      {
        provide: PublicDataAccessService,
        useValue: offlineData,
      },
      {
        provide: CertificateFileDownloadService,
        useValue: fileDownload,
      },
      {
        provide: MatSnackBar,
        useValue: snackBar,
      },
      {
        provide: MatDialog,
        useValue: dialog,
      },
      {
        provide: RealtimeInvalidationService,
        useValue: {
          watchCurrentUserData: vi.fn(() => currentUserChanges),
          watchCatalog: vi.fn(() => catalogChanges),
        },
      },
    ],
  })
    .overrideProvider(MatDialog, { useValue: dialog })
    .overrideProvider(MatSnackBar, { useValue: snackBar })
    .compileComponents();

  const fixture = TestBed.createComponent(Attendances);
  fixture.detectChanges();

  return {
    api,
    component: fixture.componentInstance,
    dialog,
    fileDownload,
    fixture,
    offlineData,
    snackBar,
    currentUserChanges,
  };
}

async function settle(fixture: ComponentFixture<Attendances>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const subscriptionsFeedFixture: SubscriptionsFeed = {
  majorEventItems: [
    {
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
        startDate: publicFixtureDateFromNow(-1),
        endDate: publicFixtureDateFromNow(1, 20),
        description: 'Grande evento.',
      },
      participation: {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: true,
      },
    },
  ],
  eventItems: [
    {
      __typename: 'SubscribedSingleEventItem',
      id: 'event-1',
      type: 'single',
      startDate: '2026-07-01T12:00:00.000Z',
      event: {
        id: 'event-1',
        name: 'Oficina pública',
        startDate: '2026-07-01T12:00:00.000Z',
        endDate: '2026-07-01T14:00:00.000Z',
        emoji: '💻',
        type: 'OTHER',
        description: 'Atividade pública.',
        shortDescription: 'Atividade.',
        locationDescription: 'Auditório',
      },
      participation: {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: true,
      },
    },
  ],
  standaloneCertificateFolders: [
    {
      id: 'folder-1',
      name: 'Atividades complementares',
      emoji: '🏅',
      certificates: [
        {
          id: 'standalone-certificate-1',
          configId: 'standalone-config-1',
          issuedAt: '2026-07-04T12:00:00.000Z',
          config: {
            id: 'standalone-config-1',
            name: 'Certificado avulso',
            scope: 'OTHER' as const,
            certificateText: 'Certificamos a participação.',
            certificateTemplate: {
              id: 'template-1',
              name: 'Modelo',
            },
          },
          certificateTemplate: {
            id: 'template-1',
            name: 'Modelo',
          },
        },
      ],
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
} satisfies SubscriptionsFeed;

const offlineSubscriptionsFeedFixture: SubscriptionsFeed = {
  ...subscriptionsFeedFixture,
  majorEventItems: [
    {
      ...subscriptionsFeedFixture.majorEventItems[0],
      majorEvent: {
        ...subscriptionsFeedFixture.majorEventItems[0].majorEvent,
        name: 'Feed salvo',
      },
    },
  ],
} satisfies SubscriptionsFeed;

const filterableSubscriptionsFeedFixture = {
  majorEventItems: [
    {
      id: 'major-attended',
      majorEventId: 'major-attended',
      majorEvent: {
        id: 'major-attended',
        name: 'Grande evento com presença',
        emoji: '🎓',
        startDate: publicFixtureDateFromNow(-1),
        endDate: publicFixtureDateFromNow(1, 20),
        description: 'Grande evento.',
      },
      participation: {
        isSubscribed: false,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
    {
      id: 'major-subscribed',
      majorEventId: 'major-subscribed',
      majorEvent: {
        id: 'major-subscribed',
        name: 'Grande evento apenas inscrito',
        emoji: '🎓',
        startDate: '2026-06-01T12:00:00.000Z',
        endDate: '2026-06-03T20:00:00.000Z',
        description: 'Grande evento.',
      },
      participation: {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
  ],
  eventItems: [
    {
      __typename: 'SubscribedSingleEventItem',
      id: 'event-attended',
      type: 'single',
      startDate: '2026-07-01T12:00:00.000Z',
      event: {
        id: 'event-attended',
        name: 'Evento presente sem inscrição',
        startDate: '2026-07-01T12:00:00.000Z',
        endDate: '2026-07-01T14:00:00.000Z',
        emoji: '💻',
        type: 'OTHER',
      },
      participation: {
        isSubscribed: false,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
    {
      __typename: 'SubscribedEventGroupItem',
      id: 'group-attended',
      type: 'group',
      startDate: '2026-07-02T12:00:00.000Z',
      eventGroup: {
        id: 'group-attended',
        name: 'Grupo presente sem inscrição',
        emoji: '🧪',
      },
      events: [],
      participation: {
        isSubscribed: false,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
    {
      __typename: 'SubscribedEventGroupItem',
      id: 'group-child-attended',
      type: 'group',
      startDate: '2026-07-03T12:00:00.000Z',
      eventGroup: {
        id: 'group-child-attended',
        name: 'Grupo com evento filho presente',
        emoji: '🧪',
      },
      events: [
        {
          id: 'group-child-attended-event',
          name: 'Atividade do grupo',
          startDate: '2026-07-03T12:00:00.000Z',
          endDate: '2026-07-03T14:00:00.000Z',
          emoji: '💻',
          type: 'OTHER',
        },
      ],
      participation: {
        isSubscribed: false,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
    {
      __typename: 'SubscribedSingleEventItem',
      id: 'event-subscribed',
      type: 'single',
      startDate: '2026-06-01T12:00:00.000Z',
      event: {
        id: 'event-subscribed',
        name: 'Evento apenas inscrito',
        startDate: '2026-06-01T12:00:00.000Z',
        endDate: '2026-06-01T14:00:00.000Z',
        emoji: '💻',
        type: 'OTHER',
      },
      participation: {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
  ],
  attendances: [
    {
      eventId: 'major-child',
      attendedAt: '2026-07-01T12:30:00.000Z',
      event: {
        id: 'major-child',
        majorEventId: 'major-attended',
        eventGroupId: null,
      },
    },
    {
      eventId: 'event-attended',
      attendedAt: '2026-07-01T12:30:00.000Z',
      event: {
        id: 'event-attended',
        majorEventId: null,
        eventGroupId: null,
      },
    },
    {
      eventId: 'group-child-attended-event',
      attendedAt: '2026-07-03T12:30:00.000Z',
      event: {
        id: 'group-child-attended-event',
        majorEventId: null,
        eventGroupId: null,
      },
    },
    {
      eventId: 'group-child',
      attendedAt: '2026-07-02T12:30:00.000Z',
      event: {
        id: 'group-child',
        majorEventId: null,
        eventGroupId: 'group-attended',
      },
    },
  ],
} satisfies SubscriptionsFeed;

const sportsManagerSubscriptionsFeedFixture = {
  majorEventItems: [
    {
      id: 'sports-major',
      majorEventId: 'sports-major',
      majorEvent: {
        id: 'sports-major',
        name: 'Torneio com gestão esportiva',
        emoji: '🏆',
        startDate: publicFixtureDateFromNow(-1),
        endDate: publicFixtureDateFromNow(1, 20),
        description: 'Torneio público.',
        sportsTournament: { id: 'tournament-1', registrationOpen: true },
      },
      participation: {
        isSubscribed: false,
        isLecturer: false,
        hasIssuedCertificate: false,
        isSportsManager: true,
      },
    },
    {
      id: 'regular-major',
      majorEventId: 'regular-major',
      majorEvent: {
        id: 'regular-major',
        name: 'Grande evento sem gestão esportiva',
        emoji: '🎓',
        startDate: publicFixtureDateFromNow(-1),
        endDate: publicFixtureDateFromNow(1, 20),
        description: 'Grande evento.',
      },
      participation: {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
  ],
  eventItems: [],
  standaloneCertificateFolders: [],
  attendances: [],
} satisfies SubscriptionsFeed;

const standaloneEventGroupChildrenFeedFixture = {
  majorEventItems: [],
  eventItems: [
    {
      __typename: 'SubscribedSingleEventItem',
      id: 'group-event-1',
      type: 'single',
      startDate: '2026-07-01T12:00:00.000Z',
      event: {
        id: 'group-event-1',
        name: 'Primeira atividade do grupo',
        startDate: '2026-07-01T12:00:00.000Z',
        endDate: '2026-07-01T14:00:00.000Z',
        emoji: '🧪',
        type: 'OTHER',
        majorEventId: null,
        eventGroupId: 'standalone-group',
        eventGroup: {
          id: 'standalone-group',
          name: 'Grupo de atividades',
          emoji: '🧪',
        },
      },
      participation: {
        isSubscribed: true,
        isLecturer: false,
        hasIssuedCertificate: false,
      },
    },
    {
      __typename: 'SubscribedSingleEventItem',
      id: 'group-event-2',
      type: 'single',
      startDate: '2026-07-02T12:00:00.000Z',
      event: {
        id: 'group-event-2',
        name: 'Segunda atividade do grupo',
        startDate: '2026-07-02T12:00:00.000Z',
        endDate: '2026-07-02T14:00:00.000Z',
        emoji: '🧪',
        type: 'OTHER',
        majorEventId: null,
        eventGroupId: 'standalone-group',
        eventGroup: {
          id: 'standalone-group',
          name: 'Grupo de atividades',
          emoji: '🧪',
        },
      },
      participation: {
        isSubscribed: false,
        isLecturer: false,
        hasIssuedCertificate: true,
      },
    },
  ],
  standaloneCertificateFolders: [],
  attendances: [],
} satisfies SubscriptionsFeed;
