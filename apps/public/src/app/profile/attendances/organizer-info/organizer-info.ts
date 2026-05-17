import { DatePipe, isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { toSVG } from '@bwip-js/browser';
import { parseEventTargetType } from '@cacic-fct/shared-utils';
import { Observable, catchError, map, of, startWith, switchMap } from 'rxjs';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { AttendancesApiService, OrganizerInfo } from '../attendances-api.service';
import { EmojiService } from '../emoji.service';

type OrganizerInfoState =
  | { status: 'loading' }
  | { status: 'ready'; info: OrganizerInfo }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-organizer-info',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    RouterLink,
  ],
  templateUrl: './organizer-info.html',
  styleUrl: './organizer-info.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerInfoComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(AttendancesApiService);
  private readonly fileDownload = inject(CertificateFileDownloadService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly platformId = inject(PLATFORM_ID);

  readonly emoji = inject(EmojiService);

  readonly state = toSignal(
    this.route.paramMap.pipe(
      switchMap((params) => this.loadOrganizerInfo(params)),
      startWith({ status: 'loading' } satisfies OrganizerInfoState),
    ),
    { initialValue: { status: 'loading' } satisfies OrganizerInfoState },
  );

  backRoute(info: OrganizerInfo): string[] {
    return ['/profile', 'attendances', info.targetType, info.targetId];
  }

  downloadOnlineAttendanceCode(eventId: string, code: string | null | undefined): void {
    if (!isPlatformBrowser(this.platformId) || !code) {
      return;
    }

    try {
      const svg = toSVG({
        bcid: 'azteccode',
        text: `online-attendance:${eventId}:${code.trim()}`,
        height: 300,
        width: 300,
        includetext: false,
        textxalign: 'center',
        // @ts-expect-error - bwip-js supports eclevel for azteccode.
        eclevel: '60',
      });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `codigo-presenca-${eventId}.svg`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to render online attendance Aztec code:', error);
      this.snackBar.open('Não foi possível gerar o código de barras.', 'OK', {
        duration: 5000,
      });
    }
  }

  downloadSubscriberList(eventId: string): void {
    this.api.downloadEventSubscriberList(eventId).subscribe({
      next: (download) => this.fileDownload.save(download),
      error: (error: unknown) => {
        console.error('Failed to download subscriber list:', error);
        this.snackBar.open('Não foi possível baixar a lista de inscritos.', 'OK', {
          duration: 5000,
        });
      },
    });
  }

  private loadOrganizerInfo(params: ParamMap): Observable<OrganizerInfoState> {
    const targetType = parseEventTargetType(params.get('eventType'));
    const targetId = params.get('eventId')?.trim();

    if (!targetType || !targetId) {
      return of({
        status: 'error',
        message: 'Página de organizador inválida.',
      } satisfies OrganizerInfoState);
    }

    return this.api.getOrganizerInfo(targetType, targetId).pipe(
      map((info) =>
        info
          ? ({ status: 'ready', info } satisfies OrganizerInfoState)
          : ({
              status: 'error',
              message: 'Informações restritas aos ministrantes deste evento.',
            } satisfies OrganizerInfoState),
      ),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível carregar as informações do organizador.',
        } satisfies OrganizerInfoState),
      ),
    );
  }
}
