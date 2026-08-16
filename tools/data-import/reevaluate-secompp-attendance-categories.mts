#!/usr/bin/env node

import {
  buildPrefixedId,
  coerceText,
  decimalToInt,
  parseInsertRowsByTable,
} from './lib/legacy-sql.mts';
import type {
  LegacyPostgresClient,
  ParsedSqlRow,
  ParsedSqlTables,
} from './lib/legacy-sql.mts';
import {
  chunks,
  connectPostgres,
  databaseUrlFromOptions,
  formatCounter,
  isMain,
} from './lib/common.mts';

const PREFIX = 'SYSCOMPP-1-';

export type AttendanceCategory = 'NON_PAYING' | 'NON_SUBSCRIBED' | 'REGULAR' | 'UNKNOWN';
export type EventKind = 'lecture' | 'shortcourse';

export interface SecomppReevaluateOptions {
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

export interface LegacyAttendance {
  userId: number;
  detailId: number;
  eventId: string;
  legacyEventId: number;
  legacyActivityId: number;
  kind: EventKind;
  category: AttendanceCategory;
}

export interface MatchedAttendance extends LegacyAttendance {
  personId: string;
}

export interface LegacyAttendanceBuild {
  legacyAttendances: LegacyAttendance[];
  skippedAttendances: number;
}

interface PersonLookupRow {
  id: string;
  externalRef: string;
}

interface EventLookupRow {
  id: string;
}

interface AttendancePairRow {
  personId: string;
  eventId: string;
}

interface CategoryRow extends AttendancePairRow {
  category: string;
}

type AttendanceMatchResult = [MatchedAttendance[], Set<number>, Set<string>];

export const REQUIRED_TABLES = new Set([
  'lectures',
  'presence_lectures',
  'presence_shortcourses',
  'shortcourses',
  'users',
  'users_registered',
  'users_registered_shortcourses',
]);

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): SecomppReevaluateOptions {
  const options: SecomppReevaluateOptions = {
    input: 'import/secompp.sql',
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
    if (argument === undefined) continue;
    if (argument === '--help' || argument === '-h') { options.help = true; continue; }
    if (argument === '--apply') { options.apply = true; continue; }
    if (argument === '--include-non-unknown') { options.includeNonUnknown = true; continue; }
    const equalsIndex = argument.indexOf('=');
    const name = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
    switch (name) {
      case '--input': options.input = value; break;
      case '--database-url': options.databaseUrl = value; break;
      case '--db-host': options.dbHost = value; break;
      case '--db-port': options.dbPort = Number(value); break;
      case '--db-name': options.dbName = value; break;
      case '--db-user': options.dbUser = value; break;
      case '--db-password': options.dbPassword = value; break;
      default: throw new Error(`Unknown option: ${name}`);
    }
  }
  if (!Number.isInteger(options.dbPort) || options.dbPort < 1 || options.dbPort > 65535) throw new Error('--db-port must be a valid TCP port.');
  return options;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<unknown> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: bun run data-import -- reevaluate-secompp-attendance-categories [--input PATH] [--apply] [--include-non-unknown] [database options]');
    return;
  }
  const parsed = await parseInsertRowsByTable(options.input, REQUIRED_TABLES);
  const { legacyAttendances, skippedAttendances } = buildLegacyAttendances(parsed);
  console.log(`Legacy category intent -> ${formatCounter(counterFor(legacyAttendances.map((row) => row.category)))}`);
  printCategoryByKind(legacyAttendances);
  console.log(`Skipped legacy attendance rows: ${skippedAttendances}`);

  const db = (await connectPostgres(databaseUrlFromOptions(options))) as unknown as LegacyPostgresClient;
  try {
    await db.query('BEGIN');
    try {
      const [matched, unmatchedPeople, unmatchedEvents] = await matchAttendances(db, legacyAttendances);
      const [existing, missingAttendances] = await filterExistingAttendances(db, matched);
      const updates = await selectChangedAttendances(db, existing, options.includeNonUnknown);
      console.log(`Matched attendance rows: ${matched.length}`);
      console.log(`Existing database attendance rows: ${existing.length}`);
      console.log(`Rows needing category update: ${updates.length}`);
      console.log(`Missing database attendance rows: ${missingAttendances.length}`);
      console.log(`Unmatched legacy people: ${unmatchedPeople.size}`);
      console.log(`Unmatched imported events: ${unmatchedEvents.size}`);
      console.log(`Update category intent -> ${formatCounter(counterFor(updates.map((row) => row.category)))}`);
      printUnmatchedPeople(unmatchedPeople);
      printUnmatchedEvents(unmatchedEvents);
      if (!options.apply) {
        console.log('Dry run only. Re-run with --apply to update categories.');
        await db.query('ROLLBACK');
        return { matched, existing, updates, missingAttendances, unmatchedPeople, unmatchedEvents };
      }
      await applyUpdates(db, updates);
      await db.query('COMMIT');
      console.log(`Updated ${updates.length} event_attendances rows.`);
      return { matched, existing, updates, missingAttendances, unmatchedPeople, unmatchedEvents };
    } catch (error) {
      await db.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    await db.end?.();
  }
}

