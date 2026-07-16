import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';
import type { SubscriptionsFeed } from '@cacic-fct/shared-utils';
import { of, throwError } from 'rxjs';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendancesApiService } from '../attendances-api.service';
import { Attendances } from './attendances';
import { CertificateDialog } from './certificate-dialog/certificate-dialog';

describe('Attendances', () => {
  it('lists online subscriptions and stores the feed for offline use', async () => {
    const { fixture, offlineData } = await createFixture();

    await settle(fixture);

    expect(fixture.nativeElement.textContent).toContain('SECOMPP');
    expect(fixture.nativeElement.textContent).toContain('Oficina pública');
    expect(fixture.nativeElement.textContent).toContain('Atividades complementares');
    expect(offlineData.replaceAttendanceFeed).toHaveBeenCalledWith('user-1', subscriptionsFeedFixture);
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
    expect(fixture.nativeElement.textContent).toContain('Nenhuma participação em grande evento.');
    expect(fixture.nativeElement.textContent).toContain('Nenhum evento avulso ou grupo registrado.');
  });

  it('filters the feed by attended items without requiring subscriptions', async () => {
    const { component, fixture } = await createFixture({ onlineFeed: filterableSubscriptionsFeedFixture });

    await settle(fixture);

    component.updateFilters(['present']);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Grande evento com presença');
    expect(text).toContain('Evento presente sem inscrição');
    expect(text).toContain('Grupo presente sem inscrição');
    expect(text).toContain('Grupo com evento filho presente');
    expect(text).not.toContain('Grande evento apenas inscrito');
    expect(text).not.toContain('Evento apenas inscrito');
    expect(text).toContain('4 de 6 participações');
  });

  it('merges standalone event-group children into one event-group item', async () => {
    const { component, fixture } = await createFixture({ onlineFeed: standaloneEventGroupChildrenFeedFixture });

    await settle(fixture);

    const eventItems = component.filteredFeed()?.eventItems;
    expect(eventItems).toEqual([
      expect.objectContaining({
        __typename: 'SubscribedEventGroupItem',
        eventGroup: {
          id: 'standalone-group',
          name: 'Grupo de atividades',
        },
        events: [expect.objectContaining({ id: 'group-event-1' }), expect.objectContaining({ id: 'group-event-2' })],
        participation: {
          isSubscribed: true,
          isLecturer: false,
          hasIssuedCertificate: true,
        },
      }),
    ]);
    expect(fixture.nativeElement.textContent).toContain('Grupo de atividades');
    expect(fixture.nativeElement.textContent).not.toContain('Primeira atividade do grupo');
    expect(fixture.nativeElement.textContent).not.toContain('Segunda atividade do grupo');
  });

  it('downloads all certificates through the shared browser file service', async () => {
    const { component, fileDownload, snackBar } = await createFixture();

    component.downloadCertificatesArchive();

    expect(fileDownload.save).toHaveBeenCalledWith({
      fileName: 'certificados.zip',
      mimeType: 'application/zip',
      contentBase64: 'UEs=',
    });
    expect(snackBar.open).toHaveBeenCalledWith('Download dos certificados iniciado.', 'Fechar', { duration: 3000 });
    expect(component.isDownloadingCertificates()).toBe(false);
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
  fileDownload: { save: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<Attendances>;
  dialog: { open: ReturnType<typeof vi.fn> };
  offlineData: {
    getAttendanceFeed: ReturnType<typeof vi.fn>;
    getLatestUserSnapshot: ReturnType<typeof vi.fn>;
    purgeUserData: ReturnType<typeof vi.fn>;
    replaceAttendanceFeed: ReturnType<typeof vi.fn>;
  };
  snackBar: { open: ReturnType<typeof vi.fn> };
}> {
  const api = {
    getSubscriptionsFeed: vi.fn(() => (onlineFeedError ? throwError(() => onlineFeedError) : of(onlineFeed))),
    downloadCurrentUserCertificatesArchive: vi.fn(() =>
      of({
        fileName: 'certificados.zip',
        mimeType: 'application/zip',
        contentBase64: 'UEs=',
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
    save: vi.fn(),
  };
  const snackBar = {
    open: vi.fn(),
  };
  const dialog = {
    open: vi.fn(),
  };

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
        provide: OfflinePublicDataAccessService,
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
        startDate: '2026-07-01T12:00:00.000Z',
        endDate: '2026-07-03T20:00:00.000Z',
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
              version: 1,
            },
          },
          certificateTemplate: {
            id: 'template-1',
            name: 'Modelo',
            version: 1,
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
        startDate: '2026-07-01T12:00:00.000Z',
        endDate: '2026-07-03T20:00:00.000Z',
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
