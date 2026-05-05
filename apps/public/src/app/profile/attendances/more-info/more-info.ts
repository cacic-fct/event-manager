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
import {
  DetailViewModel,
  EventTargetType,
  buildDetailViewModel,
  parseEventTargetType,
} from '@cacic-eventos/shared-utils';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { AttendancesApiService } from '../attendances-api.service';
import {
  CertificateDialog,
  CertificateDialogData,
} from '../certificate-dialog/certificate-dialog';
import { EmojiService } from '../emoji.service';

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
    this.dialog.open<CertificateDialog, CertificateDialogData>(
      CertificateDialog,
      {
        data: {
          title: detail.title,
          targets: detail.certificateTargets,
        },
        width: 'min(560px, calc(100vw - 32px))',
      },
    );
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
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar os detalhes.',
        } satisfies DetailState),
      ),
    );
  }

  private loadDetail(
    eventType: EventTargetType,
    eventId: string,
  ): Observable<DetailViewModel | null> {
    switch (eventType) {
      case 'event':
        return this.api
          .getEventDetails(eventId)
          .pipe(map((details) => buildDetailViewModel({ eventType, details })));
      case 'event-group':
        return this.api
          .getEventGroupDetails(eventId)
          .pipe(map((details) => buildDetailViewModel({ eventType, details })));
      case 'major-event':
        return this.api
          .getMajorEventDetails(eventId)
          .pipe(map((details) => buildDetailViewModel({ eventType, details })));
    }
  }
}
