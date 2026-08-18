#!/usr/bin/env node

import {
  atStartOfDay,
  buildPrefixedId,
  coerceText,
  decimalToInt,
  deterministicPrefixedId,
  normalizeCpf,
  normalizeEmail,
  normalizePersonName,
  parseInsertRowsByTable,
  parseMysqlDate,
  stripHtml,
  utcNow,
  writeLegacySqlPayload,
  createUuidV7,
} from './lib/legacy-sql.mts';
import type {
  LegacyEvent,
  LegacyEventAttendance,
  LegacyEventGroup,
  LegacyEventLecturer,
  LegacyImportPayload,
  LegacyMajorEvent,
  LegacyMajorEventSubscription,
  LegacyPerson,
  LegacyEventSubscription,
  ParsedSqlRow,
  ParsedSqlTables,
} from './lib/legacy-sql.mts';
import { databaseUrlFromOptions, isMain } from './lib/common.mts';

const PREFIX = 'SYSCOMPP-1-';

interface SecomppCliOptions {
  input: string;
  databaseUrl: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  dryRun: boolean;
  help: boolean;
}

interface EventSeed {
  id: string;
  name: string;
  type: 'PALESTRA' | 'MINICURSO';
  emoji: string;
  description: string | null;
  shortDescription: string | null;
  creditMinutes: number | null;
  startDate: Date;
  endDate: Date;
  locationDescription: string | null;
  majorEventId: string;
  slots: number | null;
  createdAt: Date;
}

interface MajorEventMapping {
  majorEvents: LegacyMajorEvent[];
  majorEventIdByLegacy: Map<number, string>;
  majorEventStartByLegacy: Map<number, Date>;
}

interface EventSeedMapping {
  lectureSeeds: Map<number, EventSeed>;
  shortcourseSeeds: Map<number, EventSeed>;
}

interface PeopleMapping {
  people: LegacyPerson[];
  userIdToPersonId: Map<number, string>;
}

interface MajorSubscriptionMapping {
  majorEventSubscriptions: LegacyMajorEventSubscription[];
  skippedMajorSubscriptions: number;
  paidByMajorEvent: Map<string, boolean>;
}

interface EventSubscriptionMapping {
  eventSubscriptions: LegacyEventSubscription[];
  skippedEventSubscriptions: number;
}

interface AttendanceMapping {
  eventAttendances: LegacyEventAttendance[];
  skippedAttendances: number;
}

interface LecturerMapping {
  eventLecturers: LegacyEventLecturer[];
  skippedLecturers: number;
}

export const REQUIRED_TABLES = new Set([
  'details',
  'events',
  'lectures',
  'presence_lectures',
  'presence_shortcourses',
  'shortcourses',
  'users',
  'users_lectures',
  'users_registered',
  'users_registered_shortcourses',
  'users_shortcourses',
]);

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): SecomppCliOptions {
  const options: SecomppCliOptions = {
    input: 'import/secompp.sql',
    databaseUrl: '',
    dbHost: 'localhost',
    dbPort: 5432,
    dbName: 'postgres',
    dbUser: 'postgres',
    dbPassword: 'postgres',
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--dry-run') {
      options.dryRun = true;
      continue;
    }
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
  if (!Number.isInteger(options.dbPort) || options.dbPort < 1 || options.dbPort > 65535) {
    throw new Error('--db-port must be a valid TCP port.');
  }
  return options;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<LegacyImportPayload | undefined> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: bun run data-import -- secompp-to-postgres [--input PATH] [--dry-run] [database options]');
    return;
  }
  const payload = await buildPayload(options.input);
  printPayloadSummary(payload);
  if (options.dryRun) {
    console.log('Dry run enabled. No database changes were made.');
    return payload;
  }
  await writeLegacySqlPayload(databaseUrlFromOptions(options), payload);
  console.log('Import completed.');
  return payload;
}

