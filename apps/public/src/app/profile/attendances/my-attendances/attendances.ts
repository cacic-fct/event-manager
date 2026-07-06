import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RouterLink } from '@angular/router';
import {
  CurrentUserMajorEventFeedItem,
  SubscribedItem,
  SubscriptionsFeed,
  getMajorEventDateLine,
  getMajorEventStatusLine,
  getSubscribedItemDateLine,
  getSubscribedItemEmoji,
  getSubscribedItemStatusLine,
  getSubscribedItemTitle,
  sortSubscriptionsFeed,
} from '@cacic-fct/shared-utils';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';
import { catchError, from, map, of, startWith, switchMap } from 'rxjs';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendancesApiService } from '../attendances-api.service';
import { EmojiService } from '../../../shared/emoji.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { CertificateDialog, CertificateDialogData } from './certificate-dialog/certificate-dialog';
import type { StandaloneCertificateFolderItem } from '@cacic-fct/shared-utils';

type AttendanceFilter = 'subscribed' | 'present' | 'certificate' | 'lecturer';
type AttendanceFilterSelection = AttendanceFilter | 'none';

type FeedState =
  | { status: 'loading' }
  | { status: 'ready'; data: NormalizedSubscriptionsFeed }
  | { status: 'error'; message: string };

type NormalizedSubscriptionsFeed = Omit<SubscriptionsFeed, 'standaloneCertificateFolders'> & {
  standaloneCertificateFolders: StandaloneCertificateFolderItem[];
};

interface AttendanceFilterOption {
  value: AttendanceFilter;
  label: string;
}

const EMPTY_SUBSCRIPTIONS_FEED = {
  majorEventItems: [],
  eventItems: [],
  standaloneCertificateFolders: [],
  attendances: [],
} satisfies NormalizedSubscriptionsFeed;

