#!/usr/bin/env node

import {
  atStartOfDay,
  buildPrefixedId,
  coerceText,
  combineDateAndTime,
  decimalToInt,
  deterministicPrefixedId,
  normalizeCpf,
  normalizeEmail,
  normalizePersonName,
  parseInsertRowsByTable,
  parseMysqlDate,
  parseMysqlDatetime,
  parseMysqlTime,
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
  LegacyEventSubscription,
  LegacyImportPayload,
  LegacyMajorEvent,
  LegacyMajorEventSubscription,
  LegacyPerson,
  ParsedSqlRow,
  ParsedSqlTables,
} from './lib/legacy-sql.mts';
import { databaseUrlFromOptions, isMain } from './lib/common.mts';

const PREFIX = 'SYSCOMP-2-';

interface Secompp2CliOptions {
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
  speakerCpf: string | null;
}

interface PeopleMapping {
  people: LegacyPerson[];
  cpfToPersonId: Map<string, string>;
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
  'ano_referencia',
  'dados',
  'inscricao',
  'minicurso',
  'ministrante_minicurso',
  'palestra',
  'participacao_minicurso',
  'participacao_palestra',
]);

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): Secompp2CliOptions {
  const options: Secompp2CliOptions = {
    input: 'import/secompp2.sql',
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
    if (argument === '--help' || argument === '-h') { options.help = true; continue; }
    if (argument === '--dry-run') { options.dryRun = true; continue; }
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

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<LegacyImportPayload | undefined> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: bun run data-import -- secompp2-to-postgres [--input PATH] [--dry-run] [database options]');
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
  const majorEventIdByYearRef = mapMajorEventIds(tableRows(parsed, 'ano_referencia'));
  const eventGroups = buildEventGroups(now);
  const eventGroupIdByType = new Map<string, string>(eventGroups.map((row) => [row.type, row.id]));
  const minicursoSeeds = mapMinicursos(tableRows(parsed, 'minicurso'), majorEventIdByYearRef, now);
  const palestraSeeds = mapPalestras(tableRows(parsed, 'palestra'), majorEventIdByYearRef, now);
  const allReferencedCpfs = collectReferencedCpfs(parsed, palestraSeeds);
  const { people, cpfToPersonId } = mapPeople(tableRows(parsed, 'dados'), allReferencedCpfs, now);
  const { majorEventSubscriptions, skippedMajorSubscriptions, paidByMajorEvent } = mapMajorEventSubscriptions(
    tableRows(parsed, 'inscricao'),
    cpfToPersonId,
    majorEventIdByYearRef,
    now,
  );
  const { eventSubscriptions, skippedEventSubscriptions } = mapEventSubscriptions(
    tableRows(parsed, 'participacao_minicurso'),
    tableRows(parsed, 'participacao_palestra'),
    cpfToPersonId,
    minicursoSeeds,
    palestraSeeds,
    now,
  );
  const { eventAttendances, skippedAttendances } = mapEventAttendances(tableRows(parsed, 'participacao_minicurso'), cpfToPersonId, minicursoSeeds, now);
  const { eventLecturers, skippedLecturers } = mapEventLecturers(
    tableRows(parsed, 'ministrante_minicurso'),
    palestraSeeds,
    cpfToPersonId,
    minicursoSeeds,
    now,
  );
  const events = buildEventRows(minicursoSeeds, palestraSeeds, eventGroupIdByType, now);
  const majorEvents = buildMajorEventRows(tableRows(parsed, 'ano_referencia'), majorEventIdByYearRef, events, paidByMajorEvent, now);
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

export function mapMajorEventIds(anoRows: readonly ParsedSqlRow[]): Map<number, string> {
  const mapping = new Map<number, string>();
  for (const row of anoRows) {
    const yearRefId = decimalToInt(row.idAno_Referencia);
    if (yearRefId != null) mapping.set(yearRefId, buildPrefixedId(PREFIX, 'major-event', 'ano', yearRefId));
  }
  return mapping;
}

export function mapMinicursos(
  legacyRows: readonly ParsedSqlRow[],
  majorEventIdByYearRef: ReadonlyMap<number, string>,
  fallbackNow: Date,
): Map<number, EventSeed> {
  const rows = new Map<number, EventSeed>();
  for (const row of legacyRows) {
    const minicursoId = decimalToInt(row.idMinicurso);
    const yearRefId = decimalToInt(row.idAno_ReferenciaFK);
    if (minicursoId == null || yearRefId == null) continue;
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!majorEventId) continue;
    const eventDate = parseMysqlDate(row.data);
    const startTime = parseMysqlTime(row.hora_inicio);
    const endTime = parseMysqlTime(row.hora_termino);
    const startDate = combineDateAndTime(eventDate, startTime) ?? atStartOfDay(eventDate) ?? fallbackNow;
    let endDate = combineDateAndTime(eventDate, endTime) ?? startDate;
    if (endDate < startDate) endDate = startDate;
    const workloadHours = decimalToInt(row.cargahoraria);
    rows.set(minicursoId, {
      id: buildPrefixedId(PREFIX, 'event', 'minicurso', minicursoId),
      name: coerceText(row.nome, { fixMojibake: true }) ?? `Minicurso ${minicursoId}`,
      type: 'MINICURSO',
      emoji: '🧪',
      description: coerceText(row.descricao, { fixMojibake: true }),
      shortDescription: stripHtml(row.descricao),
      creditMinutes: workloadHours == null ? null : workloadHours * 60,
      startDate,
      endDate,
      locationDescription: coerceText(row.local, { fixMojibake: true }),
      majorEventId,
      slots: decimalToInt(row.vagas),
      createdAt: parseMysqlDatetime(row.create_time) ?? startDate,
      speakerCpf: null,
    });
  }
  return rows;
}

export function mapPalestras(
  legacyRows: readonly ParsedSqlRow[],
  majorEventIdByYearRef: ReadonlyMap<number, string>,
  fallbackNow: Date,
): Map<number, EventSeed> {
  const rows = new Map<number, EventSeed>();
  for (const row of legacyRows) {
    const palestraId = decimalToInt(row.idPalestra);
    const yearRefId = decimalToInt(row.idAno_ReferenciaFK);
    if (palestraId == null || yearRefId == null) continue;
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!majorEventId) continue;
    const eventDate = parseMysqlDate(row.data);
    const startTime = parseMysqlTime(row.hora_inicio);
    const endTime = parseMysqlTime(row.hora_termino);
    const startDate = combineDateAndTime(eventDate, startTime) ?? atStartOfDay(eventDate) ?? fallbackNow;
    let endDate = combineDateAndTime(eventDate, endTime) ?? startDate;
    if (endDate < startDate) endDate = startDate;
    rows.set(palestraId, {
      id: buildPrefixedId(PREFIX, 'event', 'palestra', palestraId),
      name: coerceText(row.nome, { fixMojibake: true }) ?? `Palestra ${palestraId}`,
      type: 'PALESTRA',
      emoji: '🎤',
      description: coerceText(row.descricao, { fixMojibake: true }),
      shortDescription: stripHtml(row.descricao),
      creditMinutes: null,
      startDate,
      endDate,
      locationDescription: coerceText(row.local, { fixMojibake: true }),
      majorEventId,
      slots: null,
      createdAt: parseMysqlDatetime(row.create_time) ?? startDate,
      speakerCpf: normalizeCpf(row.CPFusuarioFK),
    });
  }
  return rows;
}

