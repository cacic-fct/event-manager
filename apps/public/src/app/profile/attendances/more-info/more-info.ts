import type { EventFormTargetType, EventTargetType, PublicEventForm } from '@cacic-fct/event-manager-public-contracts';
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
import { Observable, catchError, forkJoin, from, map, of, startWith, switchMap } from 'rxjs';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendancesApiService } from '../attendances-api.service';
import { CertificateDialog, CertificateDialogData } from '../my-attendances/certificate-dialog/certificate-dialog';
import { EmojiService } from '../../../shared/emoji.service';
import { PublicEventFormApiService } from '../../../forms/event-form-api.service';

type DetailFormLink = {
  formId: string;
  name: string;
  targetType: EventFormTargetType;
  targetId: string;
  targetName: string;
};

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; detail: DetailViewModel; formLinks: DetailFormLink[] }
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
  private readonly formsApi = inject(PublicEventFormApiService);
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

        return this.loadFormLinks(detail).pipe(
          map((formLinks) => ({ status: 'ready', detail, formLinks } satisfies DetailState)),
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
        return groups
          .flat()
          .filter((link) => {
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
        map((forms) => forms.map((form) => this.toDetailFormLink(form, target))),
        catchError(() => of([])),
      );
  }

  private toDetailFormLink(form: PublicEventForm, target: DetailFormLink): DetailFormLink {
    return {
      formId: form.id,
      name: form.name,
      targetType: target.targetType,
      targetId: target.targetId,
      targetName: target.targetName,
    };
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
