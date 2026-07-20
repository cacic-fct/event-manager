import { getErrorMessage } from './error-message';

describe('getErrorMessage', () => {
  it('prefers Error messages and non-empty string errors', () => {
    expect(getErrorMessage(new Error('Falha ao salvar'), 'Erro inesperado')).toBe('Falha ao salvar');
    expect(getErrorMessage('Operacao recusada', 'Erro inesperado')).toBe('Operacao recusada');
  });

  it('falls back for empty strings and unknown error shapes', () => {
    expect(getErrorMessage('', 'Erro inesperado')).toBe('Erro inesperado');
    expect(getErrorMessage({ message: 'nao confiavel' }, 'Erro inesperado')).toBe('Erro inesperado');
    expect(getErrorMessage(null, 'Erro inesperado')).toBe('Erro inesperado');
  });
});
