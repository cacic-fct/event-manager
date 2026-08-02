import { PaymentInfo } from './payment-info';

describe('PaymentInfo Pix key normalization', () => {
  const component = Object.create(PaymentInfo.prototype) as {
    normalizePixKey(value: string): string;
  };

  it('normalizes formatted alphanumeric CNPJ Pix keys', () => {
    expect(component.normalizePixKey('12.345.678/ABCD-95')).toBe('12345678ABCD95');
  });

  it('keeps existing numeric CNPJ Pix key normalization', () => {
    expect(component.normalizePixKey('12.345.678/0001-95')).toBe('12345678000195');
  });
});
