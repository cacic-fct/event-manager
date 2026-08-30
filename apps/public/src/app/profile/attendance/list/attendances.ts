import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import {
  compareIsoDateDesc,
  CurrentUserMajorEventFeedItem,
  SubscribedItem,
  SubscriptionsFeed,
  getMajorEventStatusLine,
  getEventTypeLabel,
  getSubscribedItemEmoji,
  getSubscribedItemStatusLine,
  getSubscribedItemTitle,
  sortSubscriptionsFeed,
} from '@cacic-fct/shared-utils';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { EMPTY, catchError, finalize, from, interval, map, of, startWith, switchMap, tap } from 'rxjs';
import { format, isSameDay, isSameMonth, isSameYear, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendancesApiService } from '../attendances-api.service';
import { EmojiService } from '../../../shared/emoji.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { HttpErrorResponse } from '@angular/common/http';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { CertificateDialog, CertificateDialogData } from '../certificate-dialog/certificate-dialog';
import type { StandaloneCertificateFolderItem, SubscribedEventGroupItem } from '@cacic-fct/shared-utils';
import { RealtimeInvalidationService } from '../../../shared/realtime-invalidation.service';

type ParticipationTypeFilter = 'majorEvent' | 'eventGroup' | 'event';
type AttendanceStatusFilter = 'subscribed' | 'present' | 'certificate' | 'lecturer' | 'sportsManager';

type FeedState =
  | { status: 'loading' }
  | { status: 'ready'; data: NormalizedSubscriptionsFeed }
  | { status: 'error'; message: string };

type NormalizedSubscriptionsFeed = Omit<SubscriptionsFeed, 'standaloneCertificateFolders'> & {
  standaloneCertificateFolders: StandaloneCertificateFolderItem[];
};

interface AttendanceFilterOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: string;
}

interface AttendanceStatusIcon {
  label: string;
  icon: string;
}

interface AttendanceWarning {
  text: string;
  icon: string;
}