export function collectReferencedCpfs(
  parsed: ParsedSqlTables,
  palestraSeeds: ReadonlyMap<number, EventSeed>,
): Set<string> {
  const cpfs = new Set<string>();
  const add = (row: ParsedSqlRow, column: string): void => {
    const cpf = normalizeCpf(row[column]);
    if (cpf) cpfs.add(cpf);
  };
  tableRows(parsed, 'dados').forEach((row) => add(row, 'CPF'));
  tableRows(parsed, 'inscricao').forEach((row) => add(row, 'CPFdadosFK'));
  tableRows(parsed, 'participacao_minicurso').forEach((row) => add(row, 'CPFusuarioFK'));
  tableRows(parsed, 'participacao_palestra').forEach((row) => add(row, 'CPFusuarioFK'));
  tableRows(parsed, 'ministrante_minicurso').forEach((row) => add(row, 'CPFusuarioFK'));
  for (const seed of palestraSeeds.values()) if (seed.speakerCpf) cpfs.add(seed.speakerCpf);
  return cpfs;
}

export function mapPeople(
  legacyRows: readonly ParsedSqlRow[],
  requiredCpfs: ReadonlySet<string>,
  fallbackNow: Date,
): PeopleMapping {
  const peopleByCpf = new Map<string, LegacyPerson>();
  for (const row of legacyRows) {
    const cpf = normalizeCpf(row.CPF);
    if (!cpf) continue;
    const createdAt = parseMysqlDatetime(row.create_time) ?? fallbackNow;
    peopleByCpf.set(cpf, {
      id: createUuidV7(),
      name: normalizePersonName(row.nome) ?? `Pessoa ${cpf}`,
      email: normalizeEmail(row.email),
      identityDocument: cpf,
      academicId: null,
      externalRef: buildPrefixedId(PREFIX, 'legacy-cpf', cpf),
      createdAt,
      updatedAt: fallbackNow,
    });
  }
  for (const cpf of [...requiredCpfs].sort()) {
    if (peopleByCpf.has(cpf)) continue;
    peopleByCpf.set(cpf, {
      id: createUuidV7(),
      name: `Pessoa ${cpf}`,
      email: null,
      identityDocument: cpf,
      academicId: null,
      externalRef: buildPrefixedId(PREFIX, 'legacy-cpf', cpf),
      createdAt: fallbackNow,
      updatedAt: fallbackNow,
    });
  }
  return {
    people: [...peopleByCpf.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, row]) => row),
    cpfToPersonId: new Map([...peopleByCpf.entries()].map(([cpf, row]) => [cpf, row.id])),
  };
}

