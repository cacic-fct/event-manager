import type { CurrentUserMajorEventSubscription } from '@cacic-fct/shared-utils';
import { HttpErrorResponse } from '@angular/common/http';
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
});
