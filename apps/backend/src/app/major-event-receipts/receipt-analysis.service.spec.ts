import { ReceiptAnalysisService } from './receipt-analysis.service';

describe('ReceiptAnalysisService', () => {
  let service: ReceiptAnalysisService;

  beforeEach(() => {
    service = new ReceiptAnalysisService();
  });

  it('matches Brazilian real values even when OCR adds spaces after R$', () => {
    const result = service.analyze('Pagamento recebido no valor de R$     1.234,56', 'Ana Silva', 123456);

    expect(result.amountMatched).toBe(true);
    expect(result.matchedAmountCents).toBe(123456);
  });

  it('normalizes names by removing accents, particles, and non-latin characters', () => {
    const result = service.analyze('favorecido: JOAO SILVA PEREIRA', 'João da Silva Pereira', 1000);

    expect(result.nameMatched).toBe(true);
    expect(result.matchedNameText).toBe('joao silva pereira');
  });

  it('matches full name with middle-name initials except first and last name', () => {
    const result = service.analyze('pagador joao s p santos', 'João Silva Pereira dos Santos', 1000);

    expect(result.nameMatched).toBe(true);
    expect(result.matchedNameText).toBe('joao s p santos');
  });

  it('matches first name and any other name in any position', () => {
    const result = service.analyze('comprovante para silva valor pago por joao', 'João Silva Pereira', 1000);

    expect(result.nameMatched).toBe(true);
    expect(result.matchedNameText).toBe('joao silva');
  });

  it('does not match when only the first name appears', () => {
    const result = service.analyze('pagador joao valor R$ 10,00', 'João Silva Pereira', 1000);

    expect(result.nameMatched).toBe(false);
  });
});