export async function buildPayload(sqlPath: string): Promise<LegacyImportPayload> {
  const parsed = await parseInsertRowsByTable(sqlPath, REQUIRED_TABLES);
  const now = utcNow();
  const { majorEvents, majorEventIdByLegacy, majorEventStartByLegacy } = mapMajorEvents(tableRows(parsed, 'events'), now);
  const { lectureSeeds, shortcourseSeeds } = mapEventSeeds(
    tableRows(parsed, 'lectures'),
    tableRows(parsed, 'shortcourses'),
    majorEventIdByLegacy,
    majorEventStartByLegacy,
    now,
  );
  const eventGroups = buildEventGroups(now);
  const eventGroupIdByType = new Map<string, string>(eventGroups.map((row) => [row.type, row.id]));
  const { people, userIdToPersonId } = mapPeople(tableRows(parsed, 'details'), tableRows(parsed, 'users'), now);
  const {
    majorEventSubscriptions,
    skippedMajorSubscriptions,
    paidByMajorEvent,
  } = mapMajorEventSubscriptions(
    tableRows(parsed, 'users_registered'),
    userIdToPersonId,
    majorEventIdByLegacy,
    majorEventStartByLegacy,
  );
  for (const row of majorEvents) {
    if (paidByMajorEvent.get(row.id) === true) row.isPaymentRequired = true;
  }
  const { eventSubscriptions, skippedEventSubscriptions } = mapEventSubscriptions(
    tableRows(parsed, 'users_registered_shortcourses'),
    userIdToPersonId,
    shortcourseSeeds,
    now,
  );
  const events = buildEventRows(lectureSeeds, shortcourseSeeds, eventGroupIdByType, now);
  const { eventAttendances, skippedAttendances } = mapEventAttendances(
    tableRows(parsed, 'presence_lectures'),
    tableRows(parsed, 'presence_shortcourses'),
    userIdToPersonId,
    lectureSeeds,
    shortcourseSeeds,
    now,
  );
  const { eventLecturers, skippedLecturers } = mapEventLecturers(
    tableRows(parsed, 'users_lectures'),
    tableRows(parsed, 'users_shortcourses'),
    userIdToPersonId,
    lectureSeeds,
    shortcourseSeeds,
    now,
  );
  return {
    majorEvents,
    eventGroups,
    events,
    people,
    majorEventSubscriptions,
    eventSubscriptions,
    eventAttendances,
    eventLecturers,
    skippedMajorSubscriptions,
    skippedEventSubscriptions,
    skippedAttendances,
    skippedLecturers,
  };
}

export function mapMajorEvents(legacyRows: readonly ParsedSqlRow[], fallbackNow: Date): MajorEventMapping {
  const rows: LegacyMajorEvent[] = [];
  const majorEventIdByLegacy = new Map<number, string>();
  const majorEventStartByLegacy = new Map<number, Date>();
  for (const legacyRow of legacyRows) {
    const legacyId = decimalToInt(legacyRow.idEvent);
    if (legacyId == null) continue;
    const startDate = atStartOfDay(parseMysqlDate(legacyRow.start)) ?? fallbackNow;
    let endDate = atStartOfDay(parseMysqlDate(legacyRow.end)) ?? startDate;
    if (endDate < startDate) endDate = startDate;
    const location = coerceText(legacyRow.location, { fixMojibake: true });
    const link = coerceText(legacyRow.link, { fixMojibake: true });
    const description = coerceText(legacyRow.description, { fixMojibake: true });
    const descriptionParts = [description].filter(Boolean);
    if (location) descriptionParts.push(`Local: ${location}`);
    if (link) descriptionParts.push(`Link legado: ${link}`);
    const id = buildPrefixedId(PREFIX, 'major-event', legacyId);
    majorEventIdByLegacy.set(legacyId, id);
    majorEventStartByLegacy.set(legacyId, startDate);
    rows.push({
      id,
      name: coerceText(legacyRow.name, { fixMojibake: true }) ?? `Evento legado ${legacyId}`,
      startDate,
      endDate,
      description: descriptionParts.length ? descriptionParts.join('\n') : null,
      isPaymentRequired: false,
      createdAt: startDate,
      updatedAt: fallbackNow,
    });
  }
  return { majorEvents: rows, majorEventIdByLegacy, majorEventStartByLegacy };
}

