import { isPlatformBrowser } from '@angular/common';
import type {
  EventFormTargetType,
  EventTargetType,
  PublicEventForm,
  PublicPrizeDrawAvailability,
} from '@cacic-fct/event-manager-public-contracts';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { AuthService, MarkdownComponent } from '@cacic-fct/shared-angular';
import { OfflineAttendanceDetail, PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { DetailViewModel, buildDetailViewModel, parseEventTargetType } from '@cacic-fct/shared-utils';
import { EMPTY, Observable, auditTime, catchError, defer, forkJoin, from, map, of, retry, startWith, switchMap, timer } from 'rxjs';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendancesApiService } from '../attendances-api.service';
import { CertificateDialog, CertificateDialogData } from '../certificate-dialog/certificate-dialog';
import { EmojiService } from '../../../shared/emoji.service';
import { arePublicFormResultsReleased, isPublicFormLinkAvailable } from '../../../forms/event-form-availability';
import { PublicEventFormApiService } from '../../../forms/event-form-api.service';
import { PublicPrizeDrawApiService } from '../../../prize-draws/prize-draw-api.service';

type DetailFormLink = {
  formId: string;
  name: string;
  targetType: EventFormTargetType;
  targetId: string;
  targetName: string;
  mode?: 'answer' | 'results';
};

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: DetailViewModel; formLinks: DetailFormLink[]; hasPrizeDraws: boolean }
  | { status: 'error'; message: string };
type ReadyDetailState = Extract<DetailState, { status: 'ready' }>;

type PrizeDrawTargetType = 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';

const PRIZE_DRAW_INVALIDATION_WINDOW_MS = 100;
const PRIZE_DRAW_RECONNECT_BASE_DELAY_MS = 1000;
const PRIZE_DRAW_RECONNECT_MAX_DELAY_MS = 30_000;

