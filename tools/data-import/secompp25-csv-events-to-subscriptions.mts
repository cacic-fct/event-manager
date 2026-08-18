#!/usr/bin/env node

import process from 'node:process';
import { resolve } from 'node:path';
import { connectPostgres, isMain, resolveDatabaseUrlFromEnvOptions } from './lib/common.mts';
import { readCsvFile, writeCsvAtomic } from './lib/csv.mts';
import type { CsvDocument, CsvRow } from './lib/csv.mts';
import { canonicalHeader, normalizeSpaces, normalizeTextKey } from './lib/text.mts';

export const ALL_USERS_EVENT_NAMES = [
  'Aspectos Essenciais para a Eficiência no Desenvolvimento de Software',
  'Democratizando IA para saúde de forma segura, robusta e justa',
  'Mesa Redonda',
  'Como se destacar no mercado de trabalho',
  'Desmistificando a Carreira em Dados & IA',
];

export const NON_EVENT_KEYS = new Set([
  '',
  'nao quero me inscrever nesse horario',
  'sou responsavel ja conferi novamente meus horarios e nao ha conflito de horario',
  'segm',
  'segt',
  'term',
  'tert',
  'quam',
  'quat',
  'quim',
  'quit',
  'sexm',
  'sext',
]);

const EVENT_COLUMN_PATTERN = /^(segunda|terca|quarta|quinta|sexta)\s*-\s*(manha|tarde)\b|^(mesa redonda|palestra .+periodo noturno)\b/iu;
const VAGAS_SUFFIX_PATTERN = /\s*\(\s*\d+\s+vagas?\s*\)$/iu;
const SCHEDULE_SUFFIX_PATTERN = /\s*\(([^()]*)\)\s*$/u;
const DB_PART_SUFFIX_PATTERN = /\s*-\s*parte\s*(1|2)\s*$/iu;
const LEADING_ARTICLE_PATTERN = /^(a|o)\s+/iu;
const PART_1_PATTERN = /\b(primeira\s+parte|1a\s+parte|1\s+parte|parte\s*1)\b/u;
const PART_2_PATTERN = /\b(segunda\s+parte|2a\s+parte|2\s+parte|parte\s*2)\b/u;
const SCHEDULE_HINTS = new Set([
  'parte',
  'segunda',
  'terca',
  'quarta',
  'quinta',
  'sexta',
  'manha',
  'tarde',
  'feira',
]);
const STOP_WORDS = new Set([
  'a',
  'ao',
  'as',
  'com',
  'da',
  'das',
  'de',
  'do',
  'dos',
  'e',
  'em',
  'na',
  'no',
  'o',
  'os',
  'para',
  'um',
  'uma',
]);

export const FULL_NAME_COLUMN_KEY = 'nome completo';
export const EMAIL_COLUMN_KEY = 'endereco de e-mail';
export const ENROLLMENT_COLUMN_KEY = 'r.a (aluno da unesp)';
export const IDENTITY_COLUMN_KEY = 'cpf (visitante)';

export type EventPartNumber = 1 | 2 | null;

export interface Secompp25Args {
  input: string;
  output: string;
  envFile: string;
  databaseUrl: string;
  eventYear: number;
  help: boolean;
}

export interface DatabaseEventRow {
  [column: string]: unknown;
  id: string;
  name: string;
}

export type DatabaseEventInput = DatabaseEventRow | readonly [string, string];

export interface EventRow {
  eventId: string;
  eventName: string;
  fullKey: string;
  baseKey: string;
  partNumber: EventPartNumber;
}

export interface EventQueryResult {
  rows: unknown[];
}

export interface EventQueryClient {
  query(config: { text: string; values: number[] }): Promise<EventQueryResult>;
}

export interface EventResolution {
  eventIdByInputName: Map<string, string>;
  missingEventNames: string[];
  ambiguousEventNames: Array<[string, EventRow[]]>;
  eventRows: EventRow[];
  eventsByFullKey: Map<string, EventRow[]>;
}

interface RowPayload {
  fullName: string;
  email: string;
  enrollmentNumber: string;
  identityDocument: string;
  selectedEventNames: string[];
}

function isDatabaseEventRow(value: unknown): value is DatabaseEventRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  );
}

function isDatabaseEventTuple(value: DatabaseEventInput): value is readonly [string, string] {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string';
}

