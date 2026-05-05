import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router } from '@angular/router';
import {
  PublicCertificateValidation,
  PublicCertificateValidationEvent,
  formatCreditMinutes,
  formatDateRange,
} from '@cacic-eventos/shared-utils';
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  finalize,
  map,
  of,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { CertificateFileDownloadService } from '../shared/certificate-file-download.service';
import { EmojiService } from '../profile/attendances/emoji.service';
import { CertificateValidationApiService } from './certificate-validation-api.service';

type ValidationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; certificate: PublicCertificateValidation }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-certificate-validation',
  templateUrl: './certificate-validation.html',
  styleUrl: './certificate-validation.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    ReactiveFormsModule,
  ],
})
export class CertificateValidation {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(CertificateValidationApiService);
  private readonly fileDownload = inject(CertificateFileDownloadService);
  readonly emoji = inject(EmojiService);

  readonly certificateIdControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly state = signal<ValidationState>({ status: 'idle' });
  readonly downloading = signal(false);
  readonly downloadError = signal<string | null>(null);

  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        map(([params, queryParams]) => ({
          // Accept certificateId coming from either the path or query params.
          certificateId: this.normalizeId(
            params.get('certificateId') ?? queryParams.get('certificateId'),
          ),
          invalidId: this.normalizeId(queryParams.get('invalidId')),
        })),
        distinctUntilChanged(
          (previous, current) =>
            previous.certificateId === current.certificateId &&
            previous.invalidId === current.invalidId,
        ),
        tap(({ certificateId, invalidId }) =>
          this.syncInput(certificateId, invalidId),
        ),
        switchMap(({ certificateId }) => {
          if (!certificateId) {
            return of({ status: 'idle' } satisfies ValidationState);
          }

          return this.api.validateCertificate(certificateId).pipe(
            switchMap((certificate) => {
              if (!certificate) {
                void this.router.navigate(['/validate'], {
                  queryParams: { invalidId: certificateId },
                  replaceUrl: true,
                });
                return of({ status: 'loading' } satisfies ValidationState);
              }

              return of({
                status: 'ready',
                certificate,
              } satisfies ValidationState);
            }),
            startWith({ status: 'loading' } satisfies ValidationState),
            catchError((error: unknown) =>
              of({
                status: 'error',
                message: this.getErrorMessage(error),
              } satisfies ValidationState),
            ),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  submit(): void {
    const certificateId = this.certificateIdControl.value.trim();
    if (!certificateId) {
      this.certificateIdControl.markAsTouched();
      this.certificateIdControl.updateValueAndValidity();
      return;
    }

    // Navigate using query params to ensure the value is reliably available
    // to the component regardless of router URL handling.
    void this.router.navigate(['/validate'], {
      queryParams: { certificateId },
    });
  }

  download(certificate: PublicCertificateValidation): void {
    this.downloadError.set(null);
    this.downloading.set(true);

    this.api
      .downloadCertificate(certificate.id)
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({
        next: (download) => this.fileDownload.save(download),
        error: (error: unknown) => {
          this.downloadError.set(this.getDownloadErrorMessage(error));
        },
      });
  }

  formatEventDate(event: PublicCertificateValidationEvent): string {
    return formatDateRange(event.startDate, event.endDate);
  }

  formatCredit(creditMinutes: number | null | undefined): string {
    if (creditMinutes == null) {
      return 'Carga horária não informada';
    }

    return formatCreditMinutes(creditMinutes);
  }

  private syncInput(
    certificateId: string | null,
    invalidId: string | null,
  ): void {
    const value = certificateId ?? invalidId ?? '';
    this.certificateIdControl.setValue(value, { emitEvent: false });
    this.certificateIdControl.markAsPristine();
    this.certificateIdControl.updateValueAndValidity({ emitEvent: false });

    if (!certificateId && invalidId) {
      this.certificateIdControl.setErrors({ notFound: true });
      this.certificateIdControl.markAsTouched();
    }
  }

  private normalizeId(value: string | null): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private getErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('Too Many Requests') ||
      message.includes('ThrottlerException')
    ) {
      return 'Muitas tentativas. Aguarde um instante e tente novamente.';
    }

    return message || 'Não foi possível validar o certificado.';
  }

  private getDownloadErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('Too Many Requests') ||
      message.includes('ThrottlerException')
    ) {
      return 'Muitas tentativas de download. Aguarde um instante e tente novamente.';
    }

    return message || 'Não foi possível baixar o certificado.';
  }
}
