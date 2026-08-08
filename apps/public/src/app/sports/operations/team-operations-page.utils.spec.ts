import { describe, expect, it } from 'vitest';
import {
  normalizeShirtNumber,
  parseRepresentativeChangeDelta,
  representativeChangeLabel,
  representativeChangeStatusLabel,
} from './team-operations-page.utils';

describe('team operations page utilities', () => {
  it('labels representative changes in Brazilian Portuguese', () => {
    expect(representativeChangeLabel('MEMBER_ADD')).toBe('Inclusão de atleta');
    expect(representativeChangeStatusLabel('CHANGES_REQUESTED')).toBe('Ajustes solicitados');
  });

  it('accepts object deltas and rejects invalid JSON shapes', () => {
    expect(parseRepresentativeChangeDelta('{"name":"Equipe Azul"}')).toEqual({ name: 'Equipe Azul' });
    expect(parseRepresentativeChangeDelta('["invalid"]')).toEqual({});
    expect(parseRepresentativeChangeDelta('{')).toEqual({});
  });

  it('normalizes supported shirt numbers', () => {
    expect(normalizeShirtNumber(' 10-A ')).toBe('10-A');
    expect(normalizeShirtNumber('number with spaces')).toBeNull();
  });
});
