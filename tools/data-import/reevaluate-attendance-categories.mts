#!/usr/bin/env node


import process from 'node:process';
import {
  chunks,
  connectPostgres,
  databaseUrlFromOptions,
  formatCounter,
  isMain,
} from './lib/common.mts';
import {
  coerceBool,
  coerceText,
  extractSubcollection,
  isRecord,
  loadFirestoreExport,
  parseFirestoreTimestamp,
  sortedKeys,
} from './firestore-to-postgres.mts';
import type {
  DatabaseClient,
  DatabaseQueryResult,
  LegacyCollection,
} from './firestore-to-postgres.mts';

export type AttendanceCategory = 'REGULAR' | 'NON_SUBSCRIBED' | 'NON_PAYING';

export interface FirestoreAttendanceRow {
  legacyEventId: string;
  eventName: string;
  eventStartDate: Date;
  legacyPersonId: string;
  category: AttendanceCategory;
}

export interface AttendanceUpdateRow {
  eventId: string;
  personId: string;
  category: AttendanceCategory;
}

export interface MatchedAttendance extends AttendanceUpdateRow {
  legacyEventId: string;
  legacyPersonId: string;
}

export interface UnmatchedEvent {
  legacyEventId: string;
  name: string;
  startDate: Date;
  reason: 'no date match' | 'ambiguous date match';
  candidateCount: number;
}

export interface AttendanceMatchResult {
  matched: MatchedAttendance[];
  unmatchedEvents: UnmatchedEvent[];
  unmatchedPeople: Set<string>;
}

export interface ExistingAttendanceResult {
  existing: AttendanceUpdateRow[];
  missing: AttendanceUpdateRow[];
}

export interface SelectChangedOptions {
  includeNonUnknown?: boolean;
}

export interface ReevaluateOptions {
  input: string;
  databaseUrl: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  apply: boolean;
  includeNonUnknown: boolean;
  help: boolean;
}

interface DbEventRow {
  id: string;
  name: string;
  startDate: unknown;
}

interface DbPersonRow {
  id: string;
  externalRef: string;
}

export const NON_SUBSCRIBED_COLLECTIONS = [
  'non-subscribing-attendance',
  'non-subscribed-attendance',
  'non-subscribing',
  'non-subscribed',
];

export function loadRawEvents(inputPath: string | URL): LegacyCollection {
  const source = loadFirestoreExport(inputPath);
  const collections = source.__collections__ ?? {};
  const rawEvents = isRecord(collections) ? collections.events ?? {} : {};
  if (!isRecord(rawEvents)) throw new Error("Expected '__collections__.events' to be an object.");
  return rawEvents;
}

export function buildFirestoreAttendances(rawEvents: LegacyCollection): FirestoreAttendanceRow[] {
  const rows: FirestoreAttendanceRow[] = [];
  for (const legacyEventId of sortedKeys(rawEvents)) {
    const rawEvent = rawEvents[legacyEventId];
    if (!isRecord(rawEvent)) continue;
    const eventName = coerceText(rawEvent.name) || `Legacy Event ${legacyEventId}`;
    const eventStartDate = parseFirestoreTimestamp(rawEvent.eventStartDate)
      || parseFirestoreTimestamp(rawEvent.createdOn);
    if (eventStartDate === null) continue;
    const subscriptions = extractSubcollection(rawEvent, 'subscriptions');
    const allowSubscription = coerceBool(rawEvent.allowSubscription);
    const eventRows = new Map<string, FirestoreAttendanceRow>();

    const attendance = extractSubcollection(rawEvent, 'attendance');
    for (const legacyPersonId of sortedKeys(attendance)) {
      const category = allowSubscription && !Object.hasOwn(subscriptions, legacyPersonId)
        ? 'NON_SUBSCRIBED'
        : 'REGULAR';
      eventRows.set(legacyPersonId, {
        legacyEventId,
        eventName,
        eventStartDate,
        legacyPersonId,
        category,
      });
    }

    for (const collectionName of NON_SUBSCRIBED_COLLECTIONS) {
      const rawAttendance = extractSubcollection(rawEvent, collectionName);
      for (const legacyPersonId of sortedKeys(rawAttendance)) {
        eventRows.set(legacyPersonId, {
          legacyEventId,
          eventName,
          eventStartDate,
          legacyPersonId,
          category: 'NON_SUBSCRIBED',
        });
      }
    }

    const nonPayingAttendance = extractSubcollection(rawEvent, 'non-paying-attendance');
    for (const legacyPersonId of sortedKeys(nonPayingAttendance)) {
      eventRows.set(legacyPersonId, {
        legacyEventId,
        eventName,
        eventStartDate,
        legacyPersonId,
        category: 'NON_PAYING',
      });
    }
    rows.push(...eventRows.values());
  }
  return rows;
}

