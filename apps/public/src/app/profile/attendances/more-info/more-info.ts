import type { EventTargetType } from '@cacic-fct/event-manager-public-contracts';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflineAttendanceDetail, OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';
import { DetailViewModel, buildDetailViewModel, parseEventTargetType } from '@cacic-fct/shared-utils';
import { Observable, catchError, from, map, of, startWith, switchMap } from 'rxjs';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendancesApiService } from '../attendances-api.service';
import { CertificateDialog, CertificateDialogData } from '../my-attendances/certificate-dialog/certificate-dialog';
import { EmojiService } from '../../../shared/emoji.service';

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: DetailViewModel }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-more-info',
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatToolbarModule,
    RouterLink,
  ],
  templateUrl: './more-info.html',
  styleUrl: './more-info.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoreInfo {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(AttendancesApiService);
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineData = inject(OfflinePublicDataAccessService);
  private readonly dialog = inject(MatDialog);
  readonly emoji = inject(EmojiService);

  readonly detailState = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) => this.loadDetailState(params)),
      startWith({ status: 'loading' } satisfies DetailState),
    ),
    { initialValue: { status: 'loading' } satisfies DetailState },
  );

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

  organizerInfoRoute(detail: DetailViewModel): string[] {
    return ['/profile', 'attendances', detail.targetType, detail.targetId, 'organizer'];
  }

  canUploadMajorEventReceipt(detail: DetailViewModel): boolean {
    return (
      detail.targetType === 'major-event' &&
      detail.subscriptionStatus !== undefined &&
      detail.subscriptionStatus !== null &&
      detail.subscriptionStatus !== 'CONFIRMED'
    );
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
      map((detail) =>
        detail
          ? ({ status: 'ready', detail } satisfies DetailState)
          : ({
              status: 'error',
              message: 'Inscrição não encontrada.',
            } satisfies DetailState),
      ),
      startWith({ status: 'loading' } satisfies DetailState),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível carregar os detalhes.',
        } satisfies DetailState),
      ),
    );
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