export class Secompp25InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Secompp25InputError';
  }
}

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): Secompp25Args {
  const args: Secompp25Args = {
    input: 'Cópia de Inscrição SECOMPP25 (respostas) - Inscrições SECOMPP.csv',
    output: 'import/secompp25_subscriptions.csv',
    envFile: '.env',
    databaseUrl: '',
    eventYear: 2025,
    help: false,
  };
  const valueFlags = new Set([
    '--input',
    '--output',
    '--env-file',
    '--database-url',
    '--event-year',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) continue;
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    const equalsIndex = token.indexOf('=');
    const flag = equalsIndex >= 0 ? token.slice(0, equalsIndex) : token;
    if (!valueFlags.has(flag)) throw new Secompp25InputError(`Unknown argument: ${token}`);
    const inlineValue = equalsIndex >= 0 ? token.slice(equalsIndex + 1) : undefined;
    const value = inlineValue ?? argv[++index];
    if (value === undefined || value.startsWith('--')) {
      throw new Secompp25InputError(`Argument ${flag} requires a value.`);
    }
    if (flag === '--event-year') {
      args.eventYear = Number(value);
      if (!Number.isInteger(args.eventYear)) {
        throw new Secompp25InputError(`Argument ${flag} must be an integer.`);
      }
    } else {
      switch (flag) {
        case '--input':
          args.input = value;
          break;
        case '--output':
          args.output = value;
          break;
        case '--env-file':
          args.envFile = value;
          break;
        case '--database-url':
          args.databaseUrl = value;
          break;
      }
    }
  }
  return args;
}

export function usage() {
  return [
    'Usage: bun run data-import -- secompp25-csv-events-to-subscriptions [options]',
    '',
    'Options:',
    '  --input <path>          Google Forms CSV input',
    '  --output <path>         Normalized subscriptions CSV',
    '  --env-file <path>       .env file containing DATABASE_URL (default: .env)',
    '  --database-url <url>    Direct PostgreSQL URL (overrides --env-file)',
    '  --event-year <year>     Event start year (default: 2025)',
  ].join('\n');
}