export function mapEventSeeds(
  lectureRows: readonly ParsedSqlRow[],
  shortcourseRows: readonly ParsedSqlRow[],
  majorEventIdByLegacy: ReadonlyMap<number, string>,
  majorEventStartByLegacy: ReadonlyMap<number, Date>,
  fallbackNow: Date,
): EventSeedMapping {
  const lectureSeeds = new Map<number, EventSeed>();
  const shortcourseSeeds = new Map<number, EventSeed>();
  for (const row of lectureRows) {
    const legacyLectureId = decimalToInt(row.idLecture);
    const legacyEventId = decimalToInt(row.idEventFK);
    if (legacyLectureId == null || legacyEventId == null) continue;
    const majorEventId = majorEventIdByLegacy.get(legacyEventId);
    if (!majorEventId) continue;
    const startDate = majorEventStartByLegacy.get(legacyEventId) ?? fallbackNow;
    lectureSeeds.set(legacyLectureId, {
      id: buildPrefixedId(PREFIX, 'event', 'lecture', legacyLectureId),
      name: coerceText(row.name, { fixMojibake: true }) ?? `Palestra ${legacyLectureId}`,
      type: 'PALESTRA',
      emoji: '🎤',
      description: coerceText(row.description, { fixMojibake: true }),
      shortDescription: stripHtml(row.description),
      creditMinutes: null,
      startDate,
      endDate: startDate,
      locationDescription: null,
      majorEventId,
      slots: null,
      createdAt: startDate,
    });
  }
  for (const row of shortcourseRows) {
    const legacyShortcourseId = decimalToInt(row.idShortcourse);
    const legacyEventId = decimalToInt(row.idEventFK);
    if (legacyShortcourseId == null || legacyEventId == null) continue;
    const majorEventId = majorEventIdByLegacy.get(legacyEventId);
    if (!majorEventId) continue;
    const startDate = majorEventStartByLegacy.get(legacyEventId) ?? fallbackNow;
    const workloadHours = decimalToInt(row.workload);
    shortcourseSeeds.set(legacyShortcourseId, {
      id: buildPrefixedId(PREFIX, 'event', 'shortcourse', legacyShortcourseId),
      name: coerceText(row.name, { fixMojibake: true }) ?? `Minicurso ${legacyShortcourseId}`,
      type: 'MINICURSO',
      emoji: '🧪',
      description: coerceText(row.description, { fixMojibake: true }),
      shortDescription: stripHtml(row.description),
      creditMinutes: workloadHours == null ? null : workloadHours * 60,
      startDate,
      endDate: startDate,
      locationDescription: null,
      majorEventId,
      slots: decimalToInt(row.vacancies),
      createdAt: startDate,
    });
  }
  return { lectureSeeds, shortcourseSeeds };
}

export function buildEventGroups(now: Date): LegacyEventGroup[] {
  return [
    { id: buildPrefixedId(PREFIX, 'event-group', 'palestras'), name: 'Palestras (SECOMPP legado 1)', type: 'PALESTRA', createdAt: now, updatedAt: now },
    { id: buildPrefixedId(PREFIX, 'event-group', 'minicursos'), name: 'Minicursos (SECOMPP legado 1)', type: 'MINICURSO', createdAt: now, updatedAt: now },
  ];
}

export function mapPeople(
  detailRows: readonly ParsedSqlRow[],
  userRows: readonly ParsedSqlRow[],
  fallbackNow: Date,
): PeopleMapping {
  const personByKey = new Map<string, LegacyPerson>();
  const personKeyById = new Map<string, string>();
  const detailIdToPersonId = new Map<number, string>();
  const userIdToPersonId = new Map<number, string>();
  for (const detailRow of detailRows) {
    const detailId = decimalToInt(detailRow.idDetail);
    if (detailId == null) continue;
    const cpf = normalizeCpf(detailRow.cpf);
    const personKey = cpf ? `cpf:${cpf}` : `detail:${detailId}`;
    let person = personByKey.get(personKey);
    if (!person) {
      person = {
        id: createUuidV7(),
        name: normalizePersonName(detailRow.name) ?? `Pessoa ${detailId}`,
        email: null,
        identityDocument: cpf,
        academicId: null,
        externalRef: buildPrefixedId(PREFIX, 'legacy-detail', detailId),
        createdAt: fallbackNow,
        updatedAt: fallbackNow,
      };
      personByKey.set(personKey, person);
      personKeyById.set(person.id, personKey);
    } else if (person.identityDocument == null && cpf != null) {
      person.identityDocument = cpf;
    }
    detailIdToPersonId.set(detailId, person.id);
  }
  for (const userRow of userRows) {
    const userId = decimalToInt(userRow.idUser);
    const detailId = decimalToInt(userRow.idDetailFK);
    if (userId == null) continue;
    let personId = detailIdToPersonId.get(detailId ?? -1);
    let personKey;
    if (!personId) {
      personId = createUuidV7();
      personKey = `user:${userId}`;
      const person = {
        id: personId,
        name: `Pessoa ${userId}`,
        email: null,
        identityDocument: null,
        academicId: null,
        externalRef: buildPrefixedId(PREFIX, 'legacy-user', userId),
        createdAt: fallbackNow,
        updatedAt: fallbackNow,
      };
      personByKey.set(personKey, person);
      personKeyById.set(personId, personKey);
    } else {
      personKey = personKeyById.get(personId);
    }
    const email = normalizeEmail(userRow.email);
    const person = personKey ? personByKey.get(personKey) : undefined;
    if (person && email && person.email == null) person.email = email;
    userIdToPersonId.set(userId, personId);
  }
  return { people: [...personByKey.values()].sort((left, right) => left.id.localeCompare(right.id)), userIdToPersonId };
}