export function buildLegacyAttendances(parsed: ParsedSqlTables): LegacyAttendanceBuild {
  const userDetailByUserId = buildUserDetailMap(tableRows(parsed, 'users'));
  const lectureEventByLectureId = buildActivityEventMap(tableRows(parsed, 'lectures'), 'idLecture');
  const shortcourseEventByShortcourseId = buildActivityEventMap(tableRows(parsed, 'shortcourses'), 'idShortcourse');
  const paymentRequiredEventIds = buildPaymentRequiredEventIds(tableRows(parsed, 'users_registered'));
  const paidMajorPairs = buildStatusPairs(tableRows(parsed, 'users_registered'));
  const confirmedShortcoursePairs = buildStatusPairs(tableRows(parsed, 'users_registered_shortcourses'), 'idShortcourseFK');
  const rowsByPair = new Map<string, LegacyAttendance>();
  let skipped = 0;

  for (const row of tableRows(parsed, 'presence_lectures')) {
    const userId = decimalToInt(row.idUserFK);
    const lectureId = decimalToInt(row.idLectureFK);
    if (userId == null || lectureId == null) { skipped += 1; continue; }
    const detailId = userDetailByUserId.get(userId);
    const legacyEventId = lectureEventByLectureId.get(lectureId);
    if (detailId == null || legacyEventId == null) { skipped += 1; continue; }
    const category = resolveLectureCategory(userId, legacyEventId, paymentRequiredEventIds, paidMajorPairs);
    const eventId = buildPrefixedId(PREFIX, 'event', 'lecture', lectureId);
    rowsByPair.set(`${detailId}\u0000${eventId}`, { userId, detailId, eventId, legacyEventId, legacyActivityId: lectureId, kind: 'lecture', category });
  }
  for (const row of tableRows(parsed, 'presence_shortcourses')) {
    const userId = decimalToInt(row.idUserFK);
    const shortcourseId = decimalToInt(row.idShortcourseFK);
    if (userId == null || shortcourseId == null) { skipped += 1; continue; }
    const detailId = userDetailByUserId.get(userId);
    const legacyEventId = shortcourseEventByShortcourseId.get(shortcourseId);
    if (detailId == null || legacyEventId == null) { skipped += 1; continue; }
    const category = resolveShortcourseCategory(userId, legacyEventId, shortcourseId, paymentRequiredEventIds, paidMajorPairs, confirmedShortcoursePairs);
    const eventId = buildPrefixedId(PREFIX, 'event', 'shortcourse', shortcourseId);
    rowsByPair.set(`${detailId}\u0000${eventId}`, { userId, detailId, eventId, legacyEventId, legacyActivityId: shortcourseId, kind: 'shortcourse', category });
  }
  return { legacyAttendances: [...rowsByPair.values()].sort((left, right) => `${left.detailId}\u0000${left.eventId}`.localeCompare(`${right.detailId}\u0000${right.eventId}`)), skippedAttendances: skipped };
}

export function buildUserDetailMap(rows: readonly ParsedSqlRow[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const row of rows) {
    const userId = decimalToInt(row.idUser);
    const detailId = decimalToInt(row.idDetailFK);
    if (userId != null && detailId != null) result.set(userId, detailId);
  }
  return result;
}

