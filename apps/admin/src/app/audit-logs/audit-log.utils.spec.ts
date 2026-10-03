import { AUDIT_LOG_ENTITY_TYPE_OPTIONS, auditLogEntityTypeLabel } from './audit-log.utils';

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
