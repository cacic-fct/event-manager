import { ConfirmationDialogComponent, TwemojiComponent } from '@cacic-fct/shared-angular';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { EventInstructionsComponent, EventMaterialsComponent } from '@cacic-fct/shared-angular/event-preparation';
import { DOCUMENT, DatePipe, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, ParamMap, RouterLink } from '@angular/router';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors/routing';
import { toCanvas, toSVG } from '@bwip-js/browser';
import { parseEventTargetType } from '@cacic-fct/shared-utils';
import { EMPTY, Observable, catchError, combineLatest, map, of, startWith, switchMap } from 'rxjs';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { AttendancesApiService, OrganizerInfo } from '../attendances-api.service';
import { RealtimeInvalidationService } from '../../../shared/realtime-invalidation.service';
import { privateResourceErrorStatus } from '../../../shared/route-error-handling';

type OrganizerInfoState = { status: 'loading' } | { status: 'ready'; info: OrganizerInfo };

@Component({
  selector: 'app-organizer-info',
  imports: [
    DatePipe,
    TwemojiComponent,
    EventInstructionsComponent,
    EventMaterialsComponent,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    RouterLink,
  ],
  templateUrl: './organizer-info.html',
  styleUrl: './organizer-info.css',
  host: { '(window:beforeunload)': 'beforeUnload($event)' },
})
export class OrganizerInfoComponent {
  private readonly dialog = inject(MatDialog);
  private readonly dirtyMaterials = signal(new Set<string>());
  readonly hasUnsavedChanges = computed(() => this.dirtyMaterials().size > 0);
  private readonly route = inject(ActivatedRoute);
  private readonly routeErrors = inject(RouteErrorService);
  private readonly api = inject(AttendancesApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fileDownload = inject(CertificateFileDownloadService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly document = inject(DOCUMENT);
  private readonly realtime = inject(RealtimeInvalidationService);
  private readonly refresh = signal(0);
  private loadedOrganizerTarget: string | null = null;

  readonly state = toSignal(
    combineLatest([this.route.paramMap, toObservable(this.refresh)]).pipe(
      switchMap(([params]) => this.loadOrganizerInfo(params)),
      startWith({ status: 'loading' } satisfies OrganizerInfoState),
    ),
    { initialValue: { status: 'loading' } satisfies OrganizerInfoState },
  );

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const targetType = parseEventTargetType(params.get('eventType'));
          const targetId = params.get('eventId')?.trim();
          return targetType && targetId ? this.realtime.watchOrganizer(targetType, targetId) : EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.refresh.update((value) => value + 1));
  }

  materialsAreDirty(eventId: string): boolean {
    return this.dirtyMaterials().has(eventId);
  }

  setMaterialsDirty(eventId: string, dirty: boolean): void {
    this.dirtyMaterials.update((current) => {
      const next = new Set(current);
      if (dirty) next.add(eventId);
      else next.delete(eventId);
      return next;
    });
  }

  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.hasUnsavedChanges()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  async canDeactivate(): Promise<boolean> {
    if (!this.hasUnsavedChanges()) return true;
    return (
      (await firstValueFrom(
        this.dialog
          .open(ConfirmationDialogComponent, {
            data: {
              title: 'Descartar materiais não salvos?',
              message: 'Há links que ainda não foram salvos.',
              confirmLabel: 'Descartar alterações',
              cancelLabel: 'Continuar editando',
            },
            width: '420px',
            maxWidth: 'calc(100vw - 32px)',
          })
          .afterClosed(),
      )) === true
    );
  }

  backRoute(info: OrganizerInfo): string[] {
    return ['/' + info.targetType, info.targetId];
  }

  downloadOnlineAttendanceCode(eventId: string, code: string | null | undefined, format: 'svg' | 'png'): void {
    if (!isPlatformBrowser(this.platformId) || !code) {
      return;
    }

    try {
      const options = {
        bcid: 'azteccode',
        text: `online-attendance:${eventId}:${code.trim()}`,
        height: 300,
        width: 300,
        includetext: false,
        textxalign: 'center',
        eclevel: '60',
      } as const;
      const fileName = `codigo-presenca-${eventId}.${format}`;

      if (format === 'svg') {
        this.fileDownload.saveBlob(new Blob([toSVG(options)], { type: 'image/svg+xml' }), fileName);
        return;
      }

      const canvas = this.document.createElement('canvas');
      toCanvas(canvas, options);
      canvas.toBlob((blob) => {
        if (blob) {
          this.fileDownload.saveBlob(blob, fileName);
        } else {
          this.showOnlineAttendanceCodeDownloadError();
        }
      }, 'image/png');
    } catch (error) {
      console.error('Failed to render online attendance Aztec code:', error);
      this.showOnlineAttendanceCodeDownloadError();
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
      this.loadedOrganizerTarget = null;
      void this.routeErrors.navigate(404);
      return of({ status: 'loading' } satisfies OrganizerInfoState);
    }

    const targetKey = `${targetType}:${targetId}`;

    return this.api.getOrganizerInfoStrict(targetType, targetId).pipe(
      map((info) => {
        if (info) {
          this.loadedOrganizerTarget = targetKey;
          return { status: 'ready', info } satisfies OrganizerInfoState;
        }
        void this.routeErrors.navigate(404);
        return { status: 'loading' } satisfies OrganizerInfoState;
      }),
      catchError((error: unknown) => {
        const status = privateResourceErrorStatus(error);
        if (this.loadedOrganizerTarget === targetKey && status !== 404) {
          return EMPTY;
        }
        void this.routeErrors.navigate(status);
        return of({ status: 'loading' } satisfies OrganizerInfoState);
      }),
    );
  }

  private showOnlineAttendanceCodeDownloadError(): void {
    this.snackBar.open('Não foi possível gerar o código Aztec para presença.', 'OK', { duration: 5000 });
  }
}