export function buildActivityEventMap(rows: readonly ParsedSqlRow[], activityIdColumn: string): Map<number, number> {
  const result = new Map<number, number>();
  for (const row of rows) {
    const activityId = decimalToInt(row[activityIdColumn]);
    const eventId = decimalToInt(row.idEventFK);
    if (activityId != null && eventId != null) result.set(activityId, eventId);
  }
  return result;
}

export function buildStatusPairs(rows: readonly ParsedSqlRow[], extraIdColumn: string | null = null): Set<string> {
  const result = new Set<string>();
  for (const row of rows) {
    if ((coerceText(row.status) ?? '').toUpperCase() !== 'S') continue;
    const userId = decimalToInt(row.idUserFK);
    const eventId = decimalToInt(row.idEventFK);
    if (userId == null || eventId == null) continue;
    if (!extraIdColumn) result.add(`${userId}\u0000${eventId}`);
    else {
      const extraId = decimalToInt(row[extraIdColumn]);
      if (extraId != null) result.add(`${userId}\u0000${eventId}\u0000${extraId}`);
    }
  }
  return result;
}

export function buildPaymentRequiredEventIds(rows: readonly ParsedSqlRow[]): Set<number> {
  const result = new Set<number>();
  for (const row of rows) {
    const eventId = decimalToInt(row.idEventFK);
    const amount = decimalToInt(row.amount);
    if (eventId != null && amount != null && amount > 0) result.add(eventId);
  }
  return result;
}

export function resolveLectureCategory(
  userId: number,
  legacyEventId: number,
  paymentRequiredEventIds: ReadonlySet<number>,
  paidMajorPairs: ReadonlySet<string>,
): AttendanceCategory {
  return paymentRequiredEventIds.has(legacyEventId) && !paidMajorPairs.has(`${userId}\u0000${legacyEventId}`) ? 'NON_PAYING' : 'REGULAR';
}

export function resolveShortcourseCategory(
  userId: number,
  legacyEventId: number,
  shortcourseId: number,
  paymentRequiredEventIds: ReadonlySet<number>,
  paidMajorPairs: ReadonlySet<string>,
  confirmedShortcoursePairs: ReadonlySet<string>,
): AttendanceCategory {
  if (paymentRequiredEventIds.has(legacyEventId) && !paidMajorPairs.has(`${userId}\u0000${legacyEventId}`)) return 'NON_PAYING';
  if (!confirmedShortcoursePairs.has(`${userId}\u0000${legacyEventId}\u0000${shortcourseId}`)) return 'NON_SUBSCRIBED';
  return 'REGULAR';
}

export async function matchAttendances(
  db: LegacyPostgresClient,
  legacyAttendances: readonly LegacyAttendance[],
): Promise<AttendanceMatchResult> {
  const externalRefs = [...new Set(legacyAttendances.map((row) => buildPrefixedId(PREFIX, 'legacy-detail', row.detailId)))].sort();
  const eventIds = [...new Set(legacyAttendances.map((row) => row.eventId))].sort();
  const personIdByExternalRef = new Map<string, string>();
  const existingEventIds = new Set<string>();
  for (const chunk of chunks(externalRefs, 1000)) {
    const result = await db.query<PersonLookupRow>(
      'SELECT id, "externalRef" FROM people WHERE "externalRef" = ANY($1::text[]) AND "deletedAt" IS NULL',
      [chunk],
    );
    result.rows.forEach((row) => personIdByExternalRef.set(row.externalRef, row.id));
  }
  for (const chunk of chunks(eventIds, 1000)) {
    const result = await db.query<EventLookupRow>(
      'SELECT id FROM events WHERE id = ANY($1::text[]) AND "deletedAt" IS NULL',
      [chunk],
    );
    result.rows.forEach((row) => existingEventIds.add(row.id));
  }
  const matched: MatchedAttendance[] = [];
  const unmatchedPeople = new Set<number>();
  const unmatchedEvents = new Set<string>();
  for (const row of legacyAttendances) {
    if (!existingEventIds.has(row.eventId)) { unmatchedEvents.add(row.eventId); continue; }
    const personId = personIdByExternalRef.get(buildPrefixedId(PREFIX, 'legacy-detail', row.detailId));
    if (!personId) { unmatchedPeople.add(row.detailId); continue; }
    matched.push({ personId, eventId: row.eventId, category: row.category, userId: row.userId, detailId: row.detailId, legacyEventId: row.legacyEventId, legacyActivityId: row.legacyActivityId, kind: row.kind });
  }
  return [matched, unmatchedPeople, unmatchedEvents];
}

