#!/usr/bin/env node

import {
  atStartOfDay,
  buildPrefixedId,
  coerceText,
  decimalToCents,
  decimalToInt,
  normalizeCpf,
  normalizeEmail,
  normalizeIdPart,
  normalizePersonName,
  parseInsertRowsByTable,
  parseMysqlDate,
  stripHtml,
  utcNow,
} from './lib/legacy-sql.mts';
import type { ParsedSqlRow, ParsedSqlTables } from './lib/legacy-sql.mts';
import { isMain } from './lib/common.mts';
import { transferLocationData } from './lib/location.mts';
import { writeTransferResources } from './lib/transfer.mts';
import type { TransferResource } from './lib/transfer.mts';

const PREFIX = 'SYSCOMPP-1-';

interface SecomppCliOptions {
  input: string;
  output: string;
  help: boolean;
}

export interface PersonReference {
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
  userId: number;
  majorEventId: string;
  person: PersonReference;
  amountPaid: number | null;
  paymentDate: string | null;
  selectedEventIds: string[];
  subscriptionStatus: 'CONFIRMED' | 'WAITING_RECEIPT_UPLOAD';
}

interface MappedEventSubscription {
  key: string;
  userId: number;
  majorEventId: string;
  eventId: string;
  person: PersonReference;
}

interface MappedAttendance {
  key: string;
  eventId: string;
  person: PersonReference;
  attendedAt: string;
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
}

interface MajorEventMapping {
  majorEvents: MappedMajorEvent[];
  majorEventIdByLegacy: Map<number, string>;
  majorEventStartByLegacy: Map<number, Date>;
}

interface EventSeedMapping {
  lectureSeeds: Map<number, EventSeed>;
  shortcourseSeeds: Map<number, EventSeed>;
}

interface PeopleMapping {
  userIdToPerson: Map<number, PersonReference>;
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
    output: 'import/transfers/secompp',
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
    console.log('Usage: bun run data-import -- secompp-to-json [--input PATH] [--output DIRECTORY]');
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
  const { majorEvents, majorEventIdByLegacy, majorEventStartByLegacy } = mapMajorEvents(
    tableRows(parsed, 'events'),
    now,
  );
  const { lectureSeeds, shortcourseSeeds } = mapEventSeeds(
    tableRows(parsed, 'lectures'),
    tableRows(parsed, 'shortcourses'),
    majorEventIdByLegacy,
    majorEventStartByLegacy,
    now,
  );
  const eventGroups = buildEventGroups(majorEventIdByLegacy.values());
  const eventGroupIdByMajorEventAndType = new Map(
    eventGroups.map((row) => [`${row.majorEventId}:${row.type}`, row.id]),
  );
  const { userIdToPerson, peopleWithoutNames, peopleWithoutIdentifiers, invalidEmailCount } = mapPeople(
    tableRows(parsed, 'details'),
    tableRows(parsed, 'users'),
  );
  const { majorEventSubscriptions, skippedMajorSubscriptions, paidByMajorEvent, invalidAmountRows } =
    mapMajorEventSubscriptions(tableRows(parsed, 'users_registered'), userIdToPerson, majorEventIdByLegacy);
  for (const row of majorEvents) {
    if (paidByMajorEvent.get(row.id) === true) {
      row.data['isPaymentRequired'] = true;
    }
  }
  const eventSubscriptionResult = mapEventSubscriptions(
    tableRows(parsed, 'users_registered_shortcourses'),
    userIdToPerson,
    shortcourseSeeds,
  );
  const events = buildEventRows(lectureSeeds, shortcourseSeeds, eventGroupIdByMajorEventAndType);
  const attendanceResult = mapEventAttendances(
    tableRows(parsed, 'presence_lectures'),
    tableRows(parsed, 'presence_shortcourses'),
    userIdToPerson,
    lectureSeeds,
    shortcourseSeeds,
    now,
  );
  const { eventSubscriptions, skippedEventSubscriptions } = eventSubscriptionResult;
  const { eventAttendances, skippedAttendances } = attendanceResult;
  for (const subscription of majorEventSubscriptions) {
    subscription.selectedEventIds = [
      ...new Set(
        eventSubscriptions
          .filter((row) => row.userId === subscription.userId && row.majorEventId === subscription.majorEventId)
          .map((row) => row.eventId),
      ),
    ].sort();
  }
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
      data: { eventId: row.eventId, person: row.person, attendedAt: row.attendedAt, status: 'PRESENT' },
    })),
  ];
  const unsupportedLecturerRows =
    tableRows(parsed, 'users_lectures').length + tableRows(parsed, 'users_shortcourses').length;
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
      source: 'SECOMPP 1 SQL dump',
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
      },
    },
  };
}