@Component({
  selector: 'app-more-info',
  imports: [
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatToolbarModule,
    MarkdownComponent,
    RouterLink,
  ],
  templateUrl: './more-info.html',
  styleUrl: './more-info.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoreInfo {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AttendancesApiService);
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineData = inject(PublicDataAccessService);
  private readonly dialog = inject(MatDialog);
  private readonly formsApi = inject(PublicEventFormApiService);
  private readonly prizeDrawsApi = inject(PublicPrizeDrawApiService);
  readonly emoji = inject(EmojiService);

  private readonly detailStateSnapshot = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) => this.loadDetailState(params)),
      startWith({ status: 'loading' } satisfies DetailState),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );
  private readonly prizeDrawAvailability = signal<{ snapshot: ReadyDetailState; value: boolean } | null>(null);
  readonly detailState = computed(() => {
    const state = this.detailStateSnapshot();
    if (state.status !== 'ready') {
      return state;
    }

    const liveAvailability = this.prizeDrawAvailability();
    return {
      ...state,
      hasPrizeDraws:
        liveAvailability?.snapshot === state ? liveAvailability.value : state.hasPrizeDraws,
    };
  });
  private readonly prizeDrawTargetType = computed<PrizeDrawTargetType | null>(() => {
    const state = this.detailStateSnapshot();
    if (state.status !== 'ready') {
      return null;
    }

    return {
      event: 'EVENT',
      'event-group': 'EVENT_GROUP',
      'major-event': 'MAJOR_EVENT',
    }[state.detail.targetType] as PrizeDrawTargetType;
  });
  private readonly prizeDrawTargetId = computed(() => {
    const state = this.detailStateSnapshot();
    return state.status === 'ready' ? state.detail.targetId : null;
  });

  private readonly prizeDrawAvailabilityWatcher = effect((onCleanup) => {
    const targetType = this.prizeDrawTargetType();
    const targetId = this.prizeDrawTargetId();
    if (!targetType || !targetId) {
      return;
    }

    const target = { targetType, targetId };
    const invalidations = isPlatformBrowser(this.platformId)
      ? defer(() => this.prizeDrawsApi.watch(target))
          .pipe(
            auditTime(PRIZE_DRAW_INVALIDATION_WINDOW_MS),
            retry({
              delay: (_, retryCount) =>
                timer(
                  Math.min(
                    PRIZE_DRAW_RECONNECT_BASE_DELAY_MS * 2 ** Math.min(retryCount - 1, 5),
                    PRIZE_DRAW_RECONNECT_MAX_DELAY_MS,
                  ),
                ),
            }),
          )
      : EMPTY;
    const subscription = invalidations
      .pipe(
        switchMap(() =>
          this.prizeDrawsApi.availability(this.prizeDrawAvailabilityInput(target)).pipe(
            catchError((): Observable<PublicPrizeDrawAvailability[]> => EMPTY),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((availability) => {
        const state = this.detailStateSnapshot();
        if (
          state.status !== 'ready' ||
          state.detail.targetType !== this.detailTargetType(targetType) ||
          state.detail.targetId !== targetId
        ) {
          return;
        }

        this.prizeDrawAvailability.set({
          snapshot: state,
          value: availability.some((item) => item.drawCount > 0),
        });
      });

    onCleanup(() => subscription.unsubscribe());
  });

  openCertificates(detail: DetailViewModel): void {
    this.dialog.open<CertificateDialog, CertificateDialogData>(CertificateDialog, {
      data: {
        title: detail.title,
        targets: detail.certificateTargets,
      },
      width: 'min(560px, calc(100vw - 32px))',
    });
  }

  registerAttendanceLater(): void {
    console.info('Online attendance registration will be implemented later.');
  }

  eventRoute(eventId: string): string[] {
    return ['/event', eventId];
  }

  eventRouteQueryParams(): { returnUrl: string } {
    return { returnUrl: this.router.url };
  }

  paymentRoute(detail: DetailViewModel): string[] {
    return ['/major-event', detail.targetId, 'payment'];
  }

  sportsPanelRoute(detail: DetailViewModel): string[] {
    return ['/tournament', detail.sportsTournamentId ?? ''];
  }

  representativeTeamRoute(teamId: string): string[] {
    return ['/sports', 'team', teamId];
  }

  organizerInfoRoute(detail: DetailViewModel): string[] {
    return ['/profile', 'attendances', detail.targetType, detail.targetId, 'organizer'];
  }

  prizeDrawRoute(detail: DetailViewModel): string[] {
    return ['/draws', detail.targetType, detail.targetId];
  }

  statusIcon(detail: DetailViewModel): string {
    if (detail.statusLabel === 'Certificado emitido') {
      return 'workspace_premium';
    }

    if (detail.statusLabel === 'Presença registrada' || detail.statusLabel?.startsWith('Presente')) {
      return 'how_to_reg';
    }

    if (detail.targetType === 'major-event' && detail.subscriptionStatus && detail.subscriptionStatus !== 'CONFIRMED') {
      return 'receipt_long';
    }

    if (detail.statusLabel === 'Ministrante') {
      return 'record_voice_over';
    }

    return 'event_available';
  }

  formRoute(link: DetailFormLink): string[] {
    return ['/profile', 'forms', link.formId];
  }

  formQueryParams(link: DetailFormLink): { targetType: EventFormTargetType; targetId: string } {
    return {
      targetType: link.targetType,
      targetId: link.targetId,
    };
  }

  canUploadMajorEventReceipt(detail: DetailViewModel): boolean {
    return (
      detail.targetType === 'major-event' &&
      detail.subscriptionStatus !== undefined &&
      detail.subscriptionStatus !== null &&
      detail.subscriptionStatus !== 'CONFIRMED'
    );
  }

  majorEventEventsHeading(detail: DetailViewModel): string {
    return detail.isSubscribed ? 'Eventos inscritos' : 'Eventos com participação';
  }

  private loadDetailState(params: ParamMap): Observable<DetailState> {
    const eventType = parseEventTargetType(params.get('eventType'));
    const eventId = params.get('eventId')?.trim();

    if (!eventType || !eventId) {
      return of({
        status: 'error',
        message: 'Página de evento inválida.',
      } satisfies DetailState);
    }

    return this.loadDetail(eventType, eventId).pipe(
      switchMap((detail) => {
        if (!detail) {
          return of({
            status: 'error',
            message: 'Inscrição não encontrada.',
          } satisfies DetailState);
        }

        const targetType = {
          event: 'EVENT',
          'event-group': 'EVENT_GROUP',
          'major-event': 'MAJOR_EVENT',
        }[detail.targetType] as 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';
        return forkJoin({
          formLinks: this.loadFormLinks(detail),
          availability: this.prizeDrawsApi
            .availability({
              eventIds: targetType === 'EVENT' ? [detail.targetId] : undefined,
              eventGroupIds: targetType === 'EVENT_GROUP' ? [detail.targetId] : undefined,
              majorEventIds: targetType === 'MAJOR_EVENT' ? [detail.targetId] : undefined,
            })
            .pipe(catchError(() => of([]))),
        }).pipe(
          map(
            ({ formLinks, availability }) =>
              ({
                status: 'ready',
                detail,
                formLinks,
                hasPrizeDraws: availability.some((item) => item.drawCount > 0),
              }) satisfies DetailState,
          ),
        );
      }),
      startWith({ status: 'loading' } satisfies DetailState),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível carregar os detalhes.',
        } satisfies DetailState),
      ),
    );
  }

  private prizeDrawAvailabilityInput(target: { targetType: PrizeDrawTargetType; targetId: string }): {
    eventIds?: string[];
    eventGroupIds?: string[];
    majorEventIds?: string[];
  } {
    return {
      eventIds: target.targetType === 'EVENT' ? [target.targetId] : undefined,
      eventGroupIds: target.targetType === 'EVENT_GROUP' ? [target.targetId] : undefined,
      majorEventIds: target.targetType === 'MAJOR_EVENT' ? [target.targetId] : undefined,
    };
  }

  private detailTargetType(targetType: PrizeDrawTargetType): EventTargetType {
    return {
      EVENT: 'event',
      EVENT_GROUP: 'event-group',
      MAJOR_EVENT: 'major-event',
    }[targetType] as EventTargetType;
  }

  private loadDetail(eventType: EventTargetType, eventId: string): Observable<DetailViewModel | null> {
    if (!this.networkStatus.isOnline()) {
      return from(this.loadOfflineDetail(eventType, eventId));
    }

    const userId = this.auth.user()?.sub;

    if (!userId) {
      void this.offlineData.purgeUserData();
      return of(null);
    }

    switch (eventType) {
      case 'event':
        return this.api.getEventDetails(eventId).pipe(
          switchMap((details) =>
            from(this.offlineData.replaceAttendanceDetail(userId, eventId, { eventType, details })).pipe(
              map(() => buildDetailViewModel({ eventType, details })),
            ),
          ),
          catchError(() => from(this.loadOfflineDetail(eventType, eventId))),
        );
      case 'event-group':
        return this.api.getEventGroupDetails(eventId).pipe(
          switchMap((details) =>
            from(this.offlineData.replaceAttendanceDetail(userId, eventId, { eventType, details })).pipe(
              map(() => buildDetailViewModel({ eventType, details })),
            ),
          ),
          catchError(() => from(this.loadOfflineDetail(eventType, eventId))),
        );
      case 'major-event':
        return this.api.getMajorEventDetails(eventId).pipe(
          switchMap((details) =>
            from(this.offlineData.replaceAttendanceDetail(userId, eventId, { eventType, details })).pipe(
              map(() => buildDetailViewModel({ eventType, details })),
            ),
          ),
          catchError(() => from(this.loadOfflineDetail(eventType, eventId))),
        );
    }
  }

  private async loadOfflineDetail(eventType: EventTargetType, eventId: string): Promise<DetailViewModel | null> {
    const userId = this.auth.user()?.sub ?? (await this.offlineData.getLatestUserSnapshot())?.userId;
    const cachedDetail = userId ? await this.offlineData.getAttendanceDetail(userId, eventType, eventId) : null;

    return cachedDetail ? this.buildCachedDetail(cachedDetail) : null;
  }

  private loadFormLinks(detail: DetailViewModel): Observable<DetailFormLink[]> {
    if (!this.networkStatus.isOnline()) {
      return of([]);
    }

    const targets: DetailFormLink[] = [];
    if (detail.targetType === 'event') {
      targets.push({
        formId: '',
        name: '',
        targetType: 'EVENT',
        targetId: detail.targetId,
        targetName: detail.title,
      });
    } else if (detail.targetType === 'major-event') {
      targets.push({
        formId: '',
        name: '',
        targetType: 'MAJOR_EVENT',
        targetId: detail.targetId,
        targetName: detail.title,
      });
      for (const item of detail.events) {
        targets.push({
          formId: '',
          name: '',
          targetType: 'EVENT',
          targetId: item.event.id,
          targetName: item.event.name,
        });
      }
    } else {
      for (const item of detail.events) {
        targets.push({
          formId: '',
          name: '',
          targetType: 'EVENT',
          targetId: item.event.id,
          targetName: item.event.name,
        });
      }
    }

    if (targets.length === 0) {
      return of([]);
    }

    return forkJoin(targets.map((target) => this.loadTargetFormLinks(target))).pipe(
      map((groups) => {
        const seen = new Set<string>();
        return groups.flat().filter((link) => {
          const key = `${link.formId}:${link.targetType}:${link.targetId}`;
          if (seen.has(key)) {
            return false;
          }
          seen.add(key);
          return true;
        });
      }),
    );
  }

  private loadTargetFormLinks(target: DetailFormLink): Observable<DetailFormLink[]> {
    return this.formsApi
      .listCurrentUserForms({
        targetType: target.targetType,
        eventId: target.targetType === 'EVENT' ? target.targetId : null,
        majorEventId: target.targetType === 'MAJOR_EVENT' ? target.targetId : null,
      })
      .pipe(
        map((forms) =>
          forms.flatMap((form) => {
            const link = this.findFormTargetLink(form, target);
            return link ? [this.toDetailFormLink(form, target, link)] : [];
          }),
        ),
        catchError(() => of([])),
      );
  }

  private toDetailFormLink(
    form: PublicEventForm,
    target: DetailFormLink,
    link: PublicEventForm['links'][number],
  ): DetailFormLink {
    const canAnswer = isPublicFormLinkAvailable(link);
    const resultsReleased = arePublicFormResultsReleased(form, link);
    return {
      formId: form.id,
      name: form.name,
      targetType: target.targetType,
      targetId: target.targetId,
      targetName: target.targetName,
      mode: !canAnswer && resultsReleased ? 'results' : 'answer',
    };
  }

  private findFormTargetLink(form: PublicEventForm, target: DetailFormLink): PublicEventForm['links'][number] | null {
    return (
      form.links.find(
        (link) =>
          link.targetType === target.targetType &&
          (link.eventId ?? null) === (target.targetType === 'EVENT' ? target.targetId : null) &&
          (link.majorEventId ?? null) === (target.targetType === 'MAJOR_EVENT' ? target.targetId : null),
      ) ?? null
    );
  }

  private buildCachedDetail(cachedDetail: OfflineAttendanceDetail): DetailViewModel | null {
    switch (cachedDetail.eventType) {
      case 'event':
        return buildDetailViewModel(cachedDetail);
      case 'event-group':
        return buildDetailViewModel(cachedDetail);
      case 'major-event':
        return buildDetailViewModel(cachedDetail);
    }
  }
}