interface ParticipationFeedItem {
  id: string;
  emoji: string;
  title: string;
  dateLine: string;
  startDate: string;
  type: ParticipationTypeFilter;
  typeLabel: string;
  route: string[];
  statusLine: string;
  statuses: AttendanceStatusFilter[];
  warnings: AttendanceWarning[];
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
    MatProgressBarModule,
    MatProgressSpinnerModule,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
})
export class Attendances {
  private readonly api = inject(AttendancesApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineData = inject(PublicDataAccessService);
  private readonly certificateFileDownload = inject(CertificateFileDownloadService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly realtime = inject(RealtimeInvalidationService);
  readonly emoji = inject(EmojiService);
  readonly isDownloadingCertificates = signal(false);
  private readonly certificateArchiveCooldownEndsAt = signal(0);
  private readonly cooldownClock = toSignal(
    isPlatformBrowser(this.platformId) ? interval(1_000).pipe(startWith(0)) : of(0),
    { initialValue: 0 },
  );
  readonly certificateArchiveCooldownSeconds = computed(() => {
    this.cooldownClock();
    return Math.max(0, Math.ceil((this.certificateArchiveCooldownEndsAt() - Date.now()) / 1_000));
  });
  readonly isCertificateArchiveDownloadDisabled = computed(
    () => this.isDownloadingCertificates() || this.certificateArchiveCooldownSeconds() > 0,
  );
  readonly certificateArchiveCooldownTime = computed(() =>
    this.formatCooldown(this.certificateArchiveCooldownSeconds()),
  );
  readonly certificateArchiveDownloadButtonLabel = computed(() => {
    if (this.isDownloadingCertificates()) {
      return 'Preparando certificados';
    }

    return this.certificateArchiveCooldownSeconds() > 0
      ? `Disponível em ${this.certificateArchiveCooldownTime()}`
      : 'Baixar todos os certificados';
  });
  readonly filtersOpen = signal(false);
  readonly selectedTypeFilters = signal<ParticipationTypeFilter[]>([]);
  readonly selectedStatusFilters = signal<AttendanceStatusFilter[]>([]);
  readonly typeFilterOptions: AttendanceFilterOption<ParticipationTypeFilter>[] = [
    { value: 'majorEvent', label: 'Grandes eventos' },
    { value: 'eventGroup', label: 'Grupos de eventos' },
    { value: 'event', label: 'Eventos' },
  ];
  readonly statusFilterOptions: AttendanceFilterOption<AttendanceStatusFilter>[] = [
    { value: 'subscribed', label: 'Inscrito', icon: 'event_available' },
    { value: 'present', label: 'Presença registrada', icon: 'how_to_reg' },
    { value: 'certificate', label: 'Certificado emitido', icon: 'workspace_premium' },
    { value: 'lecturer', label: 'Palestrante', icon: 'record_voice_over' },
    { value: 'sportsManager', label: 'Gestão esportiva', icon: 'sports' },
  ];
  private readonly feedRefresh = signal(0);
  private feedLoaded = false;

  readonly feedState = toSignal(
    toObservable(this.feedRefresh).pipe(
      switchMap(() =>
        this.loadFeed().pipe(
          map(
            (feed): FeedState => ({
              status: 'ready',
              data: this.normalizeFeed(feed),
            }),
          ),
          tap(() => (this.feedLoaded = true)),
          catchError((error: unknown) =>
            this.feedLoaded
              ? EMPTY
              : of({
                  status: 'error',
                  message: error instanceof Error ? error.message : 'Não foi possível carregar suas inscrições.',
                } satisfies FeedState),
          ),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies FeedState },
  );

  constructor() {
    this.realtime
      .watchCurrentUserData()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.feedRefresh.update((value) => value + 1));
    this.realtime
      .watchCatalog()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.feedRefresh.update((value) => value + 1));
  }

  readonly activeFilterCount = computed(() => this.selectedTypeFilters().length + this.selectedStatusFilters().length);

  readonly visibleParticipations = computed(() => {
    const state = this.feedState();
    if (state.status !== 'ready') {
      return [];
    }

    return [
      ...state.data.majorEventItems.map((item) => this.majorEventFeedItem(item, state.data.attendances)),
      ...state.data.eventItems.map((item) => this.eventFeedItem(item, state.data.attendances)),
    ]
      .filter((item) => this.matchesFilters(item))
      .sort((left, right) => compareIsoDateDesc(left.startDate, right.startDate));
  });

  readonly hasParticipations = computed(() => {
    const state = this.feedState();
    return state.status === 'ready' && state.data.majorEventItems.length + state.data.eventItems.length > 0;
  });

  toggleFilters(): void {
    this.filtersOpen.update((isOpen) => !isOpen);
  }

  setTypeFilter(filter: ParticipationTypeFilter, selected: boolean): void {
    this.selectedTypeFilters.update((filters) => this.updateFilterSelection(filters, filter, selected));
  }

  setStatusFilter(filter: AttendanceStatusFilter, selected: boolean): void {
    this.selectedStatusFilters.update((filters) => this.updateFilterSelection(filters, filter, selected));
  }

  clearFilters(): void {
    this.selectedTypeFilters.set([]);
    this.selectedStatusFilters.set([]);
  }

  hasActiveFilters(): boolean {
    return this.activeFilterCount() > 0;
  }

  emptyFeedText(): string {
    return this.hasActiveFilters() && this.hasParticipations()
      ? 'Nenhuma participação encontrada para os filtros selecionados.'
      : 'Nenhuma participação encontrada.';
  }

  itemAriaLabel(item: ParticipationFeedItem): string {
    const warnings = item.warnings.length > 0 ? `. Pendências: ${item.warnings.map(({ text }) => text).join(' ')}` : '';
    return `Abrir detalhes de ${item.title}. ${item.typeLabel}. ${item.dateLine}. Status: ${item.statusLine}${warnings}`;
  }

  statusItems(statusLine: string): AttendanceStatusIcon[] {
    return statusLine.split(', ').map((label) => ({
      label,
      icon: this.statusIcon(label),
    }));
  }

  private statusIcon(label: string): string {
    if (label.startsWith('Presença registrada')) {
      return 'how_to_reg';
    }

    switch (label) {
      case 'Inscrito':
        return 'event_available';
      case 'Palestrante':
        return 'record_voice_over';
      case 'Gestão esportiva':
        return 'sports';
      case 'Certificado emitido':
        return 'workspace_premium';
      case 'Comprovante pendente':
        return 'receipt_long';
      case 'Em análise':
        return 'hourglass_top';
      case 'Comprovante inválido':
        return 'error';
      case 'Sem vagas':
        return 'event_busy';
      case 'Conflito de horário':
        return 'schedule';
      case 'Inscrição rejeitada':
        return 'cancel';
      case 'Inscrição cancelada':
        return 'event_busy';
      case 'Sem inscrição':
        return 'person_off';
      default:
        return 'info';
    }
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
    if (this.isCertificateArchiveDownloadDisabled()) {
      return;
    }

    this.isDownloadingCertificates.set(true);
    this.api
      .downloadCurrentUserCertificatesArchive()
      .pipe(finalize(() => this.isDownloadingCertificates.set(false)))
      .subscribe({
        next: (download) => {
          this.certificateFileDownload.saveBlob(download.blob, download.fileName);
          this.startCertificateArchiveCooldown(download.cooldownSeconds);
          this.snackBar.open('Download dos certificados iniciado.', 'Fechar', { duration: 3000 });
        },
        error: (error: unknown) => {
          const retryAfterSeconds = this.retryAfterSeconds(error);
          if (retryAfterSeconds > 0) {
            this.startCertificateArchiveCooldown(retryAfterSeconds);
          }
          const message =
            error instanceof HttpErrorResponse && error.status === 404
              ? 'Nenhum certificado disponível para download.'
              : retryAfterSeconds > 0
                ? 'Aguarde antes de solicitar outro arquivo de certificados.'
                : 'Não foi possível baixar seus certificados.';
          this.snackBar.open(message, 'Fechar', { duration: 5000 });
        },
      });
  }

  private startCertificateArchiveCooldown(seconds: number): void {
    if (seconds > 0) {
      this.certificateArchiveCooldownEndsAt.set(Date.now() + seconds * 1_000);
    }
  }

  private retryAfterSeconds(error: unknown): number {
    if (!(error instanceof HttpErrorResponse)) {
      return 0;
    }

    const retryAfter = error.headers.get('retry-after')?.trim();
    return retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 0;
  }

  private formatCooldown(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
    const sortedFeed = sortSubscriptionsFeed({
      ...feed,
      eventItems: this.mergeStandaloneEventGroupItems(feed.eventItems),
    });

    return {
      ...sortedFeed,
      standaloneCertificateFolders:
        sortedFeed.standaloneCertificateFolders ?? EMPTY_SUBSCRIPTIONS_FEED.standaloneCertificateFolders,
    };
  }

  private mergeStandaloneEventGroupItems(items: SubscribedItem[]): SubscribedItem[] {
    const ungroupedItems: SubscribedItem[] = [];
    const groupedItems = new Map<string, SubscribedEventGroupItem>();

    for (const item of items) {
      if (item.__typename === 'SubscribedEventGroupItem') {
        const existingGroup = groupedItems.get(item.eventGroup.id);
        groupedItems.set(item.eventGroup.id, existingGroup ? this.mergeEventGroupItems(existingGroup, item) : item);
        continue;
      }

      const eventGroupId = item.event.eventGroupId;
      const eventGroup = item.event.eventGroup;
      if (!eventGroupId || !eventGroup || item.event.majorEventId) {
        ungroupedItems.push(item);
        continue;
      }

      const existingGroup = groupedItems.get(eventGroupId);
      const childEventGroup: SubscribedEventGroupItem = {
        __typename: 'SubscribedEventGroupItem',
        id: eventGroupId,
        type: 'group',
        startDate: item.event.startDate,
        eventGroup,
        events: [item.event],
        participation: item.participation,
      };
      groupedItems.set(
        eventGroupId,
        existingGroup ? this.mergeEventGroupItems(existingGroup, childEventGroup) : childEventGroup,
      );
    }

    return [...ungroupedItems, ...groupedItems.values()];
  }

  private mergeEventGroupItems(
    left: SubscribedEventGroupItem,
    right: SubscribedEventGroupItem,
  ): SubscribedEventGroupItem {
    const eventsById = new Map([...left.events, ...right.events].map((event) => [event.id, event]));

    return {
      ...left,
      startDate: left.startDate < right.startDate ? left.startDate : right.startDate,
      events: [...eventsById.values()].sort((first, second) => first.startDate.localeCompare(second.startDate)),
      participation: {
        isSubscribed: left.participation.isSubscribed || right.participation.isSubscribed,
        isLecturer: left.participation.isLecturer || right.participation.isLecturer,
        hasIssuedCertificate: left.participation.hasIssuedCertificate || right.participation.hasIssuedCertificate,
      },
    };
  }

  private majorEventFeedItem(
    item: CurrentUserMajorEventFeedItem,
    attendances: SubscriptionsFeed['attendances'],
  ): ParticipationFeedItem {
    const statusLine = getMajorEventStatusLine(item, attendances);
    const isPresent = attendances.some((attendance) => attendance.event?.majorEventId === item.majorEventId);

    return {
      id: `major-event:${item.id}`,
      emoji: item.majorEvent.emoji,
      title: item.majorEvent.name,
      dateLine: this.participationDateLine(item.majorEvent.startDate, item.majorEvent.endDate),
      startDate: item.majorEvent.startDate,
      type: 'majorEvent',
      typeLabel: item.majorEvent.sportsTournament ? 'Grande evento com torneio' : 'Grande evento',
      route: ['/profile/attendances', 'major-event', item.majorEvent.id],
      statusLine,
      statuses: this.participationStatuses(item.participation, isPresent),
      warnings: this.majorEventWarnings(item.subscriptionStatus),
    };
  }

  private eventFeedItem(item: SubscribedItem, attendances: SubscriptionsFeed['attendances']): ParticipationFeedItem {
    const isSingleEvent = item.__typename === 'SubscribedSingleEventItem';
    const firstEvent = isSingleEvent ? item.event : item.events[0];
    const lastEvent = isSingleEvent ? item.event : item.events[item.events.length - 1];
    const startDate = firstEvent?.startDate ?? item.startDate;
    const endDate = lastEvent?.endDate ?? startDate;
    const statusLine = getSubscribedItemStatusLine(item, attendances);
    const isPresent = this.eventItemHasAttendance(item, attendances);

    return {
      id: `${isSingleEvent ? 'event' : 'event-group'}:${item.id}`,
      emoji: getSubscribedItemEmoji(item),
      title: getSubscribedItemTitle(item),
      dateLine: this.participationDateLine(startDate, endDate),
      startDate,
      type: isSingleEvent ? 'event' : 'eventGroup',
      typeLabel: isSingleEvent ? getEventTypeLabel(item.event.type) : 'Grupo de eventos',
      route: isSingleEvent
        ? ['/profile/attendances', 'event', item.event.id]
        : ['/profile/attendances', 'event-group', item.eventGroup.id],
      statusLine,
      statuses: this.participationStatuses(item.participation, isPresent),
      warnings: [],
    };
  }

  participationDateLine(startDate: string, endDate: string): string {
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const startDay = format(start, 'd', { locale: ptBR });
    const endDay = format(end, 'd', { locale: ptBR });
    const startMonth = this.shortMonth(start);
    const endMonth = this.shortMonth(end);
    const startYear = format(start, 'yyyy', { locale: ptBR });
    const endYear = format(end, 'yyyy', { locale: ptBR });

    if (isSameDay(start, end)) {
      return `${startDay} ${startMonth} ${startYear}, ${format(start, 'HH:mm')}-${format(end, 'HH:mm')}`;
    }

    if (isSameMonth(start, end)) {
      return `${startDay} a ${endDay} ${endMonth} ${endYear}`;
    }

    if (isSameYear(start, end)) {
      return `${startDay} ${startMonth} a ${endDay} ${endMonth} ${endYear}`;
    }

    return `${startDay} ${startMonth} ${startYear} a ${endDay} ${endMonth} ${endYear}`;
  }

  private participationStatuses(
    participation: CurrentUserMajorEventFeedItem['participation'],
    isPresent: boolean,
  ): AttendanceStatusFilter[] {
    return [
      participation.isSubscribed ? 'subscribed' : undefined,
      isPresent ? 'present' : undefined,
      participation.hasIssuedCertificate ? 'certificate' : undefined,
      participation.isLecturer ? 'lecturer' : undefined,
      participation.isSportsManager ? 'sportsManager' : undefined,
    ].filter((status): status is AttendanceStatusFilter => status !== undefined);
  }

  private majorEventWarnings(subscriptionStatus?: string | null): AttendanceWarning[] {
    switch (subscriptionStatus) {
      case undefined:
      case null:
      case 'CONFIRMED':
      case 'RECEIPT_UNDER_REVIEW':
      case 'CANCELED':
        return [];
      case 'WAITING_RECEIPT_UPLOAD':
        return [{ text: 'Envie o comprovante de pagamento.', icon: 'payments' }];
      case 'REJECTED_INVALID_RECEIPT':
        return [{ text: 'Envie um novo comprovante de pagamento.', icon: 'receipt_long' }];
      case 'REJECTED_SCHEDULE_CONFLICT':
        return [{ text: 'Revise os eventos escolhidos.', icon: 'rate_review' }];
      case 'REJECTED_NO_SLOTS':
        return [{ text: 'Revise sua inscrição: não há vagas disponíveis.', icon: 'event_busy' }];
      case 'REJECTED_GENERIC':
        return [{ text: 'Revise sua inscrição para resolver a pendência.', icon: 'warning' }];
      default:
        return [{ text: 'Há uma pendência nesta inscrição.', icon: 'warning' }];
    }
  }

  private matchesFilters(item: ParticipationFeedItem): boolean {
    const typeFilters = this.selectedTypeFilters();
    const statusFilters = this.selectedStatusFilters();
    const matchesType = typeFilters.length === 0 || typeFilters.includes(item.type);
    const matchesStatus = statusFilters.length === 0 || statusFilters.some((filter) => item.statuses.includes(filter));

    return matchesType && matchesStatus;
  }

  private updateFilterSelection<TValue extends string>(
    filters: readonly TValue[],
    filter: TValue,
    selected: boolean,
  ): TValue[] {
    return selected ? [...new Set([...filters, filter])] : filters.filter((value) => value !== filter);
  }

  private shortMonth(date: Date): string {
    return format(date, 'MMM', { locale: ptBR }).replace('.', '');
  }

  private eventItemHasAttendance(item: SubscribedItem, attendances: SubscriptionsFeed['attendances']): boolean {
    if (item.__typename === 'SubscribedSingleEventItem') {
      return attendances.some((attendance) => attendance.eventId === item.event.id);
    }

    if (item.events.length > 0) {
      const eventIds = new Set(item.events.map((event) => event.id));
      return attendances.some((attendance) => eventIds.has(attendance.eventId));
    }

    return attendances.some((attendance) => attendance.event?.eventGroupId === item.eventGroup.id);
  }
}
