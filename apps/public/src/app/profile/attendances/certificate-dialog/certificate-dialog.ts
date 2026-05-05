import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type {
  Certificate,
  CertificateTarget,
} from '@cacic-eventos/shared-utils';
import { catchError, finalize, map, of, startWith } from 'rxjs';
import { CertificateFileDownloadService } from '../../../shared/certificate-file-download.service';
import { AttendancesApiService } from '../attendances-api.service';
import { AuthService, MailtoService } from '@cacic-eventos/shared-angular';

export interface CertificateDialogData {
  title: string;
  targets: CertificateTarget[];
}

type CertificateDialogState =
  | { status: 'loading' }
  | { status: 'ready'; certificates: Certificate[] }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-certificate-dialog',
  templateUrl: './certificate-dialog.html',
  styleUrl: './certificate-dialog.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatDialogModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
  ],
})
export class CertificateDialog {
  private readonly api = inject(AttendancesApiService);
  private readonly data = inject<CertificateDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CertificateDialog>);
  private readonly fileDownload = inject(CertificateFileDownloadService);
  private readonly mailtoService = inject(MailtoService);
  private readonly authService = inject(AuthService);

  readonly title = this.data.title;
  readonly downloadingCertificateId = signal<string | null>(null);
  readonly downloadError = signal<string | null>(null);

  readonly state = toSignal(
    this.api.getCurrentUserCertificatesForTargets(this.data.targets).pipe(
      map(
        (certificates): CertificateDialogState => ({
          status: 'ready',
          certificates,
        }),
      ),
      startWith({ status: 'loading' } satisfies CertificateDialogState),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar os certificados.',
        } satisfies CertificateDialogState),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies CertificateDialogState },
  );

  close(): void {
    this.dialogRef.close();
  }

  download(certificate: Certificate): void {
    this.downloadError.set(null);
    this.downloadingCertificateId.set(certificate.id);

    this.api
      .downloadCurrentUserCertificate(certificate.id)
      .pipe(finalize(() => this.downloadingCertificateId.set(null)))
      .subscribe({
        next: (download) => {
          this.fileDownload.save(download);
        },
        error: (error: unknown) => {
          this.downloadError.set(
            error instanceof Error
              ? error.message
              : 'Não foi possível baixar o certificado.',
          );
        },
      });
  }

  mailto(): void {
    const currentState = this.state();
    const certificateIds =
      currentState.status === 'ready'
        ? currentState.certificates.map((certificate) => certificate.id)
        : [];
    const targetIds = this.data.targets.map(
      (target) => `${target.scope}:${target.targetId}`,
    );
    const httpError =
      this.downloadError() ??
      (currentState.status === 'error' ? currentState.message : null);

    this.mailtoService.open({
      to: 'fct-app@googlegroups.com',
      subject: `[FCT-App] Problema com certificado - ${this.title}`,
      body: `\n\n\n
=== Não apague os dados abaixo ===
userId: ${this.authService.user()?.sub}
evento: ${this.title}
alvos: ${targetIds.length > 0 ? targetIds.join(', ') : 'none'}
certificateIds: ${certificateIds.length > 0 ? certificateIds.join(', ') : 'nenhum'}
httpError: ${httpError ?? 'none'}`,
    });
  }
}
