import {
  AUDIT_LOG_ENTITY_TYPE_OPTIONS,
  AUDIT_LOG_OPERATION_OPTIONS,
  auditLogActorTypeLabel,
  auditLogEntityTypeLabel,
  auditLogOperationIcon,
  auditLogOperationLabel,
} from './audit-log.utils';

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

  it('labels every currently recorded audit operation in filters and history rows', () => {
    const operations = [
      ['SUBMIT', 'Envio', 'send'],
      ['REQUEST_CHANGES', 'Solicitação de ajustes', 'rate_review'],
      ['ASSIGN', 'Atribuição', 'assignment_ind'],
      ['START', 'Início', 'play_arrow'],
      ['PAUSE', 'Pausa', 'pause'],
      ['RESUME', 'Retomada', 'play_arrow'],
      ['SCORE', 'Pontuação', 'sports_score'],
      ['FINALIZE', 'Finalização', 'task_alt'],
    ] as const;

    for (const [operation, label, icon] of operations) {
      expect(AUDIT_LOG_OPERATION_OPTIONS).toContainEqual({ value: operation, label });
      expect(auditLogOperationLabel(operation)).toBe(label);
      expect(auditLogOperationIcon(operation)).toBe(icon);
    }
  });

  it('offers readable audit filters for permission and sports entity types', () => {
    const entityTypes = [
      ['PERMISSION_ROLE', 'Perfil de permissões'],
      ['PERMISSION_GROUP', 'Grupo de permissões'],
      ['SPORTS_TOURNAMENT', 'Torneio esportivo'],
      ['SPORTS_CATEGORY', 'Categoria esportiva'],
      ['SPORTS_TEAM', 'Equipe esportiva'],
      ['SPORTS_TEAM_MEMBER', 'Integrante de equipe'],
      ['SPORTS_REGISTRATION', 'Inscrição esportiva'],
      ['SPORTS_TEAM_CHANGE_REQUEST', 'Solicitação de alteração de equipe'],
      ['SPORTS_VENUE', 'Local esportivo'],
      ['SPORTS_MATCH', 'Partida esportiva'],
      ['SPORTS_MATCH_ROSTER', 'Escalação de partida'],
      ['SPORTS_MATCH_ACTION', 'Ação de partida'],
      ['SPORTS_OFFICIAL_ASSIGNMENT', 'Designação de arbitragem'],
      ['SPORTS_PLAYER_APPLICATION', 'Inscrição de atleta'],
      ['SPORTS_TOURNAMENT_SCORE', 'Pontuação de torneio'],
    ] as const;

    for (const [entityType, label] of entityTypes) {
      expect(AUDIT_LOG_ENTITY_TYPE_OPTIONS).toContainEqual({ value: entityType, label });
      expect(auditLogEntityTypeLabel(entityType)).toBe(label);
    }
  });
});
