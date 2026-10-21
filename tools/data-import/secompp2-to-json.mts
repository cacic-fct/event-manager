#!/usr/bin/env node

import {
  atStartOfDay,
  buildPrefixedId,
  coerceText,
  combineDateAndTime,
  decimalToCents,
  decimalToInt,
  normalizeCpf,
  normalizeEmail,
  normalizeIdPart,
  normalizePersonName,
  parseInsertRowsByTable,
  parseMysqlDate,
  parseMysqlDatetime,
  parseMysqlTime,
  stripHtml,
  utcNow,
} from './lib/legacy-sql.mts';
import type { ParsedSqlRow, ParsedSqlTables } from './lib/legacy-sql.mts';
import { isMain } from './lib/common.mts';
import { writeTransferResources } from './lib/transfer.mts';
import type { TransferResource } from './lib/transfer.mts';

const PREFIX = 'SYSCOMP-2-';

interface Secompp2CliOptions {
  input: string;
  output: string;
  help: boolean;
}

interface PersonReference {
  name?: string;
  email?: string;
  identityDocument?: string;
}

interface MappedMajorEvent {
  id: string;
  data: Record<string, unknown>;
}

interface MappedEventGroup {
  id: string;
  majorEventId: string;
  type: 'PALESTRA' | 'MINICURSO';
  data: Record<string, unknown>;
}

interface MappedEvent {
  id: string;
  data: Record<string, unknown>;
}

interface MappedMajorSubscription {
  key: string;
  personKey: string;
  majorEventId: string;
  person: PersonReference;
  amountPaid: number | null;
  paymentDate: string | null;
  selectedEventIds: string[];
  subscriptionStatus: 'CONFIRMED' | 'WAITING_RECEIPT_UPLOAD';
}

interface MappedEventSubscription {
  key: string;
  personKey: string;
  majorEventId: string;
  eventId: string;
  person: PersonReference;
}

interface MappedAttendance {
  key: string;
  eventId: string;
  person: PersonReference;
  attendedAt: string;
  status: 'PRESENT' | 'ABSENT';
}

interface ImportPayload {
  resources: TransferResource[];
  report: Record<string, unknown>;
  counts: Record<string, number>;
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
  speakerCpf: string | null;
}

interface PeopleMapping {
  cpfToPerson: Map<string, PersonReference>;
  peopleWithoutNames: number;
  peopleWithoutIdentifiers: number;
  invalidEmailCount: number;
}

interface MajorSubscriptionMapping {
  majorEventSubscriptions: MappedMajorSubscription[];
  skippedMajorSubscriptions: number;
  paidByMajorEvent: Map<string, boolean>;
  invalidAmountRows: number;
}

interface EventSubscriptionMapping {
  eventSubscriptions: MappedEventSubscription[];
  skippedEventSubscriptions: number;
}

