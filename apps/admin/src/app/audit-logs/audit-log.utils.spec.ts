import { AUDIT_LOG_ENTITY_TYPE_OPTIONS, auditLogActorTypeLabel, auditLogEntityTypeLabel, auditLogOperationLabel } from './audit-log.utils';

describe('audit log ticket entity labels', () => {
  it('makes ticket lifecycle entities available as readable audit filters', () => {
    expect(AUDIT_LOG_ENTITY_TYPE_OPTIONS).toEqual(
      expect.arrayContaining([
        { value: 'TICKET', label: 'Bilhete' },
        { value: 'TICKET_TRANSFER', label: 'Transferência de bilhete' },
        { value: 'TICKET_PURCHASE', label: 'Compra de bilhete' },
        { value: 'TICKET_CONFIG', label: 'Configuração de bilhete' },
      ]),
    );
    expect(auditLogEntityTypeLabel('TICKET_PURCHASE')).toBe('Compra de bilhete');
  });
});

describe('audit log labels', () => {
  it('translates known entity types and operations', () => {
    expect(auditLogEntityTypeLabel('EVENT_ATTENDANCE')).toBe('Presença');
    expect(auditLogOperationLabel('REVERT')).toBe('Reversão');
  });

  it('uses Portuguese fallbacks when the API returns a newer enum value', () => {
    expect(auditLogEntityTypeLabel('FUTURE_ENTITY')).toBe('Tipo de registro não identificado');
    expect(auditLogOperationLabel('FUTURE_OPERATION')).toBe('Ação não identificada');
    expect(auditLogActorTypeLabel('FUTURE_ACTOR')).toBe('Tipo de autor não identificado');
  });
});
