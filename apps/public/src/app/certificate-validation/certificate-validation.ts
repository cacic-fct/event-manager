import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  PublicCertificateValidation,
  PublicCertificateValidationEvent,
} from '@cacic-fct/event-manager-public-contracts';
import { TURNSTILE_ACTIONS, formatCreditMinutes, formatDateRange } from '@cacic-fct/shared-utils';
import { Subscription, combineLatest, distinctUntilChanged, finalize, map } from 'rxjs';
import { CertificateFileDownloadService } from '../shared/certificate-file-download.service';
import { EmojiService } from '../shared/emoji.service';
import { CertificateValidationApiService } from './certificate-validation-api.service';
import {
  AuthService,
  AztecScannerDialogComponent,
  CacicAnalyticsService,
  CacicLogoComponent,
  CloudflareTurnstileComponent,
} from '@cacic-fct/shared-angular';
import { isPlatformBrowser } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { RateLimitError, createRateLimitCooldown } from '../shared/rate-limit-error';

type ValidationState =
  | { status: 'idle' }
  | { status: 'challenge'; certificateId: string; source: ValidationSource }
  | { status: 'loading' }
  | { status: 'ready'; certificate: PublicCertificateValidation }
  | { status: 'error'; message: string };

type ValidationSource = 'link' | 'manual' | 'scan';

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
    RouterLink,
    MatToolbarModule,
    CacicLogoComponent,
    MatTooltipModule,
    CloudflareTurnstileComponent,
  ],
})
export class CertificateValidation {
  public readonly route = inject(ActivatedRoute);
  public readonly router = inject(Router);
  private readonly api = inject(CertificateValidationApiService);
  private readonly fileDownload = inject(CertificateFileDownloadService);
  private readonly analytics = inject(CacicAnalyticsService);
  private readonly auth = inject(AuthService);
  private readonly isAuthenticated = this.auth.isAuthenticated;
  readonly emoji = inject(EmojiService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly turnstileWidget = viewChild(CloudflareTurnstileComponent);
  private readonly validationCooldown = createRateLimitCooldown(this.destroyRef);
  private readonly downloadCooldown = createRateLimitCooldown(this.destroyRef);

  private platformId = inject(PLATFORM_ID);
  private activeValidation: Subscription | null = null;
  private pendingCertificateId: string | null = null;
  private nextValidationSource: ValidationSource | null = null;
  private currentRouteCertificateId: string | null = null;
  private isDarkSignal = signal(false);
  fillColor = computed(() => (this.isDarkSignal() ? '#fff' : '#000'));

  readonly certificateIdControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });
  readonly validationForm = new FormGroup({
    certificateId: this.certificateIdControl,
  });
  readonly state = signal<ValidationState>({ status: 'idle' });
  readonly downloading = signal(false);
  readonly downloadError = signal<string | null>(null);
  readonly turnstileAction = TURNSTILE_ACTIONS.certificateValidation;
  readonly turnstileToken = signal<string | null>(null);
  readonly validationCooldownSeconds = this.validationCooldown.seconds;
  readonly downloadCooldownSeconds = this.downloadCooldown.seconds;

  constructor() {
    combineLatest([this.route.paramMap, this.route.queryParamMap])
      .pipe(
        map(([params, queryParams]) => ({
          // Accept certificateId coming from either the path or query params.
          certificateId: this.normalizeId(params.get('certificateId') ?? queryParams.get('certificateId')),
          invalidId: this.normalizeId(queryParams.get('invalidId')),
        })),
        distinctUntilChanged(
          (previous, current) =>
            previous.certificateId === current.certificateId && previous.invalidId === current.invalidId,
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ certificateId, invalidId }) => {
        this.currentRouteCertificateId = certificateId;
        this.syncInput(certificateId, invalidId);

        if (!certificateId) {
          this.cancelPendingValidation();
          this.state.set({ status: 'idle' });
          return;
        }

        this.queueValidation(certificateId, this.consumeNextValidationSource());
      });

    this.destroyRef.onDestroy(() => this.activeValidation?.unsubscribe());

    if (isPlatformBrowser(this.platformId) && window.matchMedia) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');

      this.isDarkSignal.set(media.matches);

      const listener = (event: MediaQueryListEvent) => {
        this.isDarkSignal.set(event.matches);
      };

      media.addEventListener('change', listener);

      this.destroyRef.onDestroy(() => {
        media.removeEventListener('change', listener);
      });
    }
  }

  submit(source: ValidationSource = 'manual'): void {
    const certificateId = this.certificateIdControl.value.trim();
    if (this.validationCooldownSeconds() > 0) {
      this.state.set({
        status: 'error',
        message: `Aguarde ${this.validationCooldownSeconds()}s para validar outro certificado.`,
      });
      return;
    }

    if (!certificateId) {
      this.certificateIdControl.markAsTouched();
      this.certificateIdControl.updateValueAndValidity();
      return;
    }

    if (certificateId === this.currentRouteCertificateId) {
      this.queueValidation(certificateId, source);
      return;
    }

    this.nextValidationSource = source;

    // Navigate using query params to ensure the value is reliably available
    // to the component regardless of router URL handling.
    void this.router.navigate(['/validate'], {
      queryParams: { certificateId },
    });
  }

  download(certificate: PublicCertificateValidation): void {
    if (this.downloadCooldownSeconds() > 0) {
      this.downloadError.set(`Aguarde ${this.downloadCooldownSeconds()}s para baixar novamente.`);
      return;
    }

    this.downloadError.set(null);
    this.downloading.set(true);

    this.api
      .downloadCertificate(certificate.id)
      .pipe(finalize(() => this.downloading.set(false)))
      .subscribe({
        next: (download) => {
          this.analytics.trackEvent('certificate_download', {
            certificateId: certificate.id,
            authenticated: this.isAuthenticated(),
          });
          this.fileDownload.save(download);
        },
        error: (error: unknown) => {
          if (error instanceof RateLimitError) {
            this.downloadCooldown.start(error.retryAfterSeconds);
          }
          this.downloadError.set(this.getDownloadErrorMessage(error));
        },
      });
  }

  public scanCode(): void {
    const dialogRef = this.dialog.open(AztecScannerDialogComponent, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      data: {
        acceptedPrefixes: ['eventos.cacic.dev.br/validar/'],
        title: 'Escanear código de certificado',
        mode: ['QRCode'],
      },
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((code) => {
        if (!code) {
          return;
        }

        console.log('Scanned code:', code);
        // strip "eventos.cacic.dev.br/validar/" prefix if present
        const prefix = 'eventos.cacic.dev.br/validar/';
        const certificateId = code.startsWith(prefix) ? code.substring(prefix.length) : code;

        this.certificateIdControl.setValue(certificateId);

        this.submit('scan');
      });
  }

  onTurnstileTokenChange(token: string | null): void {
    this.turnstileToken.set(token);

    if (!token || !this.pendingCertificateId) {
      return;
    }

    this.validatePendingCertificate(token);
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

  challengeMessage(source: ValidationSource): string {
    if (source === 'scan') {
      return 'Código escaneado. Conclua a verificação anti-spam para validar o certificado.';
    }

    if (source === 'link') {
      return 'Você abriu um certificado por QR Code ou link. Conclua a verificação anti-spam para validar.';
    }

    return 'Conclua a verificação anti-spam para validar o certificado.';
  }

  private queueValidation(certificateId: string, source: ValidationSource): void {
    const normalizedCertificateId = this.normalizeId(certificateId);
    if (!normalizedCertificateId) {
      this.cancelPendingValidation();
      this.state.set({ status: 'idle' });
      return;
    }

    this.pendingCertificateId = normalizedCertificateId;

    const turnstileToken = this.turnstileToken();
    if (!turnstileToken) {
      this.state.set({
        status: 'challenge',
        certificateId: normalizedCertificateId,
        source,
      });
      return;
    }

    this.validatePendingCertificate(turnstileToken);
  }

  private validatePendingCertificate(turnstileToken: string): void {
    const certificateId = this.pendingCertificateId;
    if (!certificateId) {
      return;
    }

    this.pendingCertificateId = null;
    this.state.set({ status: 'loading' });
    this.activeValidation?.unsubscribe();
    this.activeValidation = this.api
      .validateCertificate(certificateId, turnstileToken)
      .pipe(
        finalize(() => {
          this.turnstileToken.set(null);
          this.turnstileWidget()?.reset();
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (certificate) => {
          if (!certificate) {
            void this.router.navigate(['/validate'], {
              queryParams: { invalidId: certificateId },
              replaceUrl: true,
            });
            return;
          }

          this.state.set({
            status: 'ready',
            certificate,
          });
        },
        error: (error: unknown) => {
          if (error instanceof RateLimitError) {
            this.validationCooldown.start(error.retryAfterSeconds);
          }
          this.state.set({
            status: 'error',
            message: this.getErrorMessage(error),
          });
        },
      });
  }

  private cancelPendingValidation(): void {
    this.pendingCertificateId = null;
    this.activeValidation?.unsubscribe();
    this.activeValidation = null;
  }

  private consumeNextValidationSource(): ValidationSource {
    const source = this.nextValidationSource ?? 'link';
    this.nextValidationSource = null;
    return source;
  }

  private syncInput(certificateId: string | null, invalidId: string | null): void {
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
    if (message.includes('Too Many Requests') || message.includes('ThrottlerException')) {
      return 'Muitas tentativas. Aguarde um instante e tente novamente.';
    }

    if (message.includes('Turnstile verification is temporarily unavailable')) {
      return 'A verificação anti-spam está temporariamente indisponível. Tente novamente em instantes.';
    }

    if (message.includes('Turnstile verification is not configured')) {
      return 'A verificação anti-spam não está configurada. Avise a organização do evento.';
    }

    if (message.includes('Turnstile verification')) {
      return 'Não foi possível confirmar a verificação anti-spam. Tente novamente.';
    }

    return message || 'Não foi possível validar o certificado.';
  }

  private getDownloadErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Too Many Requests') || message.includes('ThrottlerException')) {
      return 'Muitas tentativas de download. Aguarde um instante e tente novamente.';
    }

    return message || 'Não foi possível baixar o certificado.';
  }
}
