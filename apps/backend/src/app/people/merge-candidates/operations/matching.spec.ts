import { collectCpfMatches, collectEmailMatches, collectNameMatches, isValidCpf, normalizeName } from './matching';
import { CandidateMatch, MatchablePerson } from './types';

describe('merge candidate matching helpers', () => {
  it('normalizes names for accent and punctuation insensitive matching', () => {
    expect(normalizeName('  José   da-Silva! ')).toBe('jose da silva');
  });

  it('validates CPF values before registering matches', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('52998224724')).toBe(false);
  });

  it('collects CPF matches with the highest priority for the same pair', () => {
    const people: MatchablePerson[] = [
      person('person-b', 'Maria Souza', 'same@example.com', '529.982.247-25'),
      person('person-a', 'Maria Souza', 'SAME@example.com', '52998224725'),
    ];
    const matches = new Map<string, CandidateMatch>();

    collectNameMatches(people, matches);
    collectEmailMatches(people, matches);
    collectCpfMatches(people, matches);

    expect([...matches.values()]).toEqual([
      {
        personAId: 'person-a',
        personBId: 'person-b',
        pairKey: 'person-a:person-b',
        method: 'CPF',
        matchValue: '52998224725',
        score: 1,
      },
    ]);
  });

  it('collects normalized email and name matches while ignoring short names', () => {
    const people: MatchablePerson[] = [
      person('person-a', 'Ana', 'Ada@Example.com ', null),
      person('person-b', 'Ada Lovelace', 'ada@example.com', null),
      person('person-c', 'Áda   Lovelace', null, null),
    ];
    const matches = new Map<string, CandidateMatch>();

    collectEmailMatches(people, matches);
    collectNameMatches(people, matches);

    expect(matches.get('person-a:person-b')).toMatchObject({
      method: 'EMAIL',
      matchValue: 'ada@example.com',
      score: 0.85,
    });
    expect(matches.get('person-b:person-c')).toMatchObject({
      method: 'NORMALIZED_NAME',
      matchValue: 'ada lovelace',
      score: 0.6,
    });
    expect(matches.has('person-a:person-c')).toBe(false);
  });
});

function person(
  id: string,
  name: string,
  email: string | null,
  identityDocument: string | null,
): MatchablePerson {
  return {
    id,
    name,
    email,
    identityDocument,
  };
}