interface AttendanceMapping {
  eventAttendances: MappedAttendance[];
  skippedAttendances: number;
  unknownAttendanceStates: number;
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
    output: 'import/transfers/secompp2',
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const equalsIndex = argument.indexOf('=');
    const name = equalsIndex >= 0 ? argument.slice(0, equalsIndex) : argument;
    if (name !== '--input' && name !== '--output') {
      throw new Error(`Unknown option: ${name}`);
    }
    const inlineValue = equalsIndex >= 0 ? argument.slice(equalsIndex + 1) : undefined;
    const value = inlineValue ?? argv[++index];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${name}.`);
    }
    switch (name) {
      case '--input':
        options.input = value;
        break;
      case '--output':
        options.output = value;
        break;
      default:
        throw new Error(`Unknown option: ${name}`);
    }
  }
  return options;
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<ImportPayload | undefined> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: bun run data-import -- secompp2-to-json [--input PATH] [--output DIRECTORY]');
    return;
  }
  const payload = await buildPayload(options.input);
  const result = await writeTransferResources(options.output, payload.resources, payload.report);
  console.log(`Wrote ${payload.resources.length} transfer resources to ${result.directory}.`);
  console.log(`Counts: ${JSON.stringify(payload.counts)}.`);
  return payload;
}

export async function buildPayload(sqlPath: string): Promise<ImportPayload> {
  const parsed = await parseInsertRowsByTable(sqlPath, REQUIRED_TABLES);
  const now = utcNow();
  const majorEventIdByYearRef = mapMajorEventIds(tableRows(parsed, 'ano_referencia'));
  const eventGroups = buildEventGroups(majorEventIdByYearRef.values());
  const eventGroupIdByMajorEventAndType = new Map(
    eventGroups.map((row) => [`${row.majorEventId}:${row.type}`, row.id]),
  );
  const minicursoSeeds = mapMinicursos(tableRows(parsed, 'minicurso'), majorEventIdByYearRef, now);
  const palestraSeeds = mapPalestras(tableRows(parsed, 'palestra'), majorEventIdByYearRef, now);
  const allReferencedCpfs = collectReferencedCpfs(parsed, palestraSeeds);
  const { cpfToPerson, peopleWithoutNames, peopleWithoutIdentifiers, invalidEmailCount } = mapPeople(
    tableRows(parsed, 'dados'),
    allReferencedCpfs,
  );
  const { majorEventSubscriptions, skippedMajorSubscriptions, paidByMajorEvent, invalidAmountRows } =
    mapMajorEventSubscriptions(tableRows(parsed, 'inscricao'), cpfToPerson, majorEventIdByYearRef);
  const eventSubscriptionResult = mapEventSubscriptions(
    tableRows(parsed, 'participacao_minicurso'),
    tableRows(parsed, 'participacao_palestra'),
    cpfToPerson,
    minicursoSeeds,
    palestraSeeds,
  );
  const attendanceResult = mapEventAttendances(
    tableRows(parsed, 'participacao_minicurso'),
    cpfToPerson,
    minicursoSeeds,
    now,
  );
  const events = buildEventRows(minicursoSeeds, palestraSeeds, eventGroupIdByMajorEventAndType);
  const majorEvents = buildMajorEventRows(
    tableRows(parsed, 'ano_referencia'),
    majorEventIdByYearRef,
    events,
    paidByMajorEvent,
    now,
  );
  const { eventSubscriptions, skippedEventSubscriptions } = eventSubscriptionResult;
  const { eventAttendances, skippedAttendances } = attendanceResult;
  for (const subscription of majorEventSubscriptions) {
    subscription.selectedEventIds = [
      ...new Set(
        eventSubscriptions
          .filter((row) => row.personKey === subscription.personKey && row.majorEventId === subscription.majorEventId)
          .map((row) => row.eventId),
      ),
    ].sort();
  }
  const unsupportedLecturerRows =
    tableRows(parsed, 'ministrante_minicurso').length +
    [...palestraSeeds.values()].filter((seed) => seed.speakerCpf !== null).length;
  const resources: TransferResource[] = [
    ...majorEvents.map((row) => ({ kind: 'major-event', id: row.id, data: row.data })),
    ...eventGroups.map((row) => ({ kind: 'group', id: row.id, data: row.data })),
    ...events.map((row) => ({ kind: 'event', id: row.id, data: row.data })),
    ...majorEventSubscriptions.map((row) => ({
      kind: 'major-event-subscription',
      key: row.key,
      data: {
        majorEventId: row.majorEventId,
        person: row.person,
        subscriptionStatus: row.subscriptionStatus,
        amountPaid: row.amountPaid,
        paymentDate: row.paymentDate,
        paymentTier: null,
        selectedEventIds: row.selectedEventIds,
        imageLicenseAgreementAccepted: false,
      },
    })),
    ...eventSubscriptions.map((row) => ({
      kind: 'event-subscription',
      key: row.key,
      data: {
        eventId: row.eventId,
        person: row.person,
        imageLicenseAgreementAccepted: false,
      },
    })),
    ...eventAttendances.map((row) => ({
      kind: 'event-attendance',
      key: row.key,
      data: { eventId: row.eventId, person: row.person, attendedAt: row.attendedAt, status: row.status },
    })),
  ];
  const counts = {
    majorEvents: majorEvents.length,
    eventGroups: eventGroups.length,
    events: events.length,
    majorEventSubscriptions: majorEventSubscriptions.length,
    eventSubscriptions: eventSubscriptions.length,
    eventAttendances: eventAttendances.length,
    skippedMajorSubscriptions,
    skippedEventSubscriptions,
    skippedAttendances,
    unknownAttendanceStates: attendanceResult.unknownAttendanceStates,
    peopleWithoutNames,
    peopleWithoutIdentifiers,
    invalidEmails: invalidEmailCount,
    invalidPaymentAmounts: invalidAmountRows,
    unsupportedLecturerAssignments: unsupportedLecturerRows,
  };
  return {
    resources,
    counts,
    report: {
      source: 'SECOMPP 2 SQL dump',
      counts,
      notes: {
        paymentAmounts:
          'Assuming legacy amount values are BRL decimal units, values were converted to integer centavos. Invalid or out-of-range values were exported as null.',
        timestamps:
          'Naive MySQL datetimes and date-only values are interpreted as UTC; date-only values use UTC midnight.',
        people:
          'Person references use source names, email addresses and identity documents. No person resources or generated person IDs are exported.',
      },
      unsupported: {
        lecturerAssignments: {
          rows: unsupportedLecturerRows,
          reason: 'The JSON transfer schema has no lecturer-assignment resource.',
        },
        invalidEmails: {
          rows: invalidEmailCount,
          reason: 'Invalid legacy email values were omitted from person references.',
        },
        invalidPaymentAmounts: {
          rows: invalidAmountRows,
          reason: 'Invalid, negative or out-of-range amounts cannot be represented by the transfer schema.',
        },
        unknownAttendanceStates: {
          rows: attendanceResult.unknownAttendanceStates,
          reason: 'Only source presence values 0 and 1 map to ABSENT and PRESENT.',
        },
      },
    },
  };
}

export function mapMajorEventIds(anoRows: readonly ParsedSqlRow[]): Map<number, string> {
  const mapping = new Map<number, string>();
  for (const row of anoRows) {
    const yearRefId = decimalToInt(row.idAno_Referencia);
    if (yearRefId != null) {
      mapping.set(yearRefId, buildPrefixedId(PREFIX, 'major-event', 'ano', yearRefId));
    }
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
    if (minicursoId == null || yearRefId == null) {
      continue;
    }
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!majorEventId) {
      continue;
    }
    const eventDate = parseMysqlDate(row.data);
    const startTime = parseMysqlTime(row.hora_inicio);
    const endTime = parseMysqlTime(row.hora_termino);
    const startDate = combineDateAndTime(eventDate, startTime) ?? atStartOfDay(eventDate) ?? fallbackNow;
    let endDate = combineDateAndTime(eventDate, endTime) ?? startDate;
    if (endDate < startDate) {
      endDate = startDate;
    }
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
    if (palestraId == null || yearRefId == null) {
      continue;
    }
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!majorEventId) {
      continue;
    }
    const eventDate = parseMysqlDate(row.data);
    const startTime = parseMysqlTime(row.hora_inicio);
    const endTime = parseMysqlTime(row.hora_termino);
    const startDate = combineDateAndTime(eventDate, startTime) ?? atStartOfDay(eventDate) ?? fallbackNow;
    let endDate = combineDateAndTime(eventDate, endTime) ?? startDate;
    if (endDate < startDate) {
      endDate = startDate;
    }
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
    if (cpf) {
      cpfs.add(cpf);
    }
  };
  tableRows(parsed, 'dados').forEach((row) => add(row, 'CPF'));
  tableRows(parsed, 'inscricao').forEach((row) => add(row, 'CPFdadosFK'));
  tableRows(parsed, 'participacao_minicurso').forEach((row) => add(row, 'CPFusuarioFK'));
  tableRows(parsed, 'participacao_palestra').forEach((row) => add(row, 'CPFusuarioFK'));
  tableRows(parsed, 'ministrante_minicurso').forEach((row) => add(row, 'CPFusuarioFK'));
  for (const seed of palestraSeeds.values()) {
    if (seed.speakerCpf) {
      cpfs.add(seed.speakerCpf);
    }
  }
  return cpfs;
}

export function mapPeople(legacyRows: readonly ParsedSqlRow[], requiredCpfs: ReadonlySet<string>): PeopleMapping {
  const peopleByCpf = new Map<string, PersonReference>();
  let invalidEmailCount = 0;
  for (const row of legacyRows) {
    const cpf = normalizeCpf(row.CPF);
    if (!cpf) {
      continue;
    }
    const person = peopleByCpf.get(cpf) ?? { identityDocument: cpf };
    const name = normalizePersonName(row.nome);
    if (!person.name && name) {
      person.name = name;
    }
    const email = normalizeEmail(row.email);
    if (email) {
      if (isValidTransferEmail(email)) {
        person.email ??= email;
      } else {
        invalidEmailCount += 1;
      }
    }
    peopleByCpf.set(cpf, person);
  }
  for (const cpf of [...requiredCpfs].sort()) {
    if (peopleByCpf.has(cpf)) {
      continue;
    }
    peopleByCpf.set(cpf, { identityDocument: cpf });
  }
  const people = [...peopleByCpf.values()];
  return {
    cpfToPerson: new Map([...peopleByCpf.entries()].sort(([left], [right]) => left.localeCompare(right))),
    peopleWithoutNames: people.filter((person) => !person.name).length,
    peopleWithoutIdentifiers: people.filter((person) => !person.email && !person.identityDocument).length,
    invalidEmailCount,
  };
}

export function mapMajorEventSubscriptions(
  legacyRows: readonly ParsedSqlRow[],
  cpfToPerson: ReadonlyMap<string, PersonReference>,
  majorEventIdByYearRef: ReadonlyMap<number, string>,
): MajorSubscriptionMapping {
  const rowsByKey = new Map<string, MappedMajorSubscription>();
  const paidByMajorEvent = new Map<string, boolean>();
  let skipped = 0;
  let invalidAmountRows = 0;
  for (const row of legacyRows) {
    const cpf = normalizeCpf(row.CPFdadosFK);
    const yearRefId = decimalToInt(row.idAno_ReferenciaFK);
    const inscriptionId = decimalToInt(row.idInscricao);
    if (!cpf || yearRefId == null || inscriptionId == null) {
      skipped += 1;
      continue;
    }
    const person = cpfToPerson.get(cpf);
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!person || !majorEventId) {
      skipped += 1;
      continue;
    }
    const rawAmount = coerceText(row.total);
    const amountPaid = decimalToCents(row.total);
    if (rawAmount && amountPaid === null) {
      invalidAmountRows += 1;
    }
    if (amountPaid != null && amountPaid > 0) {
      paidByMajorEvent.set(majorEventId, true);
    }
    const status = decimalToInt(row.status) || 0;
    const paymentDate = parseMysqlDatetime(row.create_time)?.toISOString() ?? null;
    const legacyId = normalizeIdPart(row.idInscricao);
    const key = `${PREFIX}major-sub-${legacyId || `${inscriptionId}-${cpf}-${yearRefId}`}`;
    rowsByKey.set(key, {
      key,
      personKey: cpf,
      majorEventId,
      person,
      amountPaid,
      paymentDate,
      selectedEventIds: [],
      subscriptionStatus: status === 1 ? 'CONFIRMED' : 'WAITING_RECEIPT_UPLOAD',
    });
  }
  return {
    majorEventSubscriptions: [...rowsByKey.values()].sort((left, right) => left.key.localeCompare(right.key)),
    skippedMajorSubscriptions: skipped,
    paidByMajorEvent,
    invalidAmountRows,
  };
}

export function mapEventSubscriptions(
  minicursoRows: readonly ParsedSqlRow[],
  palestraRows: readonly ParsedSqlRow[],
  cpfToPerson: ReadonlyMap<string, PersonReference>,
  minicursoSeeds: ReadonlyMap<number, EventSeed>,
  palestraSeeds: ReadonlyMap<number, EventSeed>,
): EventSubscriptionMapping {
  const rowsByPair = new Map<string, MappedEventSubscription>();
  let skipped = 0;
  const add = (row: ParsedSqlRow, idColumn: string, kind: string, seeds: ReadonlyMap<number, EventSeed>): void => {
    const cpf = normalizeCpf(row.CPFusuarioFK);
    const activityId = decimalToInt(row[idColumn]);
    if (!cpf || activityId == null) {
      skipped += 1;
      return;
    }
    const person = cpfToPerson.get(cpf);
    const seed = seeds.get(activityId);
    if (!person || !seed) {
      skipped += 1;
      return;
    }
    const legacyId = normalizeIdPart(row.id);
    const key = `${PREFIX}event-sub-${kind}-${legacyId || `${cpf}-${activityId}`}`;
    rowsByPair.set(`${kind}:${cpf}:${activityId}`, {
      key,
      personKey: cpf,
      majorEventId: seed.majorEventId,
      eventId: seed.id,
      person,
    });
  };
  minicursoRows.forEach((row) => add(row, 'idMinicursoFK', 'minicurso', minicursoSeeds));
  palestraRows.forEach((row) => add(row, 'idPalestraFK', 'palestra', palestraSeeds));
  return {
    eventSubscriptions: [...rowsByPair.values()].sort((left, right) => left.key.localeCompare(right.key)),
    skippedEventSubscriptions: skipped,
  };
}

export function mapEventAttendances(
  legacyRows: readonly ParsedSqlRow[],
  cpfToPerson: ReadonlyMap<string, PersonReference>,
  minicursoSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): AttendanceMapping {
  const rowsByPair = new Map<string, MappedAttendance>();
  let skipped = 0;
  let unknownStatusCount = 0;
  for (const row of legacyRows) {
    const rawPresence = coerceText(row.presenca);
    const parsedPresence = rawPresence === null ? Number.NaN : Number(rawPresence);
    if (!Number.isInteger(parsedPresence) || (parsedPresence !== 0 && parsedPresence !== 1)) {
      unknownStatusCount += 1;
      continue;
    }
    const cpf = normalizeCpf(row.CPFusuarioFK);
    const minicursoId = decimalToInt(row.idMinicursoFK);
    if (!cpf || minicursoId == null) {
      skipped += 1;
      continue;
    }
    const person = cpfToPerson.get(cpf);
    const seed = minicursoSeeds.get(minicursoId);
    if (!person || !seed) {
      skipped += 1;
      continue;
    }
    const attendedAt = (parseMysqlDatetime(row.create_time) ?? seed.startDate ?? fallbackNow).toISOString();
    const legacyId = normalizeIdPart(row.id);
    const key = `${PREFIX}attendance-minicurso-${legacyId || `${cpf}-${seed.id}`}`;
    rowsByPair.set(`${cpf}\u0000${seed.id}`, {
      key,
      eventId: seed.id,
      person,
      attendedAt,
      status: parsedPresence === 1 ? 'PRESENT' : 'ABSENT',
    });
  }
  return {
    eventAttendances: [...rowsByPair.values()].sort((left, right) =>
      `${left.eventId}\u0000${left.key}`.localeCompare(`${right.eventId}\u0000${right.key}`),
    ),
    skippedAttendances: skipped,
    unknownAttendanceStates: unknownStatusCount,
  };
}

export function buildEventGroups(majorEventIds: Iterable<string>): MappedEventGroup[] {
  return [...new Set(majorEventIds)].sort().flatMap((majorEventId) => [
    {
      id: buildPrefixedId(`${majorEventId}-`, 'event-group', 'palestras'),
      majorEventId,
      type: 'PALESTRA',
      data: {
        name: 'Palestras (SECOMPP legado 2)',
        emoji: '🎤',
        majorEventId,
        audience: 'PUBLIC',
        audienceCourseCodes: [],
        interestEnabled: false,
        requiresImageLicenseAgreement: false,
        attendanceEligibility: null,
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        shouldIssueCertificateForEachEvent: false,
        shouldIssuePartialCertificate: false,
      },
    },
    {
      id: buildPrefixedId(`${majorEventId}-`, 'event-group', 'minicursos'),
      majorEventId,
      type: 'MINICURSO',
      data: {
        name: 'Minicursos (SECOMPP legado 2)',
        emoji: '🧪',
        majorEventId,
        audience: 'PUBLIC',
        audienceCourseCodes: [],
        interestEnabled: false,
        requiresImageLicenseAgreement: false,
        attendanceEligibility: null,
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        shouldIssueCertificateForEachEvent: false,
        shouldIssuePartialCertificate: false,
      },
    },
  ]);
}

export function buildEventRows(
  minicursoSeeds: ReadonlyMap<number, EventSeed>,
  palestraSeeds: ReadonlyMap<number, EventSeed>,
  eventGroupIdByMajorEventAndType: ReadonlyMap<string, string>,
): MappedEvent[] {
  const rows: MappedEvent[] = [];
  for (const seed of [...minicursoSeeds.values(), ...palestraSeeds.values()]) {
    rows.push({
      id: seed.id,
      data: {
        name: seed.name,
        emoji: seed.emoji,
        startDate: seed.startDate.toISOString(),
        endDate: seed.endDate.toISOString(),
        type: seed.type,
        creditMinutes: seed.creditMinutes,
        description: seed.description,
        shortDescription: seed.shortDescription,
        latitude: null,
        longitude: null,
        locationDescription: seed.locationDescription,
        majorEventId: seed.majorEventId,
        eventGroupId: eventGroupIdByMajorEventAndType.get(`${seed.majorEventId}:${seed.type}`) ?? null,
        audience: 'PUBLIC',
        audienceCourseCodes: [],
        interestEnabled: false,
        requiresImageLicenseAgreement: false,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        allowSubscription: true,
        slots: seed.slots,
        autoSubscribe: false,
        attendanceEligibility: null,
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        regularAttendancePriceTierIds: [],
        shouldCollectAttendance: true,
        shouldAllowOralAttendance: false,
        isOnlineAttendanceAllowed: false,
        onlineAttendanceStartDate: null,
        onlineAttendanceEndDate: null,
        shouldProvideSubscriberListToLecturer: false,
        isPubliclyListed: true,
        displayLecturerProfile: false,
        youtubeCode: null,
        twitchChannel: null,
        buttonText: null,
        buttonLink: null,
      },
    });
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildMajorEventRows(
  anoRows: readonly ParsedSqlRow[],
  majorEventIdByYearRef: ReadonlyMap<number, string>,
  eventRows: readonly MappedEvent[],
  paidByMajorEvent: ReadonlyMap<string, boolean>,
  fallbackNow: Date,
): MappedMajorEvent[] {
  const dateRanges = new Map<string, [Date, Date]>();
  for (const event of eventRows) {
    const majorEventId = event.data['majorEventId'];
    const startRaw = event.data['startDate'];
    const endRaw = event.data['endDate'];
    if (typeof majorEventId !== 'string' || typeof startRaw !== 'string' || typeof endRaw !== 'string') {
      continue;
    }
    const startDate = new Date(startRaw);
    const endDate = new Date(endRaw);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      continue;
    }
    const existing = dateRanges.get(majorEventId);
    if (!existing) {
      dateRanges.set(majorEventId, [startDate, endDate]);
    } else {
      dateRanges.set(majorEventId, [
        existing[0] < startDate ? existing[0] : startDate,
        existing[1] > endDate ? existing[1] : endDate,
      ]);
    }
  }
  const rows: MappedMajorEvent[] = [];
  for (const row of anoRows) {
    const yearRefId = decimalToInt(row.idAno_Referencia);
    const year = decimalToInt(row.ano);
    if (yearRefId == null) {
      continue;
    }
    const majorEventId = majorEventIdByYearRef.get(yearRefId);
    if (!majorEventId) {
      continue;
    }
    const range = dateRanges.get(majorEventId);
    const fallbackYear = year || 2000;
    const defaultStart = atStartOfDay(new Date(Date.UTC(fallbackYear, 0, 1)));
    const defaultEnd = atStartOfDay(new Date(Date.UTC(fallbackYear, 11, 31)));
    const startDate = range?.[0] ?? defaultStart ?? fallbackNow;
    let endDate = range?.[1] ?? defaultEnd ?? startDate;
    if (endDate < startDate) {
      endDate = startDate;
    }
    rows.push({
      id: majorEventId,
      data: {
        name: year ? `SECOMPP ${year}` : `SECOMPP ano ${yearRefId}`,
        emoji: '🎓',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        description: 'Importado de secompp2.sql',
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        requiresImageLicenseAgreement: false,
        audience: 'PUBLIC',
        audienceCourseCodes: [],
        interestEnabled: false,
        attendanceEligibility: null,
        maxCoursesPerAttendee: null,
        maxLecturesPerAttendee: null,
        maxUncategorizedPerAttendee: null,
        rankedSubscriptionEnabled: null,
        buttonText: null,
        buttonLink: null,
        contactInfo: null,
        contactType: null,
        isPaymentRequired: paidByMajorEvent.get(majorEventId) === true,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        additionalPaymentInfo: null,
      },
    });
  }
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

function tableRows(parsed: ParsedSqlTables, table: string): ParsedSqlRow[] {
  const rows = parsed[table];
  if (rows === undefined) {
    throw new Error(`Expected parsed table '${table}'.`);
  }
  return rows;
}

function isValidTransferEmail(email: string): boolean {
  return email.length <= 300 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email);
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