export function mapMajorEvents(legacyRows: readonly ParsedSqlRow[], fallbackNow: Date): MajorEventMapping {
  const rows: MappedMajorEvent[] = [];
  const majorEventIdByLegacy = new Map<number, string>();
  const majorEventStartByLegacy = new Map<number, Date>();
  for (const legacyRow of legacyRows) {
    const legacyId = decimalToInt(legacyRow.idEvent);
    if (legacyId == null) {
      continue;
    }
    const startDate = atStartOfDay(parseMysqlDate(legacyRow.start)) ?? fallbackNow;
    let endDate = atStartOfDay(parseMysqlDate(legacyRow.end)) ?? startDate;
    if (endDate < startDate) {
      endDate = startDate;
    }
    const location = coerceText(legacyRow.location, { fixMojibake: true });
    const link = coerceText(legacyRow.link, { fixMojibake: true });
    const description = coerceText(legacyRow.description, { fixMojibake: true });
    const descriptionParts = [description].filter(Boolean);
    if (location) {
      descriptionParts.push(`Local: ${location}`);
    }
    if (link) {
      descriptionParts.push(`Link legado: ${link}`);
    }
    const id = buildPrefixedId(PREFIX, 'major-event', legacyId);
    majorEventIdByLegacy.set(legacyId, id);
    majorEventStartByLegacy.set(legacyId, startDate);
    rows.push({
      id,
      data: {
        name: coerceText(legacyRow.name, { fixMojibake: true }) ?? `Evento legado ${legacyId}`,
        emoji: '🎓',
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        description: descriptionParts.length ? descriptionParts.join('\n') : null,
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
        isPaymentRequired: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        additionalPaymentInfo: null,
      },
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
    if (legacyLectureId == null || legacyEventId == null) {
      continue;
    }
    const majorEventId = majorEventIdByLegacy.get(legacyEventId);
    if (!majorEventId) {
      continue;
    }
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
    });
  }
  for (const row of shortcourseRows) {
    const legacyShortcourseId = decimalToInt(row.idShortcourse);
    const legacyEventId = decimalToInt(row.idEventFK);
    if (legacyShortcourseId == null || legacyEventId == null) {
      continue;
    }
    const majorEventId = majorEventIdByLegacy.get(legacyEventId);
    if (!majorEventId) {
      continue;
    }
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
    });
  }
  return { lectureSeeds, shortcourseSeeds };
}

