import { isValidCPF } from '@cacic-fct/shared-utils';
import { CandidateMatch, MatchablePerson, MergeMatchMethod } from './types';

const MATCH_METHOD_PRIORITY: Record<MergeMatchMethod, number> = {
  CPF: 3,
  EMAIL: 2,
  NORMALIZED_NAME: 1,
};
const MAX_PAIRS_PER_BUCKET = 1000;

export function collectCpfMatches(people: MatchablePerson[], matches: Map<string, CandidateMatch>): void {
  const byCpf = new Map<string, MatchablePerson[]>();

  for (const person of people) {
    const cpf = normalizeCpf(person.identityDocument);
    if (!cpf || !isValidCpf(cpf)) {
      continue;
    }

    const group = byCpf.get(cpf) ?? [];
    group.push(person);
    byCpf.set(cpf, group);
  }

  for (const [cpf, group] of byCpf.entries()) {
    registerPairs(group, matches, 'CPF', cpf, 1);
  }
}

export function collectEmailMatches(people: MatchablePerson[], matches: Map<string, CandidateMatch>): void {
  const byEmail = new Map<string, MatchablePerson[]>();

  for (const person of people) {
    const email = normalizeEmail(person.email);
    if (!email) {
      continue;
    }

    const group = byEmail.get(email) ?? [];
    group.push(person);
    byEmail.set(email, group);
  }

  for (const [email, group] of byEmail.entries()) {
    registerPairs(group, matches, 'EMAIL', email, 0.85);
  }
}

export function collectNameMatches(people: MatchablePerson[], matches: Map<string, CandidateMatch>): void {
  const byName = new Map<string, MatchablePerson[]>();

  for (const person of people) {
    const normalizedName = normalizeName(person.name);
    if (!normalizedName || normalizedName.length < 5) {
      continue;
    }

    const group = byName.get(normalizedName) ?? [];
    group.push(person);
    byName.set(normalizedName, group);
  }

  for (const [normalizedName, group] of byName.entries()) {
    registerPairs(group, matches, 'NORMALIZED_NAME', normalizedName, 0.6);
  }
}

export function normalizeCpf(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  const digits = rawValue.replace(/\D/g, '');
  if (digits.length !== 11) {
    return null;
  }

  return digits;
}

export function isValidCpf(cpf: string): boolean {
  return isValidCPF(cpf);
}

export function normalizeEmail(rawValue: string | null): string | null {
  const email = rawValue?.trim().toLowerCase();
  return email || null;
}

export function normalizeName(rawValue: string): string {
  return rawValue
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function registerPairs(
  group: Array<{ id: string }>,
  matches: Map<string, CandidateMatch>,
  method: MergeMatchMethod,
  matchValue: string,
  score: number,
): void {
  if (group.length < 2) {
    return;
  }

  let pairCount = 0;
  for (let i = 0; i < group.length - 1 && pairCount < MAX_PAIRS_PER_BUCKET; i += 1) {
    for (let j = i + 1; j < group.length && pairCount < MAX_PAIRS_PER_BUCKET; j += 1) {
      pairCount += 1;
      const [personAId, personBId] = [group[i].id, group[j].id].sort();
      const pairKey = `${personAId}:${personBId}`;
      const current = matches.get(pairKey);
      if (!current) {
        matches.set(pairKey, {
          personAId,
          personBId,
          pairKey,
          method,
          matchValue,
          score,
        });
        continue;
      }

      const currentPriority = MATCH_METHOD_PRIORITY[current.method];
      const nextPriority = MATCH_METHOD_PRIORITY[method];
      if (nextPriority > currentPriority) {
        matches.set(pairKey, {
          personAId,
          personBId,
          pairKey,
          method,
          matchValue,
          score,
        });
        continue;
      }

      if (nextPriority === currentPriority && score > current.score) {
        matches.set(pairKey, {
          personAId,
          personBId,
          pairKey,
          method,
          matchValue,
          score,
        });
      }
    }
  }
}