export function mapMajorEventSubscriptions(
  legacyRows: readonly ParsedSqlRow[],
  cpfToPersonId: ReadonlyMap<string, string>,
  majorEventIdByYearRef: ReadonlyMap<number, string>,
  fallbackNow: Date,
): MajorSubscriptionMapping {
  const rowsById = new Map<string, LegacyMajorEventSubscription>();
  const paidByMajorEvent = new Map<string, boolean>();
  let skipped = 0;
  for (const row of legacyRows) {
    const cpf = normalizeCpf(row.CPFdadosFK);
    const yearRefId = decimalToInt(row.idAno_ReferenciaFK);
    const inscriptionId = decimalToInt(row.idInscricao);
    if (!cpf || yearRefId == null || inscriptionId == null) { skipped += 1; continue; }
    const personId = cpfToPersonId.get(cpf);
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!personId || !majorEventId) { skipped += 1; continue; }
    const amountPaid = decimalToInt(row.total);
    if (amountPaid != null && amountPaid > 0) paidByMajorEvent.set(majorEventId, true);
    const status = decimalToInt(row.status) || 0;
    const createdAt = parseMysqlDatetime(row.create_time) ?? fallbackNow;
    const id = deterministicPrefixedId(PREFIX, `legacy2-major-sub:${inscriptionId}:${cpf}:${yearRefId}`);
    rowsById.set(id, {
      id,
      majorEventId,
      personId,
      amountPaid,
      paymentDate: createdAt,
      paymentTier: null,
      subscriptionStatus: status === 1 ? 'CONFIRMED' : 'WAITING_RECEIPT_UPLOAD',
      createdAt,
      createdById: null,
    });
  }
  return { majorEventSubscriptions: [...rowsById.values()].sort((left, right) => left.id.localeCompare(right.id)), skippedMajorSubscriptions: skipped, paidByMajorEvent };
}