export function buildEventGroups(majorEventIds: Iterable<string>): MappedEventGroup[] {
  return [...new Set(majorEventIds)].sort().flatMap((majorEventId) => [
    {
      id: buildPrefixedId(`${majorEventId}-`, 'event-group', 'palestras'),
      majorEventId,
      type: 'PALESTRA',
      data: {
        name: 'Palestras (SECOMPP legado 1)',
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
        name: 'Minicursos (SECOMPP legado 1)',
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

export function mapPeople(detailRows: readonly ParsedSqlRow[], userRows: readonly ParsedSqlRow[]): PeopleMapping {
  const personByKey = new Map<string, PersonReference>();
  const detailIdToPerson = new Map<number, PersonReference>();
  const userIdToPerson = new Map<number, PersonReference>();
  let invalidEmailCount = 0;
  for (const detailRow of detailRows) {
    const detailId = decimalToInt(detailRow.idDetail);
    if (detailId == null) {
      continue;
    }
    const cpf = normalizeCpf(detailRow.cpf);
    const personKey = cpf ? `cpf:${cpf}` : `detail:${detailId}`;
    const person = personByKey.get(personKey) ?? {};
    const name = normalizePersonName(detailRow.name);
    if (!person.name && name) {
      person.name = name;
    }
    if (!person.identityDocument && cpf) {
      person.identityDocument = cpf;
    }
    personByKey.set(personKey, person);
    detailIdToPerson.set(detailId, person);
  }
  for (const userRow of userRows) {
    const userId = decimalToInt(userRow.idUser);
    const detailId = decimalToInt(userRow.idDetailFK);
    if (userId == null) {
      continue;
    }
    let person = detailIdToPerson.get(detailId ?? -1);
    if (!person) {
      const personKey = `user:${userId}`;
      person = personByKey.get(personKey) ?? {};
      personByKey.set(personKey, person);
    }
    const email = normalizeEmail(userRow.email);
    if (email) {
      if (isValidTransferEmail(email)) {
        person.email ??= email;
      } else {
        invalidEmailCount += 1;
      }
    }
    if (Object.keys(person).length > 0) {
      userIdToPerson.set(userId, person);
    }
  }
  const uniquePeople = [...new Set(personByKey.values())];
  return {
    userIdToPerson,
    peopleWithoutNames: uniquePeople.filter((person) => !person.name).length,
    peopleWithoutIdentifiers: uniquePeople.filter((person) => !person.email && !person.identityDocument).length,
    invalidEmailCount,
  };
}

export function mapMajorEventSubscriptions(
  legacyRows: readonly ParsedSqlRow[],
  userIdToPerson: ReadonlyMap<number, PersonReference>,
  majorEventIdByLegacy: ReadonlyMap<number, string>,
): MajorSubscriptionMapping {
  const rowsByPair = new Map<string, MappedMajorSubscription>();
  const paidByMajorEvent = new Map<string, boolean>();
  let skipped = 0;
  let invalidAmountRows = 0;
  for (const row of legacyRows) {
    const userId = decimalToInt(row.idUserFK);
    const legacyEventId = decimalToInt(row.idEventFK);
    if (userId == null || legacyEventId == null) {
      skipped += 1;
      continue;
    }
    const person = userIdToPerson.get(userId);
    const majorEventId = majorEventIdByLegacy.get(legacyEventId);
    if (!person || !majorEventId) {
      skipped += 1;
      continue;
    }
    const rawAmount = coerceText(row.amount);
    const amountPaid = decimalToCents(row.amount);
    if (rawAmount && amountPaid === null) {
      invalidAmountRows += 1;
    }
    if (amountPaid != null && amountPaid > 0) {
      paidByMajorEvent.set(majorEventId, true);
    }
    const statusRaw = (coerceText(row.status) ?? '').toUpperCase();
    const subscriptionStatus = statusRaw === 'S' ? 'CONFIRMED' : 'WAITING_RECEIPT_UPLOAD';
    const legacyId = normalizeIdPart(row.id);
    const key = `${PREFIX}major-sub-${legacyId || `${userId}-${legacyEventId}`}`;
    rowsByPair.set(`${userId}\u0000${legacyEventId}`, {
      key,
      userId,
      majorEventId,
      person,
      amountPaid,
      paymentDate: null,
      selectedEventIds: [],
      subscriptionStatus,
    });
  }
  return {
    majorEventSubscriptions: [...rowsByPair.values()].sort((left, right) => left.key.localeCompare(right.key)),
    skippedMajorSubscriptions: skipped,
    paidByMajorEvent,
    invalidAmountRows,
  };
}

export function mapEventSubscriptions(
  legacyRows: readonly ParsedSqlRow[],
  userIdToPerson: ReadonlyMap<number, PersonReference>,
  shortcourseSeeds: ReadonlyMap<number, EventSeed>,
): EventSubscriptionMapping {
  const rowsById = new Map<string, MappedEventSubscription>();
  let skipped = 0;
  for (const row of legacyRows) {
    const userId = decimalToInt(row.idUserFK);
    const shortcourseId = decimalToInt(row.idShortcourseFK);
    if (userId == null || shortcourseId == null) {
      skipped += 1;
      continue;
    }
    const person = userIdToPerson.get(userId);
    const seed = shortcourseSeeds.get(shortcourseId);
    if (!person || !seed) {
      skipped += 1;
      continue;
    }
    const legacyId = normalizeIdPart(row.id);
    const key = `${PREFIX}event-sub-${legacyId || `${userId}-${shortcourseId}`}`;
    rowsById.set(`${userId}\u0000${shortcourseId}`, {
      key,
      userId,
      majorEventId: seed.majorEventId,
      eventId: seed.id,
      person,
    });
  }
  return {
    eventSubscriptions: [...rowsById.values()].sort((left, right) => left.key.localeCompare(right.key)),
    skippedEventSubscriptions: skipped,
  };
}

export function buildEventRows(
  lectureSeeds: ReadonlyMap<number, EventSeed>,
  shortcourseSeeds: ReadonlyMap<number, EventSeed>,
  eventGroupIdByMajorEventAndType: ReadonlyMap<string, string>,
): MappedEvent[] {
  const rows: MappedEvent[] = [];
  for (const seed of [...lectureSeeds.values(), ...shortcourseSeeds.values()]) {
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
        ...transferLocationData(seed.locationDescription),
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

export function mapEventAttendances(
  lectureRows: readonly ParsedSqlRow[],
  shortcourseRows: readonly ParsedSqlRow[],
  userIdToPerson: ReadonlyMap<number, PersonReference>,
  lectureSeeds: ReadonlyMap<number, EventSeed>,
  shortcourseSeeds: ReadonlyMap<number, EventSeed>,
  fallbackNow: Date,
): AttendanceMapping {
  const rowsByPair = new Map<string, MappedAttendance>();
  let skipped = 0;
  const add = (
    row: ParsedSqlRow,
    activityColumn: string,
    sourceKind: 'lecture' | 'shortcourse',
    seeds: ReadonlyMap<number, EventSeed>,
  ): void => {
    const userId = decimalToInt(row.idUserFK);
    const activityId = decimalToInt(row[activityColumn]);
    if (userId == null || activityId == null) {
      skipped += 1;
      return;
    }
    const person = userIdToPerson.get(userId);
    const seed = seeds.get(activityId);
    if (!person || !seed) {
      skipped += 1;
      return;
    }
    const legacyId = normalizeIdPart(row.id);
    const rowKey = `${PREFIX}attendance-${sourceKind}-${legacyId || `${userId}-${seed.id}`}`;
    const pairKey = `${userId}\u0000${seed.id}`;
    rowsByPair.set(pairKey, {
      key: rowKey,
      eventId: seed.id,
      person,
      attendedAt: (seed.startDate ?? fallbackNow).toISOString(),
    });
  };
  lectureRows.forEach((row) => add(row, 'idLectureFK', 'lecture', lectureSeeds));
  shortcourseRows.forEach((row) => add(row, 'idShortcourseFK', 'shortcourse', shortcourseSeeds));
  return {
    eventAttendances: [...rowsByPair.values()].sort((left, right) =>
      `${left.eventId}\u0000${left.key}`.localeCompare(`${right.eventId}\u0000${right.key}`),
    ),
    skippedAttendances: skipped,
  };
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
