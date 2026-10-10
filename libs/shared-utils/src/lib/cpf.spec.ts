import { formatCPF, isValidCPF, maskCPF, unformatCPF } from './cpf';

describe('CPF helpers', () => {
  it('uses the middle-digit mask without exposing incomplete documents', () => {
    expect(maskCPF('52998224725')).toBe('•••.982.247-••');
    expect(maskCPF('529.982.247-25')).toBe('•••.982.247-••');
    expect(maskCPF('52998')).toBe('••••••••');
  });
  it('accepts valid CPF values with or without punctuation', () => {
    expect(isValidCPF('52998224725')).toBe(true);
    expect(isValidCPF('529.982.247-25')).toBe(true);
  });

  it('rejects invalid lengths, repeated digits, and incorrect check digits', () => {
    expect(isValidCPF('')).toBe(false);
    expect(isValidCPF('123')).toBe(false);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCPF('529.982.247-24')).toBe(false);
  });

  it('formats only complete CPF values and strips punctuation consistently', () => {
    expect(formatCPF('52998224725')).toBe('529.982.247-25');
    expect(formatCPF('529.982.247-25')).toBe('529.982.247-25');
    expect(formatCPF('123')).toBe('123');
    expect(unformatCPF('529.982.247-25')).toBe('52998224725');
    expect(unformatCPF('CPF: 529.982.247-25')).toBe('52998224725');
  });
});
