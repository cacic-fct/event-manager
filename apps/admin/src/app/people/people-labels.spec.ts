import { linkedResourceStatusLabel, unespRoleListLabel, userRoleLabel } from './people-labels';

describe('people labels', () => {
  it('shows access roles in Portuguese and hides unfamiliar codes', () => {
    expect(userRoleLabel('EVENT_MANAGER')).toBe('Gestor de eventos');
    expect(userRoleLabel('ADMIN')).toBe('Administrador');
    expect(userRoleLabel('FUTURE_ROLE')).toBe('Outro perfil');
    expect(userRoleLabel(null)).toBe('Perfil não informado');
  });

  it('formats each UNESP role and uses the shared fallback for unknown roles', () => {
    expect(unespRoleListLabel(['professor', 'external'])).toBe('Professor, Externo');
    expect(unespRoleListLabel(['aluno-graduacao'], '001234')).toBe('Aluno de Ciência da Computação');
    expect(unespRoleListLabel(['future-role'])).toBe('Vínculo com a Unesp não informado');
  });

  it('translates linked-resource enum states while retaining supplied Portuguese copy', () => {
    expect(linkedResourceStatusLabel('CONFIRMED')).toBe('Inscrição confirmada');
    expect(linkedResourceStatusLabel('PUBLISHED')).toBe('Publicado');
    expect(linkedResourceStatusLabel('ROLLED_BACK')).toBe('Revertida');
    expect(linkedResourceStatusLabel('FUTURE_STATUS')).toBe('Situação não identificada');
    expect(linkedResourceStatusLabel('Emitido')).toBe('Emitido');
    expect(linkedResourceStatusLabel('Cargo direto')).toBe('Cargo direto');
    expect(linkedResourceStatusLabel('Grupo')).toBe('Grupo');
    expect(linkedResourceStatusLabel('COMMITTED')).toBe('Presenças registradas');
    expect(linkedResourceStatusLabel(null)).toBe('Situação não informada');
  });
});
