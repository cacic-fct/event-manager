import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrentUserMajorEventSubscription, getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { toSVG } from '@bwip-js/browser';
import { isBefore, parseISO } from 'date-fns';
import { forkJoin } from 'rxjs';
import { AnalyticsService } from '../../analytics/analytics.service';
import { RateLimitError, createRateLimitCooldown } from '../../shared/rate-limit-error';
import { MajorEventSubscriptionApiService } from '../subscription/subscription-api.service';
import { PaymentReceipt, PaymentReceiptApiService } from './payment-receipt-api.service';

type PaymentState =
  | { status: 'loading' }
  | { status: 'ready'; subscription: CurrentUserMajorEventSubscription; receipt: PaymentReceipt | null }
  | { status: 'error'; message: string };

interface PixPayload {
  brCode: string;
  qrCodeDataUrl: string;
}

interface ConfirmReceiptDialogData {
  file: File;
  previewUrl: string;
}

@Component({
  selector: 'app-payment-info',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatToolbarModule,
    RouterLink,
  ],
  templateUrl: './payment-info.html',
  styleUrl: './payment-info.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentInfo {
  private readonly route = inject(ActivatedRoute);
  private readonly analytics = inject(AnalyticsService);
  private readonly subscriptionApi = inject(MajorEventSubscriptionApiService);
  private readonly receiptApi = inject(PaymentReceiptApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly receiptUploadCooldown = createRateLimitCooldown(this.destroyRef);

  readonly majorEventId =
    this.route.snapshot.paramMap.get('majorEventId') ?? this.route.snapshot.paramMap.get('eventID') ?? '';
  readonly state = signal<PaymentState>({ status: 'loading' });
  readonly isDragging = signal(false);
  readonly uploadProgress = signal<number | null>(null);
  readonly uploadCooldownSeconds = this.receiptUploadCooldown.seconds;
  readonly isUploading = computed(() => this.uploadProgress() !== null);
  readonly applicablePrice = computed(() => {
    const subscription = this.readySubscription();
    return subscription ? this.resolveApplicablePrice(subscription) : null;
  });
  readonly pixPayload = computed(() => {
    const currentState = this.state();
    if (currentState.status !== 'ready') {
      return null;
    }

    return this.buildPixPayload(currentState.subscription);
  });

  constructor() {
    this.loadPage();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.canUpload()) {
      return;
    }

    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files.item(0);
    if (file) {
      this.reviewFile(file);
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    input.value = '';
    if (file) {
      this.reviewFile(file);
    }
  }

  copyPixCode(): void {
    const brCode = this.pixPayload()?.brCode;
    if (brCode) {
      const subscription = this.readySubscription();
      if (subscription) {
        this.analytics.trackEvent('major_event_pix_code_copied', {
          major_event_id: subscription.majorEvent.id,
          subscription_id: subscription.id,
        });
      }
      void this.copyToClipboard(brCode, 'Pix copia e cola copiado.');
    }
  }

  copyPixKey(): void {
    const paymentInfo = this.readySubscription()?.majorEvent.paymentInfo;
    if (paymentInfo?.pixKey) {
      const subscription = this.readySubscription();
      if (subscription) {
        this.analytics.trackEvent('major_event_pix_key_copied', {
          major_event_id: subscription.majorEvent.id,
          subscription_id: subscription.id,
        });
      }
      void this.copyToClipboard(paymentInfo.pixKey, 'Chave Pix copiada.');
    }
  }

  statusLabel(status: string): string {
    return getSubscriptionStatusLabel(status);
  }

  canUpload(): boolean {
    const subscription = this.readySubscription();
    if (!subscription || this.isUploading()) {
      return false;
    }

    if (subscription.subscriptionStatus === 'CONFIRMED' || subscription.subscriptionStatus === 'CANCELED') {
      return false;
    }

    const subscriptionEndDate = subscription.majorEvent.subscriptionEndDate;
    return !subscriptionEndDate || !isBefore(parseISO(subscriptionEndDate), new Date());
  }

  private loadPage(): void {
    if (!this.majorEventId) {
      this.state.set({ status: 'error', message: 'Página de pagamento inválida.' });
      return;
    }

    this.state.set({ status: 'loading' });
    this.receiptUploadCooldown.clear();
    forkJoin({
      subscription: this.subscriptionApi.getCurrentUserSubscription(this.majorEventId),
      receipt: this.receiptApi.getCurrentReceipt(this.majorEventId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ subscription, receipt }) => {
          if (!subscription) {
            this.state.set({ status: 'error', message: 'Inscrição não encontrada.' });
            return;
          }

          this.state.set({ status: 'ready', subscription, receipt });
          this.analytics.trackMajorEventTransaction({
            stage: 'payment_page_viewed',
            majorEvent: subscription.majorEvent,
            subscription,
            priceInCents: this.resolveApplicablePrice(subscription),
          });
        },
        error: (error: unknown) => {
          this.state.set({
            status: 'error',
            message: error instanceof Error ? error.message : 'Não foi possível carregar as informações de pagamento.',
          });
        },
      });
  }

  private reviewFile(file: File): void {
    if (!this.canUpload()) {
      this.snackBar.open('O envio de comprovantes não está disponível para esta inscrição.', 'OK', { duration: 4000 });
      return;
    }

    if (this.uploadCooldownSeconds() > 0) {
      this.snackBar.open(`Aguarde ${this.uploadCooldownSeconds()}s para enviar outro comprovante.`, 'OK', {
        duration: 3000,
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.snackBar.open('Envie apenas arquivos de imagem.', 'OK', { duration: 4000 });
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      this.snackBar.open('O comprovante deve ter no máximo 15 MB.', 'OK', { duration: 4000 });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    this.dialog
      .open<ConfirmReceiptDialog, ConfirmReceiptDialogData, boolean>(ConfirmReceiptDialog, {
        data: {
          file,
          previewUrl,
        },
        width: 'min(640px, calc(100vw - 32px))',
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        URL.revokeObjectURL(previewUrl);
        if (confirmed) {
          this.uploadReceipt(file);
        }
      });
  }

  private uploadReceipt(file: File): void {
    this.uploadProgress.set(0);
    this.receiptApi
      .uploadReceipt(this.majorEventId, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          if (event.type === 'progress') {
            this.uploadProgress.set(event.progress);
            return;
          }

          const currentState = this.state();
          if (currentState.status === 'ready') {
            this.state.set({
              ...currentState,
              receipt: event.receipt,
              subscription: {
                ...currentState.subscription,
                subscriptionStatus: 'RECEIPT_UNDER_REVIEW',
              },
            });
          }
          this.uploadProgress.set(null);
          if (currentState.status === 'ready') {
            this.analytics.trackMajorEventTransaction({
              stage: 'receipt_uploaded',
              majorEvent: currentState.subscription.majorEvent,
              subscription: currentState.subscription,
              priceInCents: this.resolveApplicablePrice(currentState.subscription),
            });
          }
          this.snackBar.open('Comprovante enviado.', 'OK', { duration: 3000 });
        },
        error: (error: unknown) => {
          this.uploadProgress.set(null);
          if (error instanceof RateLimitError) {
            this.receiptUploadCooldown.start(error.retryAfterSeconds);
          }
          this.snackBar.open(error instanceof Error ? error.message : 'Não foi possível enviar o comprovante.', 'OK', {
            duration: 5000,
          });
        },
      });
  }

  private readySubscription(): CurrentUserMajorEventSubscription | null {
    const currentState = this.state();
    return currentState.status === 'ready' ? currentState.subscription : null;
  }

  private async copyToClipboard(value: string, message: string): Promise<void> {
    if (!navigator.clipboard) {
      this.snackBar.open('Área de transferência indisponível.', 'OK', { duration: 3000 });
      return;
    }

    await navigator.clipboard.writeText(value);
    this.snackBar.open(message, 'OK', { duration: 3000 });
  }

  private buildPixPayload(subscription: CurrentUserMajorEventSubscription): PixPayload | null {
    const paymentInfo = subscription.majorEvent.paymentInfo;
    if (!paymentInfo?.pixKey || !paymentInfo.holder) {
      return null;
    }

    const applicablePrice = this.resolveApplicablePrice(subscription);
    const amount = applicablePrice != null ? (applicablePrice / 100).toFixed(2) : undefined;
    const brCode = this.generatePixBrCode({
      pixKey: paymentInfo.pixKey,
      merchantName: paymentInfo.holder,
      merchantCity: paymentInfo.pixCity,
      amount,
    });
    if (!brCode) {
      return null;
    }

    return {
      brCode,
      qrCodeDataUrl: this.generateQrCodeDataUrl(brCode),
    };
  }

  private generatePixBrCode(input: {
    pixKey: string;
    merchantName: string;
    merchantCity?: string | null;
    amount?: string;
  }): string | null {
    const merchantName = this.normalizeBrCodeText(input.merchantName, 25);
    const merchantCity = this.normalizeBrCodeText(input.merchantCity || 'NAO INFORMADO', 15);
    const pixKey = this.normalizePixKey(input.pixKey);
    const amount = input.amount;

    if (!merchantName || !merchantCity || !pixKey || pixKey.length > 77 || (amount && amount.length > 13)) {
      return null;
    }

    const merchantAccountInfo = this.tlv('00', 'br.gov.bcb.pix') + this.tlv('01', pixKey);
    if (merchantAccountInfo.length > 99) {
      return null;
    }

    const payloadWithoutCrc = [
      this.tlv('00', '01'),
      this.tlv('01', '11'),
      this.tlv('26', merchantAccountInfo),
      this.tlv('52', '0000'),
      this.tlv('53', '986'),
      amount ? this.tlv('54', amount) : '',
      this.tlv('58', 'BR'),
      this.tlv('59', merchantName),
      this.tlv('60', merchantCity),
      this.tlv('62', this.tlv('05', '***')),
      '6304',
    ].join('');

    return `${payloadWithoutCrc}${this.crc16(payloadWithoutCrc)}`;
  }

  private resolveApplicablePrice(subscription: CurrentUserMajorEventSubscription): number | null {
    const prices = subscription.majorEvent.majorEventPrices ?? [];
    const tiers = prices.flatMap((price) => price.tiers);
    const paymentTier = subscription.paymentTier?.trim().toLowerCase();

    if (paymentTier) {
      return tiers.find((tier) => tier.name.trim().toLowerCase() === paymentTier)?.value ?? null;
    }

    const singlePrice = prices.find((price) => price.type === 'SINGLE');
    if (singlePrice?.tiers.length === 1) {
      return singlePrice.tiers[0].value;
    }

    return tiers.length === 1 ? tiers[0].value : null;
  }

  private normalizeBrCodeText(value: string, maxLength: number): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase()
      .slice(0, maxLength);
  }

  private normalizePixKey(value: string): string {
    const pixKey = value.trim();
    const digitsOnly = pixKey.replace(/\D/g, '');

    if (digitsOnly.length === 11 || digitsOnly.length === 14) {
      return digitsOnly;
    }

    if (/^\+[\d\s().-]+$/.test(pixKey)) {
      return `+${digitsOnly}`;
    }

    return pixKey;
  }

  private tlv(id: string, value: string): string {
    return `${id}${value.length.toString().padStart(2, '0')}${value}`;
  }

  private crc16(payload: string): string {
    let crc = 0xffff;
    for (let index = 0; index < payload.length; index += 1) {
      crc ^= payload.charCodeAt(index) << 8;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
        crc &= 0xffff;
      }
    }

    return crc.toString(16).toUpperCase().padStart(4, '0');
  }

  private generateQrCodeDataUrl(text: string): string {
    const svg = toSVG({
      bcid: 'qrcode',
      text,
      scale: 5,
      includetext: false,
    });

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
}

@Component({
  selector: 'app-confirm-receipt-dialog',
  imports: [DecimalPipe, MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <h2 mat-dialog-title>Confirmar comprovante</h2>
    <mat-dialog-content>
      <img class="receipt-preview" [src]="data.previewUrl" alt="Pré-visualização do comprovante" />
      <p>{{ data.file.name }} - {{ data.file.size / 1024 / 1024 | number: '1.1-1' }} MB</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" [mat-dialog-close]="true">
        <mat-icon>cloud_upload</mat-icon>
        Enviar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
    .receipt-preview {
      background: var(--mat-sys-surface-container-highest);
      display: block;
      max-height: min(58vh, 520px);
      max-width: 100%;
      object-fit: contain;
      width: 100%;
    }

    p {
      color: var(--mat-sys-on-surface-variant);
      margin: 12px 0 0;
    }
  `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmReceiptDialog {
  readonly data = inject<ConfirmReceiptDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<ConfirmReceiptDialog>);

  close(): void {
    this.dialogRef.close(false);
  }
}