export async function filterExistingAttendances(
  db: LegacyPostgresClient,
  matched: readonly MatchedAttendance[],
): Promise<[MatchedAttendance[], MatchedAttendance[]]> {
  const existingPairs = new Set<string>();
  for (const chunk of chunks(matched, 1000)) {
    const result = await db.query<AttendancePairRow>(
      'SELECT "personId", "eventId" FROM event_attendances WHERE ("personId", "eventId") IN (SELECT * FROM UNNEST($1::text[], $2::text[]))',
      [chunk.map((row) => row.personId), chunk.map((row) => row.eventId)],
    );
    result.rows.forEach((row) => existingPairs.add(`${row.personId}\u0000${row.eventId}`));
  }
  const existing = matched.filter((row) => existingPairs.has(`${row.personId}\u0000${row.eventId}`));
  const missing = matched.filter((row) => !existingPairs.has(`${row.personId}\u0000${row.eventId}`));
  return [existing, missing];
}

export async function selectChangedAttendances(
  db: LegacyPostgresClient,
  existing: readonly MatchedAttendance[],
  includeNonUnknown = false,
): Promise<MatchedAttendance[]> {
  const currentCategoryByPair = new Map<string, string>();
  for (const chunk of chunks(existing, 1000)) {
    const result = await db.query<CategoryRow>(
      'SELECT "personId", "eventId", category::text FROM event_attendances WHERE ("personId", "eventId") IN (SELECT * FROM UNNEST($1::text[], $2::text[]))',
      [chunk.map((row) => row.personId), chunk.map((row) => row.eventId)],
    );
    result.rows.forEach((row) => currentCategoryByPair.set(`${row.personId}\u0000${row.eventId}`, row.category));
  }
  return existing.filter((row) => {
    const currentCategory = currentCategoryByPair.get(`${row.personId}\u0000${row.eventId}`);
    if (currentCategory === row.category) return false;
    if (currentCategory !== 'UNKNOWN' && !includeNonUnknown) return false;
    return true;
  });
}

export async function applyUpdates(db: LegacyPostgresClient, updates: readonly MatchedAttendance[]): Promise<void> {
  for (const row of updates) {
    await db.query(
      'UPDATE event_attendances SET category = $1::"AttendanceCategory" WHERE "personId" = $2 AND "eventId" = $3',
      [row.category, row.personId, row.eventId],
    );
  }
}

export function printUnmatchedPeople(unmatchedPeople: ReadonlySet<number>): void {
  if (!unmatchedPeople.size) return;
  console.log('Unmatched people externalRefs:');
  for (const detailId of [...unmatchedPeople].sort((left, right) => left - right)) console.log(`- ${buildPrefixedId(PREFIX, 'legacy-detail', detailId)}`);
}

export function printUnmatchedEvents(unmatchedEvents: ReadonlySet<string>): void {
  if (!unmatchedEvents.size) return;
  console.log('Unmatched imported events:');
  for (const eventId of [...unmatchedEvents].sort()) console.log(`- ${eventId}`);
}

export function printCategoryByKind(rows: readonly LegacyAttendance[]): void {
  for (const kind of ['lecture', 'shortcourse']) {
    const categories = rows.filter((row) => row.kind === kind).map((row) => row.category);
    console.log(`Legacy ${kind} intent -> ${formatCounter(counterFor(categories))}`);
  }
}

function counterFor(values: readonly string[]): Map<string, number> {
  const counter = new Map<string, number>();
  for (const value of values) counter.set(value, (counter.get(value) ?? 0) + 1);
  return counter;
}

function tableRows(parsed: ParsedSqlTables, table: string): ParsedSqlRow[] {
  const rows = parsed[table];
  if (rows === undefined) throw new Error(`Expected parsed table '${table}'.`);
  return rows;
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