export function mapMajorEventSubscriptions(
  legacyRows: readonly ParsedSqlRow[],
  userIdToPersonId: ReadonlyMap<number, string>,
  majorEventIdByLegacy: ReadonlyMap<number, string>,
  majorEventStartByLegacy: ReadonlyMap<number, Date>,
): MajorSubscriptionMapping {
  const rowsById = new Map<string, LegacyMajorEventSubscription>();
  const paidByMajorEvent = new Map<string, boolean>();
  let skipped = 0;
  for (const row of legacyRows) {
    const userId = decimalToInt(row.idUserFK);
    const legacyEventId = decimalToInt(row.idEventFK);
    if (userId == null || legacyEventId == null) { skipped += 1; continue; }
    const personId = userIdToPersonId.get(userId);
    const majorEventId = majorEventIdByLegacy.get(legacyEventId);
    if (!personId || !majorEventId) { skipped += 1; continue; }
    const amountPaid = decimalToInt(row.amount);
    if (amountPaid != null && amountPaid > 0) paidByMajorEvent.set(majorEventId, true);
    const statusRaw = (coerceText(row.status) ?? '').toUpperCase();
    const subscriptionStatus = statusRaw === 'S' ? 'CONFIRMED' : 'WAITING_RECEIPT_UPLOAD';
    const id = deterministicPrefixedId(PREFIX, `legacy1-major-sub:${userId}:${legacyEventId}`);
    rowsById.set(id, {
      id,
      majorEventId,
      personId,
      amountPaid,
      paymentDate: null,
      paymentTier: null,
      subscriptionStatus,
      createdAt: majorEventStartByLegacy.get(legacyEventId) ?? utcNow(),
      createdById: null,
    });
  }
  return { majorEventSubscriptions: [...rowsById.values()].sort((left, right) => left.id.localeCompare(right.id)), skippedMajorSubscriptions: skipped, paidByMajorEvent };
}

export function mapEventSubscriptions(
  legacyRows: readonly ParsedSqlRow[],
  userIdToPersonId: ReadonlyMap<number, string>,
  shortcourseSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): EventSubscriptionMapping {
  const rowsById = new Map<string, LegacyEventSubscription>();
  let skipped = 0;
  for (const row of legacyRows) {
    const userId = decimalToInt(row.idUserFK);
    const shortcourseId = decimalToInt(row.idShortcourseFK);
    if (userId == null || shortcourseId == null) { skipped += 1; continue; }
    const personId = userIdToPersonId.get(userId);
    const seed = shortcourseSeeds.get(shortcourseId);
    if (!personId || !seed) { skipped += 1; continue; }
    const id = deterministicPrefixedId(PREFIX, `legacy1-event-sub:shortcourse:${userId}:${shortcourseId}`);
    rowsById.set(id, { id, eventId: seed.id, personId, createdAt: seed.startDate ?? fallbackNow, createdById: null });
  }
  return { eventSubscriptions: [...rowsById.values()].sort((left, right) => left.id.localeCompare(right.id)), skippedEventSubscriptions: skipped };
}

