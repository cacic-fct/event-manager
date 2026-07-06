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
    expect(fixture.nativeElement.textContent).toContain('Nenhuma inscrição em grande evento.');
    expect(fixture.nativeElement.textContent).toContain('Nenhum evento avulso ou grupo inscrito.');
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
    const folder = subscriptionsFeedFixture.standaloneCertificateFolders![0];

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
  attendances: [{ eventId: 'event-1', attendedAt: '2026-07-01T12:30:00.000Z' }],
};

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
};
