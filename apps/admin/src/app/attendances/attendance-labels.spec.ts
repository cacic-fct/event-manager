import {
  attendanceCategoryLabel,
  attendanceCurrentAssessmentLabel,
  attendanceCreationMethodLabel,
  attendanceImportMatchTypeLabel,
  attendanceReviewKindLabel,
} from './attendance-labels';

describe('attendance labels', () => {
  it('describes ticket eligibility requirements', () => {
    expect(attendanceCurrentAssessmentLabel('TICKET_REQUIRED')).toBe('Bilhete não disponível');
  });

  it('translates attendance categories and methods, including unrecognized values', () => {
    expect(attendanceCategoryLabel('NON_REGULAR')).toBe('Não regular');
    expect(attendanceCategoryLabel('UNKNOWN')).toBe('Sem classificação');
    expect(attendanceCategoryLabel('FUTURE_CATEGORY')).toBe('Categoria não identificada');
    expect(attendanceCreationMethodLabel('SCANNER')).toBe('Leitor de crachá');
    expect(attendanceCreationMethodLabel('FUTURE_METHOD')).toBe('Método não identificado');
  });

  it('keeps review signals and import matching criteria readable', () => {
    expect(attendanceReviewKindLabel('REPEATED_SCAN_ATTEMPTS')).toBe('Leituras repetidas');
    expect(attendanceReviewKindLabel('FUTURE_SIGNAL')).toBe('Outro tipo de aviso');
    expect(attendanceImportMatchTypeLabel('CUSTOM')).toBe('campo personalizado');
    expect(attendanceImportMatchTypeLabel('FUTURE_MATCH')).toBe('critério de identificação não identificado');
  });

  it('explains current eligibility separately from the recorded attendance category', () => {
    expect(attendanceCurrentAssessmentLabel('REQUIREMENTS_CURRENTLY_MET')).toBe(
      'Pessoa atende às regras de presença regular',
    );
    expect(attendanceCurrentAssessmentLabel('PRICE_TIER_NOT_ELIGIBLE')).toBe(
      'Faixa de pagamento não permite presença regular',
    );
    expect(attendanceCurrentAssessmentLabel('INVITATION_REQUIRED')).toBe(
      'Sem convite para presença regular',
    );
    expect(attendanceCurrentAssessmentLabel('ACTIVITY_SUBSCRIPTION_MISSING')).toBe('Sem inscrição ativa na atividade');
    expect(attendanceCurrentAssessmentLabel('MAJOR_EVENT_PAYMENT_AWAITING_RECEIPT')).toBe(
      'Aguardando comprovante do grande evento',
    );
    expect(attendanceCurrentAssessmentLabel('MAJOR_EVENT_PAYMENT_NOT_CONFIRMED')).toBe(
      'Pagamento do grande evento não confirmado',
    );
    expect(attendanceCurrentAssessmentLabel('MAJOR_EVENT_PAYMENT_UNDER_REVIEW')).toBe(
      'Comprovante do grande evento em análise',
    );
    expect(attendanceCurrentAssessmentLabel('FUTURE_ASSESSMENT')).toBe('Situação de elegibilidade não identificada');
    expect(attendanceCurrentAssessmentLabel(null)).toBeNull();
  });
});
