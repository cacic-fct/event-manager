import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { HttpErrorResponse } from '@angular/common/http';
import { signal } from '@angular/core';
import { Subject } from 'rxjs';
import { PaymentInfo } from './payment-info';

describe('PaymentInfo', () => {
  const component = Object.create(PaymentInfo.prototype) as {
    generatePixBrCode(input: {
      pixKey: string;
      merchantName: string;
      merchantCity?: string | null;
      amount?: string;
    }): string | null;
    normalizePixKey(value: string): string;
    resolveApplicablePrice(subscription: CurrentUserMajorEventSubscription): number | null;
    readySubscription(): CurrentUserMajorEventSubscription | null;
    isUploading(): boolean;
    canUpload(): boolean;
    receiptUploadErrorMessage(error: unknown): string;
  };

  it('normalizes formatted alphanumeric CNPJ Pix keys', () => {
    expect(component.normalizePixKey('12.345.678/ABCD-95')).toBe('12345678ABCD95');
  });

  it('keeps existing numeric CNPJ Pix key normalization', () => {
    expect(component.normalizePixKey('12.345.678/0001-95')).toBe('12345678000195');
  });

  it('includes the configured merchant city in generated Pix BR Codes', () => {
    const brCode = component.generatePixBrCode({
      pixKey: 'pix@example.com',
      merchantName: 'Evento de teste',
      merchantCity: 'São Paulo',
      amount: '25.00',
    });

    expect(brCode).toContain('6009SAO PAULO');
  });

  it('falls back to a valid merchant city for legacy payment information', () => {
    const brCode = component.generatePixBrCode({
      pixKey: 'pix@example.com',
      merchantName: 'Evento de teste',
      amount: '25.00',
    });

    expect(brCode).toContain('6013NAO INFORMADO');
  });

  it('uses the stored amount when no configured price tier is available', () => {
    const subscription = {
      amountPaid: 2500,
      paymentTier: null,
      majorEvent: {
        majorEventPrices: [],
      },
    } as unknown as CurrentUserMajorEventSubscription;

    expect(component.resolveApplicablePrice(subscription)).toBe(2500);
  });

  it('keeps pending receipt uploads available after the subscription window closes', () => {
    component.readySubscription = () =>
      ({
        subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
        majorEvent: {
          isPaymentRequired: true,
          subscriptionEndDate: '2000-01-01T00:00:00.000Z',
        },
      }) as unknown as CurrentUserMajorEventSubscription;
    component.isUploading = () => false;

    expect(component.canUpload()).toBe(true);
  });

  it('shows the backend PDF page-limit message to the participant', () => {
    expect(
      component.receiptUploadErrorMessage(
        new HttpErrorResponse({ status: 400, error: { message: 'Envie um arquivo com no máximo 10 páginas.' } }),
      ),
    ).toBe('Envie um arquivo com no máximo 10 páginas.');
  });

  it('keeps the newest live refresh when requests finish out of order', () => {
    const older = new Subject<{ subscription: CurrentUserMajorEventSubscription | null; receipt: null }>();
    const newer = new Subject<{ subscription: CurrentUserMajorEventSubscription | null; receipt: null }>();
    const requests = [older, newer];
    const liveComponent = Object.create(PaymentInfo.prototype) as unknown as {
      majorEventId: string;
      state: ReturnType<typeof signal>;
      pageRequestId: number;
      pageRequest(): Subject<{ subscription: CurrentUserMajorEventSubscription | null; receipt: null }>;
      loadPage(background?: boolean): void;
      receiptUploadCooldown: { clear(): void };
      destroyRef: { onDestroy(callback: () => void): () => void };
      analytics: { trackMajorEventTransaction(): void };
      resolveApplicablePrice(): number | null;
    };
    liveComponent.majorEventId = 'major-1';
    liveComponent.state = signal({ status: 'loading' });
    liveComponent.pageRequestId = 0;
    liveComponent.pageRequest = () => requests.shift() as typeof older;
    liveComponent.receiptUploadCooldown = { clear: vi.fn() };
    liveComponent.destroyRef = { onDestroy: () => () => undefined };
    liveComponent.analytics = { trackMajorEventTransaction: vi.fn() };
    liveComponent.resolveApplicablePrice = () => null;
    const oldSubscription = { id: 'old', majorEvent: {} } as CurrentUserMajorEventSubscription;
    const newSubscription = { id: 'new', majorEvent: {} } as CurrentUserMajorEventSubscription;

    liveComponent.loadPage(true);
    liveComponent.loadPage(true);
    newer.next({ subscription: newSubscription, receipt: null });
    older.next({ subscription: oldSubscription, receipt: null });

    expect(liveComponent.state()).toEqual({ status: 'ready', subscription: newSubscription, receipt: null });
  });
});