export function mapEventSubscriptions(
  minicursoRows: readonly ParsedSqlRow[],
  palestraRows: readonly ParsedSqlRow[],
  cpfToPersonId: ReadonlyMap<string, string>,
  minicursoSeeds: ReadonlyMap<number, EventSeed>,
  palestraSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): EventSubscriptionMapping {
  const rowsById = new Map<string, LegacyEventSubscription>();
  let skipped = 0;
  const add = (
    row: ParsedSqlRow,
    idColumn: string,
    kind: string,
    seeds: ReadonlyMap<number, EventSeed>,
  ): void => {
    const cpf = normalizeCpf(row.CPFusuarioFK);
    const activityId = decimalToInt(row[idColumn]);
    if (!cpf || activityId == null) { skipped += 1; return; }
    const personId = cpfToPersonId.get(cpf);
    const seed = seeds.get(activityId);
    if (!personId || !seed) { skipped += 1; return; }
    const id = deterministicPrefixedId(PREFIX, `legacy2-event-sub:${kind}:${cpf}:${activityId}`);
    rowsById.set(id, { id, eventId: seed.id, personId, createdAt: parseMysqlDatetime(row.create_time) ?? seed.startDate ?? fallbackNow, createdById: null });
  };
  minicursoRows.forEach((row) => add(row, 'idMinicursoFK', 'minicurso', minicursoSeeds));
  palestraRows.forEach((row) => add(row, 'idPalestraFK', 'palestra', palestraSeeds));
  return { eventSubscriptions: [...rowsById.values()].sort((left, right) => left.id.localeCompare(right.id)), skippedEventSubscriptions: skipped };
}

export function mapEventAttendances(
  legacyRows: readonly ParsedSqlRow[],
  cpfToPersonId: ReadonlyMap<string, string>,
  minicursoSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): AttendanceMapping {
  const rowsByPair = new Map<string, LegacyEventAttendance>();
  let skipped = 0;
  for (const row of legacyRows) {
    if (decimalToInt(row.presenca) !== 1) continue;
    const cpf = normalizeCpf(row.CPFusuarioFK);
    const minicursoId = decimalToInt(row.idMinicursoFK);
    if (!cpf || minicursoId == null) { skipped += 1; continue; }
    const personId = cpfToPersonId.get(cpf);
    const seed = minicursoSeeds.get(minicursoId);
    if (!personId || !seed) { skipped += 1; continue; }
    const attendedAt = parseMysqlDatetime(row.create_time) ?? seed.startDate ?? fallbackNow;
    rowsByPair.set(`${personId}\u0000${seed.id}`, { personId, eventId: seed.id, attendedAt, createdAt: attendedAt, createdById: null });
  }
  return { eventAttendances: [...rowsByPair.values()].sort((left, right) => `${left.personId}\u0000${left.eventId}`.localeCompare(`${right.personId}\u0000${right.eventId}`)), skippedAttendances: skipped };
}

export function mapEventLecturers(
  ministranteRows: readonly ParsedSqlRow[],
  palestraSeeds: ReadonlyMap<number, EventSeed>,
  cpfToPersonId: ReadonlyMap<string, string>,
  minicursoSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): LecturerMapping {
  const rowsByPair = new Map<string, LegacyEventLecturer>();
  let skipped = 0;
  for (const row of ministranteRows) {
    const cpf = normalizeCpf(row.CPFusuarioFK);
    const minicursoId = decimalToInt(row.idMinicursoFK);
    if (!cpf || minicursoId == null) { skipped += 1; continue; }
    const personId = cpfToPersonId.get(cpf);
    const seed = minicursoSeeds.get(minicursoId);
    if (!personId || !seed) { skipped += 1; continue; }
    const createdAt = parseMysqlDatetime(row.create_time) ?? seed.startDate ?? fallbackNow;
    rowsByPair.set(`${seed.id}\u0000${personId}`, { eventId: seed.id, personId, createdAt, createdById: null });
  }
  for (const seed of palestraSeeds.values()) {
    if (!seed.speakerCpf) continue;
    const personId = cpfToPersonId.get(seed.speakerCpf);
    if (!personId) { skipped += 1; continue; }
    rowsByPair.set(`${seed.id}\u0000${personId}`, { eventId: seed.id, personId, createdAt: seed.createdAt ?? fallbackNow, createdById: null });
  }
  return { eventLecturers: [...rowsByPair.values()].sort((left, right) => `${left.eventId}\u0000${left.personId}`.localeCompare(`${right.eventId}\u0000${right.personId}`)), skippedLecturers: skipped };
}