@Component({
  selector: 'app-attendances',
  templateUrl: './attendances.html',
  styleUrl: './attendances.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
})
export class Attendances {
  private readonly api = inject(AttendancesApiService);
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineData = inject(OfflinePublicDataAccessService);
  private readonly certificateFileDownload = inject(CertificateFileDownloadService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  readonly emoji = inject(EmojiService);
  readonly isDownloadingCertificates = signal(false);
  readonly selectedFilters = signal<AttendanceFilter[]>([]);
  readonly filterOptions: AttendanceFilterOption[] = [
    { value: 'subscribed', label: 'Inscrito' },
    { value: 'present', label: 'Presente' },
    { value: 'certificate', label: 'Certificado emitido' },
    { value: 'lecturer', label: 'Palestrante' },
  ];

  readonly feedState = toSignal(
    this.loadFeed().pipe(
      map(
        (feed): FeedState => ({
          status: 'ready',
          data: this.normalizeFeed(feed),
        }),
      ),
      startWith({ status: 'loading' } satisfies FeedState),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível carregar suas inscrições.',
        } satisfies FeedState),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies FeedState },
  );

  readonly filteredFeed = computed(() => {
    const state = this.feedState();
    if (state.status !== 'ready') {
      return null;
    }

    const filters = this.selectedFilters();
    return {
      ...state.data,
      majorEventItems: state.data.majorEventItems.filter((item) =>
        this.matchesMajorEventFilters(item, state.data.attendances, filters),
      ),
      eventItems: state.data.eventItems.filter((item) =>
        this.matchesEventItemFilters(item, state.data.attendances, filters),
      ),
    } satisfies SubscriptionsFeed;
  });

  readonly filterTriggerLabel = computed(() => {
    const filters = this.selectedFilters();
    if (filters.length === 0) {
      return 'Sem filtro';
    }

    return this.filterOptions
      .filter((option) => filters.includes(option.value))
      .map((option) => option.label)
      .join(', ');
  });

  readonly filteredResultSummary = computed(() => {
    const state = this.feedState();
    const feed = this.filteredFeed();
    if (state.status !== 'ready' || !feed) {
      return '';
    }

    const totalCount = state.data.majorEventItems.length + state.data.eventItems.length;
    const visibleCount = feed.majorEventItems.length + feed.eventItems.length;
    if (this.selectedFilters().length === 0) {
      return `${totalCount} participações`;
    }

    return `${visibleCount} de ${totalCount} participações`;
  });

  majorEventRoute(subscription: CurrentUserMajorEventFeedItem): string[] {
    return ['./major-event', subscription.majorEvent.id];
  }

  itemRoute(item: SubscribedItem): string[] {
    if (item.__typename === 'SubscribedSingleEventItem') {
      return ['./event', item.event.id];
    }

    return ['./event-group', item.eventGroup.id];
  }

  itemEmoji(item: SubscribedItem): string {
    return getSubscribedItemEmoji(item);
  }

  itemTitle(item: SubscribedItem): string {
    return getSubscribedItemTitle(item);
  }

  itemDateLine(item: SubscribedItem): string {
    return getSubscribedItemDateLine(item);
  }

  itemStatusLine(item: SubscribedItem, attendances: SubscriptionsFeed['attendances']): string {
    return getSubscribedItemStatusLine(item, attendances);
  }

  majorEventDateLine(subscription: CurrentUserMajorEventFeedItem): string {
    return getMajorEventDateLine(subscription);
  }

  majorEventStatusLine(subscription: CurrentUserMajorEventFeedItem, attendances: SubscriptionsFeed['attendances']): string {
    return getMajorEventStatusLine(subscription, attendances);
  }

  updateFilters(values: readonly AttendanceFilterSelection[]): void {
    if (values.includes('none')) {
      this.selectedFilters.set([]);
      return;
    }

    this.selectedFilters.set(values.filter((value): value is AttendanceFilter => value !== 'none'));
  }

  hasActiveFilters(): boolean {
    return this.selectedFilters().length > 0;
  }

  majorEventsEmptyText(totalCount: number): string {
    if (this.hasActiveFilters() && totalCount > 0) {
      return 'Nenhum grande evento encontrado para os filtros selecionados.';
    }

    return 'Nenhuma participação em grande evento.';
  }

  eventItemsEmptyText(totalCount: number): string {
    if (this.hasActiveFilters() && totalCount > 0) {
      return 'Nenhum evento avulso ou grupo encontrado para os filtros selecionados.';
    }

    return 'Nenhum evento avulso ou grupo registrado.';
  }

  standaloneCertificateLine(folder: StandaloneCertificateFolderItem): string {
    const count = folder.certificates.length;
    return count === 1 ? '1 certificado disponível' : `${count} certificados disponíveis`;
  }

  openStandaloneCertificates(folder: StandaloneCertificateFolderItem): void {
    this.dialog.open<CertificateDialog, CertificateDialogData>(CertificateDialog, {
      data: {
        title: folder.name,
        certificates: folder.certificates,
      },
      width: 'min(560px, 96vw)',
    });
  }

  downloadCertificatesArchive(): void {
    if (this.isDownloadingCertificates()) {
      return;
    }

    this.isDownloadingCertificates.set(true);
    this.api.downloadCurrentUserCertificatesArchive().subscribe({
      next: (download) => {
        this.certificateFileDownload.save(download);
        this.snackBar.open('Download dos certificados iniciado.', 'Fechar', { duration: 3000 });
        this.isDownloadingCertificates.set(false);
      },
      error: (error: unknown) => {
        const message =
          error instanceof Error && error.message.includes('No certificates')
            ? 'Nenhum certificado disponível para download.'
            : 'Não foi possível baixar seus certificados.';
        this.snackBar.open(message, 'Fechar', { duration: 5000 });
        this.isDownloadingCertificates.set(false);
      },
    });
  }

  private loadFeed() {
    const userId = this.auth.user()?.sub;

    if (!this.networkStatus.isOnline()) {
      return from(this.loadOfflineFeed());
    }

    if (!userId) {
      void this.offlineData.purgeUserData();
      return of(EMPTY_SUBSCRIPTIONS_FEED);
    }

    return this.api.getSubscriptionsFeed().pipe(
      switchMap((feed) => from(this.offlineData.replaceAttendanceFeed(userId, feed)).pipe(map(() => feed))),
      catchError(() => from(this.loadOfflineFeed())),
    );
  }

  private async loadOfflineFeed(): Promise<SubscriptionsFeed> {
    const userId = this.auth.user()?.sub ?? (await this.offlineData.getLatestUserSnapshot())?.userId;
    const feed = userId ? await this.offlineData.getAttendanceFeed(userId) : null;

    return feed ?? EMPTY_SUBSCRIPTIONS_FEED;
  }

  private normalizeFeed(feed: SubscriptionsFeed): NormalizedSubscriptionsFeed {
    const sortedFeed = sortSubscriptionsFeed(feed);

    return {
      ...sortedFeed,
      standaloneCertificateFolders:
        sortedFeed.standaloneCertificateFolders ?? EMPTY_SUBSCRIPTIONS_FEED.standaloneCertificateFolders,
    };
  }

  private matchesMajorEventFilters(
    item: CurrentUserMajorEventFeedItem,
    attendances: SubscriptionsFeed['attendances'],
    filters: readonly AttendanceFilter[],
  ): boolean {
    if (filters.length === 0) {
      return true;
    }

    return filters.some((filter) => {
      switch (filter) {
        case 'subscribed':
          return item.participation.isSubscribed;
        case 'present':
          return attendances.some((attendance) => attendance.event?.majorEventId === item.majorEventId);
        case 'certificate':
          return item.participation.hasIssuedCertificate;
        case 'lecturer':
          return item.participation.isLecturer;
      }
    });
  }

  private matchesEventItemFilters(
    item: SubscribedItem,
    attendances: SubscriptionsFeed['attendances'],
    filters: readonly AttendanceFilter[],
  ): boolean {
    if (filters.length === 0) {
      return true;
    }

    return filters.some((filter) => {
      switch (filter) {
        case 'subscribed':
          return item.participation.isSubscribed;
        case 'present':
          return this.eventItemHasAttendance(item, attendances);
        case 'certificate':
          return item.participation.hasIssuedCertificate;
        case 'lecturer':
          return item.participation.isLecturer;
      }
    });
  }

  private eventItemHasAttendance(item: SubscribedItem, attendances: SubscriptionsFeed['attendances']): boolean {
    if (item.__typename === 'SubscribedSingleEventItem') {
      return attendances.some((attendance) => attendance.eventId === item.event.id);
    }

    if (item.events.some((event) => attendances.some((attendance) => attendance.eventId === event.id))) {
      return true;
    }

    return attendances.some((attendance) => attendance.event?.eventGroupId === item.eventGroup.id);
  }
}
