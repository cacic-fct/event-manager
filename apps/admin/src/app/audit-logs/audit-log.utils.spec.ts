import { auditLogActorTypeLabel, auditLogEntityTypeLabel, auditLogOperationLabel } from './audit-log.utils';

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