export function normalizeDatetime(value: unknown): Date {
  const date = value instanceof Date
    ? value
    : new Date(typeof value === 'number' || typeof value === 'string' ? value : String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid datetime: ${String(value)}`);
  return new Date(date.getTime());
}

export function normalizeName(name: unknown): string {
  return String(name)
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase();
}

function sameDatetime(left: unknown, right: unknown): boolean {
  return normalizeDatetime(left).getTime() === normalizeDatetime(right).getTime();
}

function dbEventValues(row: unknown): DbEventRow | null {
  const values = Array.isArray(row) ? { id: row[0], name: row[1], startDate: row[2] } : row;
  if (!isRecord(values)) return null;
  const id = coerceText(values.id);
  const name = coerceText(values.name);
  if (id === null || name === null) return null;
  return { id, name, startDate: values.startDate };
}

function dbPersonValues(row: unknown): DbPersonRow | null {
  const values = Array.isArray(row) ? { id: row[0], externalRef: row[1] } : row;
  if (!isRecord(values)) return null;
  const id = coerceText(values.id);
  const externalRef = coerceText(values.externalRef);
  if (id === null || externalRef === null) return null;
  return { id, externalRef };
}

function rowsOf(result: DatabaseQueryResult | void): readonly unknown[] {
  return result?.rows ?? [];
}

export async function matchAttendances(
  db: DatabaseClient,
  firestoreAttendances: readonly FirestoreAttendanceRow[],
): Promise<AttendanceMatchResult> {
  const eventKeys = new Map<string, FirestoreAttendanceRow>();
  for (const row of firestoreAttendances) {
    const key = JSON.stringify([row.legacyEventId, row.eventName, normalizeDatetime(row.eventStartDate).getTime()]);
    eventKeys.set(key, row);
  }
  const eventIdByLegacyId = new Map<string, string>();
  const unmatchedEvents: UnmatchedEvent[] = [];
  const eventResult = await db.query(`
    SELECT id, name, "startDate"
    FROM events
    WHERE "deletedAt" IS NULL
  `);
  const allDbEvents = rowsOf(eventResult)
    .map(dbEventValues)
    .filter((row): row is DbEventRow => row !== null);

  const sortedEventKeys = [...eventKeys.values()].sort((left, right) => {
    if (left.legacyEventId !== right.legacyEventId) return left.legacyEventId < right.legacyEventId ? -1 : 1;
    if (left.eventName !== right.eventName) return left.eventName < right.eventName ? -1 : 1;
    return normalizeDatetime(left.eventStartDate).getTime() - normalizeDatetime(right.eventStartDate).getTime();
  });
  for (const event of sortedEventKeys) {
    const normalizedFirestoreName = normalizeName(event.eventName);
    const matches = allDbEvents.filter((row) => normalizeName(row.name) === normalizedFirestoreName && sameDatetime(row.startDate, event.eventStartDate));
    if (matches.length === 1) {
      const [match] = matches;
      if (match) eventIdByLegacyId.set(event.legacyEventId, match.id);
      continue;
    }
    const candidateCount = allDbEvents.filter((row) => normalizeName(row.name) === normalizedFirestoreName).length;
    unmatchedEvents.push({
      legacyEventId: event.legacyEventId,
      name: event.eventName,
      startDate: event.eventStartDate,
      reason: matches.length === 0 ? 'no date match' : 'ambiguous date match',
      candidateCount,
    });
  }

  const legacyPersonIds = [...new Set(firestoreAttendances.map((row) => row.legacyPersonId))].sort();
  const personIdByExternalRef = new Map();
  for (const chunk of chunks(legacyPersonIds, 1000)) {
    const result = await db.query(`
      SELECT id, "externalRef"
      FROM people
      WHERE "externalRef" = ANY($1::text[])
        AND "deletedAt" IS NULL
    `, [chunk]);
    for (const row of rowsOf(result)) {
      const values = dbPersonValues(row);
      if (values) personIdByExternalRef.set(values.externalRef, values.id);
    }
  }

  const matched: MatchedAttendance[] = [];
  const unmatchedPeople = new Set<string>();
  for (const row of firestoreAttendances) {
    const eventId = eventIdByLegacyId.get(row.legacyEventId);
    if (!eventId) continue;
    const personId = personIdByExternalRef.get(row.legacyPersonId);
    if (!personId) {
      unmatchedPeople.add(row.legacyPersonId);
      continue;
    }
    matched.push({
      legacyEventId: row.legacyEventId,
      legacyPersonId: row.legacyPersonId,
      eventId,
      personId,
      category: row.category,
    });
  }
  return { matched, unmatchedEvents, unmatchedPeople };
}

export async function filterExistingAttendances(
  db: DatabaseClient,
  matched: readonly AttendanceUpdateRow[],
): Promise<ExistingAttendanceResult> {
  const existingPairs = new Set<string>();
  for (const chunk of chunks(matched, 1000)) {
    const result = await db.query(`
      SELECT "personId", "eventId"
      FROM event_attendances
      WHERE ("personId", "eventId") IN (
        SELECT * FROM UNNEST($1::text[], $2::text[])
      )
    `, [chunk.map((row) => row.personId), chunk.map((row) => row.eventId)]);
    for (const row of rowsOf(result)) {
      const values = Array.isArray(row) ? [row[0], row[1]] : isRecord(row) ? [row.personId, row.eventId] : [];
      if (values.length === 2) existingPairs.add(JSON.stringify([values[0], values[1]]));
    }
  }
  return {
    existing: matched.filter((row) => existingPairs.has(JSON.stringify([row.personId, row.eventId]))),
    missing: matched.filter((row) => !existingPairs.has(JSON.stringify([row.personId, row.eventId]))),
  };
}

export async function selectChangedAttendances(
  db: DatabaseClient,
  existing: readonly AttendanceUpdateRow[],
  { includeNonUnknown = false }: SelectChangedOptions = {},
): Promise<AttendanceUpdateRow[]> {
  const currentCategoryByPair = new Map<string, unknown>();
  for (const chunk of chunks(existing, 1000)) {
    const result = await db.query(`
      SELECT "personId", "eventId", category::text
      FROM event_attendances
      WHERE ("personId", "eventId") IN (
        SELECT * FROM UNNEST($1::text[], $2::text[])
      )
    `, [chunk.map((row) => row.personId), chunk.map((row) => row.eventId)]);
    for (const row of rowsOf(result)) {
      if (Array.isArray(row)) currentCategoryByPair.set(JSON.stringify([row[0], row[1]]), row[2]);
      else if (isRecord(row)) currentCategoryByPair.set(JSON.stringify([row.personId, row.eventId]), row.category);
    }
  }
  return existing.filter((row) => {
    const currentCategory = currentCategoryByPair.get(JSON.stringify([row.personId, row.eventId]));
    if (currentCategory === row.category) return false;
    if (currentCategory !== 'UNKNOWN' && !includeNonUnknown) return false;
    return true;
  });
}

export async function applyUpdates(db: DatabaseClient, updates: readonly AttendanceUpdateRow[]): Promise<void> {
  for (const row of updates) {
    await db.query(`
      UPDATE event_attendances
      SET category = $1::"AttendanceCategory"
      WHERE "personId" = $2
        AND "eventId" = $3
    `, [row.category, row.personId, row.eventId]);
  }
}

export function printUnmatchedEvents(unmatchedEvents: readonly UnmatchedEvent[]): void {
  if (unmatchedEvents.length === 0) return;
  console.log('Unmatched events:');
  for (const event of unmatchedEvents) {
    console.log(`- ${event.legacyEventId} | ${event.name} | ${normalizeDatetime(event.startDate).toISOString()} | ${event.reason} | name_candidates=${event.candidateCount}`);
  }
}

function parseOptionValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): ReevaluateOptions {
  const options: ReevaluateOptions = {
    input: 'import/file.json',
    databaseUrl: '',
    dbHost: 'localhost',
    dbPort: 5432,
    dbName: 'postgres',
    dbUser: 'postgres',
    dbPassword: 'postgres',
    apply: false,
    includeNonUnknown: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) break;
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (argument === '--include-non-unknown') {
      options.includeNonUnknown = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const equalsIndex = argument.indexOf('=');
    const option = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const valueOptions = new Set([
      '--input', '--database-url', '--db-host', '--db-port', '--db-name', '--db-user', '--db-password',
    ]);
    if (!valueOptions.has(option)) throw new Error(`Unknown option: ${argument}`);
    const value = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : parseOptionValue(argv, index, option);
    if (equalsIndex < 0) index += 1;
    switch (option) {
      case '--input': options.input = value; break;
      case '--database-url': options.databaseUrl = value; break;
      case '--db-host': options.dbHost = value; break;
      case '--db-port': {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('--db-port must be a positive integer.');
        options.dbPort = parsed;
        break;
      }
      case '--db-name': options.dbName = value; break;
      case '--db-user': options.dbUser = value; break;
      case '--db-password': options.dbPassword = value; break;
    }
  }
  return options;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: bun run data-import -- reevaluate-attendance-categories [--input PATH] [--apply] [--include-non-unknown] [database options]');
    return;
  }
  const databaseUrl = databaseUrlFromOptions(options);
  const rawEvents = loadRawEvents(options.input);
  const firestoreAttendances = buildFirestoreAttendances(rawEvents);
  const categoryCounter = new Map();
  for (const row of firestoreAttendances) categoryCounter.set(row.category, (categoryCounter.get(row.category) ?? 0) + 1);
  console.log(`Firestore category intent -> ${formatCounter(categoryCounter)}`);

  const db = await connectPostgres(databaseUrl) as unknown as DatabaseClient;
  try {
    await db.query('BEGIN');
    try {
      const { matched, unmatchedEvents, unmatchedPeople } = await matchAttendances(db, firestoreAttendances);
      const { existing, missing } = await filterExistingAttendances(db, matched);
      const updates = await selectChangedAttendances(db, existing, { includeNonUnknown: options.includeNonUnknown });
      const updateCounter = new Map();
      for (const row of updates) updateCounter.set(row.category, (updateCounter.get(row.category) ?? 0) + 1);

      console.log(`Matched attendance rows: ${matched.length}`);
      console.log(`Existing database attendance rows: ${existing.length}`);
      console.log(`Rows needing category update: ${updates.length}`);
      console.log(`Missing database attendance rows: ${missing.length}`);
      console.log(`Unmatched Firestore people: ${unmatchedPeople.size}`);
      console.log(`Unmatched Firestore events: ${unmatchedEvents.length}`);
      console.log(`Update category intent -> ${formatCounter(updateCounter)}`);
      printUnmatchedEvents(unmatchedEvents);

      if (!options.apply) {
        console.log('Dry run only. Re-run with --apply to update categories.');
        await db.query('ROLLBACK');
        return;
      }
      await applyUpdates(db, updates);
      await db.query('COMMIT');
      console.log(`Updated ${updates.length} event_attendances rows.`);
    } catch (error) {
      try {
        await db.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
      throw error;
    }
  } finally {
    if (db.end) await db.end();
  }
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