export function buildEventRows(
  lectureSeeds: ReadonlyMap<number, EventSeed>,
  shortcourseSeeds: ReadonlyMap<number, EventSeed>,
  eventGroupIdByType: ReadonlyMap<string, string>,
  fallbackNow: Date,
): LegacyEvent[] {
  const rows: LegacyEvent[] = [];
  for (const seed of [...lectureSeeds.values(), ...shortcourseSeeds.values()]) {
    rows.push({
      id: seed.id,
      name: seed.name,
      creditMinutes: seed.creditMinutes,
      startDate: seed.startDate,
      endDate: seed.endDate,
      type: seed.type,
      emoji: seed.emoji,
      description: seed.description,
      shortDescription: seed.shortDescription,
      latitude: null,
      longitude: null,
      locationDescription: seed.locationDescription,
      majorEventId: seed.majorEventId,
      eventGroupId: eventGroupIdByType.get(seed.type) ?? null,
      allowSubscription: true,
      slots: seed.slots,
      shouldIssueCertificate: false,
      shouldCollectAttendance: true,
      isOnlineAttendanceAllowed: false,
      onlineAttendanceCode: null,
      onlineAttendanceStartDate: null,
      onlineAttendanceEndDate: null,
      isPubliclyListed: true,
      youtubeCode: null,
      buttonText: null,
      buttonLink: null,
      createdAt: seed.createdAt ?? fallbackNow,
      createdById: null,
      updatedAt: fallbackNow,
    });
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

export function mapEventAttendances(
  lectureRows: readonly ParsedSqlRow[],
  shortcourseRows: readonly ParsedSqlRow[],
  userIdToPersonId: ReadonlyMap<number, string>,
  lectureSeeds: ReadonlyMap<number, EventSeed>,
  shortcourseSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): AttendanceMapping {
  const rowsByPair = new Map<string, LegacyEventAttendance>();
  let skipped = 0;
  const add = (
    row: ParsedSqlRow,
    activityColumn: string,
    seeds: ReadonlyMap<number, EventSeed>,
  ): void => {
    const userId = decimalToInt(row.idUserFK);
    const activityId = decimalToInt(row[activityColumn]);
    if (userId == null || activityId == null) { skipped += 1; return; }
    const personId = userIdToPersonId.get(userId);
    const seed = seeds.get(activityId);
    if (!personId || !seed) { skipped += 1; return; }
    const key = `${personId}\u0000${seed.id}`;
    rowsByPair.set(key, { personId, eventId: seed.id, attendedAt: seed.startDate ?? fallbackNow, createdAt: seed.startDate ?? fallbackNow, createdById: null });
  };
  lectureRows.forEach((row) => add(row, 'idLectureFK', lectureSeeds));
  shortcourseRows.forEach((row) => add(row, 'idShortcourseFK', shortcourseSeeds));
  return { eventAttendances: [...rowsByPair.values()].sort((left, right) => `${left.personId}\u0000${left.eventId}`.localeCompare(`${right.personId}\u0000${right.eventId}`)), skippedAttendances: skipped };
}

export function mapEventLecturers(
  lectureRows: readonly ParsedSqlRow[],
  shortcourseRows: readonly ParsedSqlRow[],
  userIdToPersonId: ReadonlyMap<number, string>,
  lectureSeeds: ReadonlyMap<number, EventSeed>,
  shortcourseSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): LecturerMapping {
  const rowsByPair = new Map<string, LegacyEventLecturer>();
  let skipped = 0;
  const add = (
    row: ParsedSqlRow,
    activityColumn: string,
    seeds: ReadonlyMap<number, EventSeed>,
  ): void => {
    const userId = decimalToInt(row.idUserFK);
    const activityId = decimalToInt(row[activityColumn]);
    if (userId == null || activityId == null) { skipped += 1; return; }
    const personId = userIdToPersonId.get(userId);
    const seed = seeds.get(activityId);
    if (!personId || !seed) { skipped += 1; return; }
    const key = `${seed.id}\u0000${personId}`;
    rowsByPair.set(key, { eventId: seed.id, personId, createdAt: seed.startDate ?? fallbackNow, createdById: null });
  };
  lectureRows.forEach((row) => add(row, 'idLectureFK', lectureSeeds));
  shortcourseRows.forEach((row) => add(row, 'idShortcourseFK', shortcourseSeeds));
  return { eventLecturers: [...rowsByPair.values()].sort((left, right) => `${left.eventId}\u0000${left.personId}`.localeCompare(`${right.eventId}\u0000${right.personId}`)), skippedLecturers: skipped };
}

function printPayloadSummary(payload: LegacyImportPayload): void {
  console.log(
    `Prepared rows -> major_events=${payload.majorEvents.length}, event_groups=${payload.eventGroups.length}, events=${payload.events.length}, people=${payload.people.length}, major_event_subscriptions=${payload.majorEventSubscriptions.length}, event_subscriptions=${payload.eventSubscriptions.length}, event_attendances=${payload.eventAttendances.length}, event_lecturers=${payload.eventLecturers.length}, skipped_major_subscriptions=${payload.skippedMajorSubscriptions}, skipped_event_subscriptions=${payload.skippedEventSubscriptions}, skipped_attendances=${payload.skippedAttendances}, skipped_lecturers=${payload.skippedLecturers}`,
  );
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
