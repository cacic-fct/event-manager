import {
  receiptProcessingStatusLabel,
  sportsParticipantSourceLabel,
  sportsPaymentStatusLabel,
  subscriptionCreationMethodLabel,
} from './subscription-labels';

describe('subscription display labels', () => {
  it('translates subscription creation methods and hides unknown enum values', () => {
    expect(subscriptionCreationMethodLabel('ADMIN_DASHBOARD')).toBe('Criada pela administração');
    expect(subscriptionCreationMethodLabel('SELF_SUBSCRIPTION')).toBe('Feita pela própria pessoa');
    expect(subscriptionCreationMethodLabel('UNKNOWN')).toBe('Origem não identificada');
    expect(subscriptionCreationMethodLabel('FUTURE_METHOD')).toBe('Origem não identificada');
  });

  it('translates every receipt processing state and gives unknown states a safe label', () => {
    expect(receiptProcessingStatusLabel('PENDING')).toBe('Aguardando processamento');
    expect(receiptProcessingStatusLabel('OCR_DONE')).toBe('Texto extraído');
    expect(receiptProcessingStatusLabel('CONVERTED')).toBe('Comprovante convertido');
    expect(receiptProcessingStatusLabel('FAILED')).toBe('Falha no processamento');
    expect(receiptProcessingStatusLabel('UNKNOWN')).toBe('Processamento não identificado');
  });

  it('translates sports payment and participant source states, including unknown values', () => {
    expect(sportsPaymentStatusLabel('NOT_REQUIRED')).toBe('Pagamento não exigido');
    expect(sportsPaymentStatusLabel('NOT_AVAILABLE')).toBe('Pagamento indisponível');
    expect(sportsPaymentStatusLabel('WAITING_APPROVAL')).toBe('Aguardando aprovação');
    expect(sportsPaymentStatusLabel('WAITING_PAYMENT')).toBe('Aguardando pagamento');
    expect(sportsPaymentStatusLabel('UNDER_REVIEW')).toBe('Pagamento em análise');
    expect(sportsPaymentStatusLabel('PAID')).toBe('Pagamento confirmado');
    expect(sportsPaymentStatusLabel('REJECTED')).toBe('Pagamento rejeitado');
    expect(sportsPaymentStatusLabel('UNKNOWN')).toBe('Situação do pagamento não informada');

    expect(sportsParticipantSourceLabel('ADMIN')).toBe('Adicionada pela administração');
    expect(sportsParticipantSourceLabel('TEAM_ASSIGNMENT')).toBe('Adicionada por equipe');
    expect(sportsParticipantSourceLabel('SELF_SUBSCRIPTION')).toBe('Inscrição da própria pessoa');
    expect(sportsParticipantSourceLabel('UNKNOWN')).toBe('Origem não identificada');
  });
});