export function normalizeEventName(value: unknown): string {
  const normalized = String(value ?? '')
    .normalize('NFKC')
    .replace(/[“”]/gu, '"')
    .replace(/[‘’´`]/gu, "'");
  return normalizeSpaces(normalized)
    .replace(VAGAS_SUFFIX_PATTERN, '')
    .replace(/[ .,:;]+$/u, '')
    .toLocaleLowerCase('und');
}

export function isEventColumn(columnName: string): boolean {
  return EVENT_COLUMN_PATTERN.test(canonicalHeader(columnName));
}

export function findColumnName(fieldnames: readonly string[], expectedKey: string): string {
  const match = fieldnames.find((name) => canonicalHeader(name) === expectedKey);
  if (match) return match;
  throw new Secompp25InputError(`CSV column not found: ${expectedKey}`);
}

export function detectPartNumber(value: unknown): EventPartNumber {
  const normalized = normalizeTextKey(value);
  if (PART_1_PATTERN.test(normalized)) return 1;
  if (PART_2_PATTERN.test(normalized)) return 2;
  return null;
}

export function stripScheduleSuffixParentheses(value: string): string {
  const match = SCHEDULE_SUFFIX_PATTERN.exec(value);
  if (!match) return value;
  const suffixKey = normalizeTextKey(match[1]);
  if ([...SCHEDULE_HINTS].some((hint) => suffixKey.split(' ').includes(hint))) {
    return value.slice(0, match.index).trim();
  }
  return value;
}

export function computeBaseKey(value: string): [string, EventPartNumber] {
  const partNumber = detectPartNumber(value);
  let base = normalizeSpaces(value).replace(VAGAS_SUFFIX_PATTERN, '');
  base = stripScheduleSuffixParentheses(base);
  base = base.replace(DB_PART_SUFFIX_PATTERN, '').trim().replace(/[ .,:;]+$/u, '');
  let baseKey = normalizeEventName(base);
  baseKey = baseKey.replace(LEADING_ARTICLE_PATTERN, '').replace(/^[ -]+|[ -]+$/gu, '');
  return [baseKey, partNumber];
}

export function isNonEventValue(value: unknown): boolean {
  return NON_EVENT_KEYS.has(normalizeTextKey(value));
}

export function extractEventName(rawValue: unknown): string | null {
  if (rawValue == null) return null;
  const text = normalizeSpaces(String(rawValue).normalize('NFKC'));
  if (!text || text.toLocaleLowerCase('und').startsWith('http://') || text.toLocaleLowerCase('und').startsWith('https://')) {
    return null;
  }
  if (isNonEventValue(text)) return null;
  const eventName = text.replace(VAGAS_SUFFIX_PATTERN, '').trim();
  if (!eventName || isNonEventValue(eventName)) return null;
  return eventName;
}

export function buildEventRows(databaseRows: readonly DatabaseEventInput[]): EventRow[] {
  return databaseRows.map((row) => {
    const eventId = isDatabaseEventTuple(row) ? row[0] : row.id;
    const eventName = isDatabaseEventTuple(row) ? row[1] : row.name;
    const [baseKey, partNumber] = computeBaseKey(eventName);
    return {
      eventId,
      eventName,
      fullKey: normalizeEventName(eventName),
      baseKey,
      partNumber,
    };
  });
}

export async function fetchEvents(client: EventQueryClient, eventYear: number): Promise<DatabaseEventRow[]> {
  const result = await client.query({
    text: 'SELECT id, name FROM events WHERE "deletedAt" IS NULL AND EXTRACT(YEAR FROM "startDate") = $1',
    values: [eventYear],
  });
  return result.rows.filter(isDatabaseEventRow);
}

export function dedupePreservingOrder<T>(values: readonly T[]): T[] {
  const seen = new Set<T>();
  const ordered: T[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
}

export function findTokenMatches(
  baseKey: string,
  partNumber: EventPartNumber,
  eventRows: readonly EventRow[],
): EventRow[] {
  const tokens = baseKey.split(' ').filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
  if (tokens.length === 0) return [];
  const tokenMatches = eventRows.filter((row) => tokens.every((token) => row.baseKey.includes(token)));
  if (partNumber != null) {
    const exactPartMatches = tokenMatches.filter((row) => row.partNumber === partNumber);
    if (exactPartMatches.length > 0) return exactPartMatches;
    const noPartMatches = tokenMatches.filter((row) => row.partNumber == null);
    if (noPartMatches.length > 0) return noPartMatches;
  }
  return tokenMatches;
}

interface SubstringMatch {
  length: number;
  aStart: number;
  bStart: number;
}

function longestCommonSubstring(
  a: string,
  b: string,
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): SubstringMatch {
  let best: SubstringMatch = { length: 0, aStart, bStart };
  const previous: number[] = new Array(bEnd - bStart + 1).fill(0);
  for (let ai = aStart; ai < aEnd; ai += 1) {
    const current: number[] = new Array(previous.length).fill(0);
    for (let bi = bStart; bi < bEnd; bi += 1) {
      if (a[ai] !== b[bi]) continue;
      const length = (previous[bi - bStart] ?? 0) + 1;
      current[bi - bStart + 1] = length;
      const matchStart = ai - length + 1;
      const otherStart = bi - length + 1;
      if (
        length > best.length ||
        (length === best.length && (matchStart < best.aStart || (matchStart === best.aStart && otherStart < best.bStart)))
      ) {
        best = { length, aStart: matchStart, bStart: otherStart };
      }
    }
    previous.splice(0, previous.length, ...current);
  }
  return best;
}

function sequenceMatcherMatches(
  a: string,
  b: string,
  aStart = 0,
  aEnd = a.length,
  bStart = 0,
  bEnd = b.length,
): number {
  if (aStart >= aEnd || bStart >= bEnd) return 0;
  const match = longestCommonSubstring(a, b, aStart, aEnd, bStart, bEnd);
  if (match.length === 0) return 0;
  return (
    match.length +
    sequenceMatcherMatches(a, b, aStart, match.aStart, bStart, match.bStart) +
    sequenceMatcherMatches(
      a,
      b,
      match.aStart + match.length,
      aEnd,
      match.bStart + match.length,
      bEnd,
    )
  );
}

export function sequenceMatcherRatio(a: string, b: string): number {
  if (a === b) return 1;
  const total = a.length + b.length;
  return total === 0 ? 1 : (2 * sequenceMatcherMatches(a, b)) / total;
}

export function getCloseMatches(
  value: string,
  possibilities: readonly string[],
  count: number,
  cutoff: number,
): string[] {
  return possibilities
    .map((candidate, index) => ({ candidate, index, ratio: sequenceMatcherRatio(value, candidate) }))
    .filter((item) => item.ratio >= cutoff)
    .sort((left, right) => right.ratio - left.ratio || left.index - right.index)
    .slice(0, count)
    .map((item) => item.candidate);
}

export function resolveEventNames(
  eventNames: readonly string[],
  databaseRows: readonly DatabaseEventInput[],
): EventResolution {
  const eventRows = buildEventRows(databaseRows);
  const eventsByFullKey = new Map<string, EventRow[]>();
  const eventsByBaseKey = new Map<string, EventRow[]>();
  for (const row of eventRows) {
    const fullMatches = eventsByFullKey.get(row.fullKey) ?? [];
    fullMatches.push(row);
    eventsByFullKey.set(row.fullKey, fullMatches);
    const baseMatches = eventsByBaseKey.get(row.baseKey) ?? [];
    baseMatches.push(row);
    eventsByBaseKey.set(row.baseKey, baseMatches);
  }
  const allDatabaseFullKeys = [...eventsByFullKey.keys()];
  const eventIdByInputName = new Map<string, string>();
  const missingEventNames: string[] = [];
  const ambiguousEventNames: Array<[string, EventRow[]]> = [];

  for (const eventName of eventNames) {
    const fullKey = normalizeEventName(eventName);
    const fullMatches = eventsByFullKey.get(fullKey) ?? [];
    const exactMatch = fullMatches[0];
    if (fullMatches.length === 1 && exactMatch) {
      eventIdByInputName.set(eventName, exactMatch.eventId);
      continue;
    }
    if (fullMatches.length > 1) {
      ambiguousEventNames.push([eventName, fullMatches]);
      continue;
    }

    const [baseKey, partNumber] = computeBaseKey(eventName);
    const baseMatches = eventsByBaseKey.get(baseKey) ?? [];
    let candidateMatches: EventRow[] = [];
    if (partNumber != null) {
      candidateMatches = baseMatches.filter((row) => row.partNumber === partNumber);
      if (candidateMatches.length === 0) candidateMatches = baseMatches.filter((row) => row.partNumber == null);
    } else {
      const noPartMatches = baseMatches.filter((row) => row.partNumber == null);
      candidateMatches = noPartMatches.length === 1 ? noPartMatches : baseMatches;
    }
    if (candidateMatches.length === 0) candidateMatches = findTokenMatches(baseKey, partNumber, eventRows);
    const candidateMatch = candidateMatches[0];
    if (candidateMatches.length === 1 && candidateMatch) {
      eventIdByInputName.set(eventName, candidateMatch.eventId);
      continue;
    }
    if (candidateMatches.length > 1) {
      ambiguousEventNames.push([eventName, candidateMatches]);
      continue;
    }

    const suggestionKeys = getCloseMatches(fullKey, allDatabaseFullKeys, 1, 0.88);
    const suggestionKey = suggestionKeys[0];
    if (suggestionKeys.length === 1 && suggestionKey) {
      const suggestionRows = eventsByFullKey.get(suggestionKey) ?? [];
      const suggestionRow = suggestionRows[0];
      if (suggestionRows.length === 1 && suggestionRow) {
        eventIdByInputName.set(eventName, suggestionRow.eventId);
        continue;
      }
    }
    if (isNonEventValue(eventName)) continue;
    const normalizedInput = normalizeTextKey(eventName);
    if (normalizedInput === 'la tex' || normalizedInput === 'latex') {
      const latexCandidates = findTokenMatches('latex', null, eventRows);
      const latexCandidate = latexCandidates[0];
      if (latexCandidates.length === 1 && latexCandidate) {
        eventIdByInputName.set(eventName, latexCandidate.eventId);
        continue;
      }
    }
    if (normalizedInput === 'pokeapi' || normalizedInput === 'poke api') {
      const pokeCandidates = findTokenMatches('pokeapi', partNumber, eventRows);
      const pokeCandidate = pokeCandidates[0];
      if (pokeCandidates.length === 1 && pokeCandidate) {
        eventIdByInputName.set(eventName, pokeCandidate.eventId);
        continue;
      }
    }
    if (candidateMatches.length === 0) missingEventNames.push(eventName);
  }
  return { eventIdByInputName, missingEventNames, ambiguousEventNames, eventRows, eventsByFullKey };
}

function printResolutionErrors({
  missingEventNames,
  ambiguousEventNames,
  eventsByFullKey,
}: EventResolution): void {
  if (missingEventNames.length === 0 && ambiguousEventNames.length === 0) return;
  if (missingEventNames.length > 0) {
    process.stderr.write('ERROR: Some events were not found in database:\n');
    const keys = [...eventsByFullKey.keys()];
    for (const missingName of missingEventNames) {
      const suggestionKeys = getCloseMatches(normalizeEventName(missingName), keys, 3, 0.65);
      if (suggestionKeys.length > 0) {
        const suggestions = suggestionKeys.flatMap((key) => (eventsByFullKey.get(key) ?? []).map((row) => row.eventName));
        process.stderr.write(`  - ${missingName} (did you mean: ${suggestions.join(', ')})\n`);
      } else {
        process.stderr.write(`  - ${missingName}\n`);
      }
    }
  }
  if (ambiguousEventNames.length > 0) {
    process.stderr.write('ERROR: Some event names matched multiple database rows:\n');
    for (const [inputName, matches] of ambiguousEventNames) {
      process.stderr.write(`  - ${inputName} -> ${matches.map((row) => `${row.eventName} [${row.eventId}]`).join(', ')}\n`);
    }
  }
  process.stderr.write('ERROR: Continuing and writing CSV with only resolved event IDs.\n');
}

export async function runSecompp25(args: Secompp25Args): Promise<CsvRow[]> {
  const databaseUrl = resolveDatabaseUrlFromEnvOptions({ databaseUrl: args.databaseUrl, envFile: args.envFile });
  const parsed: CsvDocument = await readCsvFile(resolve(args.input));
  const fullNameColumn = findColumnName(parsed.headers, FULL_NAME_COLUMN_KEY);
  const emailColumn = findColumnName(parsed.headers, EMAIL_COLUMN_KEY);
  const enrollmentColumn = findColumnName(parsed.headers, ENROLLMENT_COLUMN_KEY);
  const identityColumn = findColumnName(parsed.headers, IDENTITY_COLUMN_KEY);
  const eventColumns = parsed.headers.filter(isEventColumn);
  if (eventColumns.length === 0) throw new Secompp25InputError('No event columns found in CSV.');

  const rowPayloads: RowPayload[] = [];
  const eventNamesToResolve: string[] = [];
  for (const rawRow of parsed.rows) {
    const selectedEventNames: string[] = [];
    for (const column of eventColumns) {
      const eventName = extractEventName(rawRow[column]);
      if (eventName == null || selectedEventNames.includes(eventName)) continue;
      selectedEventNames.push(eventName);
    }
    eventNamesToResolve.push(...selectedEventNames);
    rowPayloads.push({
      fullName: normalizeSpaces(rawRow[fullNameColumn]),
      email: normalizeSpaces(rawRow[emailColumn]),
      enrollmentNumber: normalizeSpaces(rawRow[enrollmentColumn]),
      identityDocument: normalizeSpaces(rawRow[identityColumn]),
      selectedEventNames,
    });
  }
  const names = dedupePreservingOrder([...eventNamesToResolve, ...ALL_USERS_EVENT_NAMES]);
  const client = await connectPostgres(databaseUrl);
  let databaseRows: DatabaseEventRow[];
  try {
    databaseRows = await fetchEvents(client, args.eventYear);
  } finally {
    await client.end();
  }
  const resolution = resolveEventNames(names, databaseRows);
  printResolutionErrors(resolution);
  const commonEventIds = ALL_USERS_EVENT_NAMES.flatMap((eventName) => {
    const eventId = resolution.eventIdByInputName.get(eventName);
    return eventId === undefined ? [] : [eventId];
  });
  const outputRows: CsvRow[] = rowPayloads.map((row) => {
    const selectedEventIds = row.selectedEventNames.flatMap((eventName) => {
      const eventId = resolution.eventIdByInputName.get(eventName);
      return eventId === undefined ? [] : [eventId];
    });
    return {
      fullName: row.fullName,
      email: row.email,
      enrollmentNumber: row.enrollmentNumber,
      identityDocument: row.identityDocument,
      subscribedEventsId: JSON.stringify(dedupePreservingOrder([...selectedEventIds, ...commonEventIds])),
    };
  });
  await writeCsvAtomic(resolve(args.output), [
    'fullName',
    'email',
    'enrollmentNumber',
    'identityDocument',
    'subscribedEventsId',
  ], outputRows);
  process.stdout.write(`Wrote ${outputRows.length} rows to ${args.output}\n`);
  return outputRows;
}

if (isMain(import.meta.url)) {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
    } else {
      await runSecompp25(args);
    }
  } catch (error) {
    process.stderr.write(`SECOMPP25 CSV import failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
