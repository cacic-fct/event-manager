import { matchesWorkspaceText } from './workspace-text-search';

describe('complete catalog text search', () => {
  it('finds a role through accents and words spread across its name and description', () => {
    expect(matchesWorkspaceText(' inscricoes EQUIPE ', ['Equipe', 'Validação de inscrições'])).toBe(true);
    expect(matchesWorkspaceText('pagamentos', ['Equipe', 'Validação de inscrições'])).toBe(false);
    expect(matchesWorkspaceText('', [null, undefined])).toBe(true);
  });
});