export function buildEventGroups(now: Date): LegacyEventGroup[] {
  return [
    { id: buildPrefixedId(PREFIX, 'event-group', 'palestras'), name: 'Palestras (SECOMPP legado 2)', type: 'PALESTRA', createdAt: now, updatedAt: now },
    { id: buildPrefixedId(PREFIX, 'event-group', 'minicursos'), name: 'Minicursos (SECOMPP legado 2)', type: 'MINICURSO', createdAt: now, updatedAt: now },
  ];
}

export function buildEventRows(
  minicursoSeeds: ReadonlyMap<number, EventSeed>,
  palestraSeeds: ReadonlyMap<number, EventSeed>,
  eventGroupIdByType: ReadonlyMap<string, string>,
  fallbackNow: Date,
): LegacyEvent[] {
  const rows: LegacyEvent[] = [];
  for (const seed of [...minicursoSeeds.values(), ...palestraSeeds.values()]) {
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

export function buildMajorEventRows(
  anoRows: readonly ParsedSqlRow[],
  majorEventIdByYearRef: ReadonlyMap<number, string>,
  eventRows: readonly LegacyEvent[],
  paidByMajorEvent: ReadonlyMap<string, boolean>,
  fallbackNow: Date,
): LegacyMajorEvent[] {
  const dateRanges = new Map<string, [Date, Date]>();
  for (const event of eventRows) {
    if (!event.majorEventId || !event.startDate || !event.endDate) continue;
    const existing = dateRanges.get(event.majorEventId);
    if (!existing) dateRanges.set(event.majorEventId, [event.startDate, event.endDate]);
    else dateRanges.set(event.majorEventId, [existing[0] < event.startDate ? existing[0] : event.startDate, existing[1] > event.endDate ? existing[1] : event.endDate]);
  }
  const rows: LegacyMajorEvent[] = [];
  for (const row of anoRows) {
    const yearRefId = decimalToInt(row.idAno_Referencia);
    const year = decimalToInt(row.ano);
    if (yearRefId == null) continue;
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!majorEventId) continue;
    const range = dateRanges.get(majorEventId);
    const fallbackYear = year || 2000;
    const defaultStart = atStartOfDay(new Date(Date.UTC(fallbackYear, 0, 1)));
    const defaultEnd = atStartOfDay(new Date(Date.UTC(fallbackYear, 11, 31)));
    const startDate = range?.[0] ?? defaultStart ?? fallbackNow;
    let endDate = range?.[1] ?? defaultEnd ?? startDate;
    if (endDate < startDate) endDate = startDate;
    rows.push({
      id: majorEventId,
      name: year ? `SECOMPP ${year}` : `SECOMPP ano ${yearRefId}`,
      startDate,
      endDate,
      description: 'Importado de secompp2.sql',
      isPaymentRequired: paidByMajorEvent.get(majorEventId) === true,
      createdAt: parseMysqlDatetime(row.create_time) ?? startDate,
      updatedAt: fallbackNow,
    });
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

function printPayloadSummary(payload: LegacyImportPayload): void {
  console.log(`Prepared rows -> major_events=${payload.majorEvents.length}, event_groups=${payload.eventGroups.length}, events=${payload.events.length}, people=${payload.people.length}, major_event_subscriptions=${payload.majorEventSubscriptions.length}, event_subscriptions=${payload.eventSubscriptions.length}, event_attendances=${payload.eventAttendances.length}, event_lecturers=${payload.eventLecturers.length}, skipped_major_subscriptions=${payload.skippedMajorSubscriptions}, skipped_event_subscriptions=${payload.skippedEventSubscriptions}, skipped_attendances=${payload.skippedAttendances}, skipped_lecturers=${payload.skippedLecturers}`);
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
