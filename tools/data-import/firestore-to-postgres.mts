#!/usr/bin/env node


import { readFileSync } from 'node:fs';
import process from 'node:process';
import { connectPostgres, databaseUrlFromOptions, isMain } from './lib/common.mts';
import { createUuidV5 } from './lib/ids.mts';

export const DEFAULT_UNKNOWN_EMOJI = '❔';

export type JsonRecord = Record<string, unknown>;
export type LegacyCollection = Record<string, unknown>;
export type DateLike = Date | number | string;

export type SubscriptionStatus =
  | 'WAITING_RECEIPT_UPLOAD'
  | 'RECEIPT_UNDER_REVIEW'
  | 'REJECTED_INVALID_RECEIPT'
  | 'REJECTED_NO_SLOTS'
  | 'REJECTED_SCHEDULE_CONFLICT'
  | 'REJECTED_GENERIC'
  | 'CONFIRMED'
  | 'CANCELED';
export type EventType = 'MINICURSO' | 'PALESTRA' | 'OTHER';
export type ContactType = 'EMAIL' | 'PHONE' | 'WHATSAPP' | 'OTHER';
export type PriceType = 'SINGLE' | 'TIERED';

export interface MajorEventRow {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  description: string | null;
  emoji: string;
  subscriptionStartDate: Date | null;
  subscriptionEndDate: Date | null;
  maxCoursesPerAttendee: number | null;
  maxLecturesPerAttendee: number | null;
  buttonText: string | null;
  buttonLink: string | null;
  contactInfo: string | null;
  contactType: ContactType | null;
  isPaymentRequired: boolean;
  additionalPaymentInfo: string | null;
  createdAt: Date;
  createdById: string | null;
  updatedAt: Date;
}

export interface PaymentInfoRow {
  id: string;
  bankName: string;
  agency: string;
  account: string;
  holder: string;
  document: string;
  majorEventId: string;
}

export interface MajorEventPriceRow {
  id: string;
  majorEventId: string;
  type: PriceType;
  createdAt: Date;
}

export interface PriceTierRow {
  id: string;
  priceId: string;
  name: string;
  value: number;
}

export interface EventGroupRow {
  id: string;
  name: string;
  emoji: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventRow {
  id: string;
  name: string;
  creditMinutes: number | null;
  startDate: Date;
  endDate: Date;
  type: EventType;
  emoji: string;
  description: string | null;
  shortDescription: string | null;
  latitude: number | null;
  longitude: number | null;
  locationDescription: string | null;
  majorEventId: string | null;
  eventGroupId: string | null;
  allowSubscription: boolean;
  slots: number | null;
  shouldIssueCertificate: boolean;
  shouldCollectAttendance: boolean;
  isOnlineAttendanceAllowed: boolean;
  onlineAttendanceCode: string | null;
  onlineAttendanceStartDate: Date | null;
  onlineAttendanceEndDate: Date | null;
  isPubliclyListed: boolean;
  youtubeCode: string | null;
  buttonText: string | null;
  buttonLink: string | null;
  createdAt: Date;
  createdById: string | null;
  updatedAt: Date;
}

export interface PersonRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  identityDocument: string | null;
  academicId: string | null;
  externalRef: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MajorEventSubscriptionRow {
  id: string;
  majorEventId: string;
  personId: string;
  amountPaid: number | null;
  paymentDate: Date | null;
  paymentTier: string | null;
  subscriptionStatus: SubscriptionStatus;
  createdAt: Date;
  createdById: string | null;
}

export interface EventGroupSubscriptionRow {
  id: string;
  eventGroupId: string;
  personId: string;
  createdAt: Date;
  createdById: string | null;
}

export interface EventSubscriptionRow {
  id: string;
  eventId: string;
  personId: string;
  eventGroupSubscriptionId: string | null;
  createdAt: Date;
  createdById: string | null;
}

export interface EventAttendanceRow {
  personId: string;
  eventId: string;
  attendedAt: Date;
  createdAt: Date;
  createdById: string | null;
}

export interface ImportPayload {
  majorEvents: MajorEventRow[];
  paymentInfos: PaymentInfoRow[];
  majorEventPrices: MajorEventPriceRow[];
  priceTiers: PriceTierRow[];
  eventGroups: EventGroupRow[];
  events: EventRow[];
  people: PersonRow[];
  majorEventSubscriptions: MajorEventSubscriptionRow[];
  eventGroupSubscriptions: EventGroupSubscriptionRow[];
  eventSubscriptions: EventSubscriptionRow[];
  eventAttendances: EventAttendanceRow[];
  unknownMajorEventRefs: number;
  skippedUserMajorEventRefs: number;
  skippedUserEventRefs: number;
  generatedFallbackPeople: number;
}

export interface ImportMappings {
  majorEventIds: Map<string, string>;
  eventIds: Map<string, string>;
  eventGroupIds: Map<string, string>;
  personIds: Map<string, string>;
}

export interface UuidGenerator {
  forSeed(seed: string): string;
}

export interface DatabaseQueryResult {
  rows?: readonly unknown[];
}

export interface DatabaseClient {
  query(text: string, parameters?: readonly unknown[]): Promise<DatabaseQueryResult | void>;
  end?: () => Promise<void>;
}

export interface FirestoreImportOptions {
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

export interface BuildPayloadOptions {
  now?: DateLike;
}

interface FirestoreCollections {
  rawMajorEvents: LegacyCollection;
  rawEvents: LegacyCollection;
  rawUsers: LegacyCollection;
}

interface MajorEventMapping {
  majorEvents: MajorEventRow[];
  paymentInfos: PaymentInfoRow[];
  majorEventPrices: MajorEventPriceRow[];
  priceTiers: PriceTierRow[];
  majorEventSubscriptions: MajorEventSubscriptionRow[];
  majorSubEventSeeds: Map<string, EventSubscriptionSeed>;
}

interface EventMapping {
  eventGroups: EventGroupRow[];
  events: EventRow[];
  unknownMajorEventRefs: number;
  eventSubscriptionSeeds: Map<string, EventSubscriptionSeed>;
  eventGroupSubscriptionSeeds: Map<string, EventGroupSubscriptionSeed>;
  eventGroupEventIds: Map<string, Set<string>>;
}

interface EventSubscriptionSeed {
  personId: string;
  eventId: string;
  createdAt: Date;
  createdById: string | null;
  eventGroupSubscriptionId: string | null;
}

interface EventGroupSubscriptionSeed {
  personId: string;
  eventGroupId: string;
  createdAt: Date;
  createdById: string | null;
}

interface AttendanceSeed {
  personId: string;
  eventId: string;
  createdAt: Date;
  createdById: string | null;
}

const SUBSCRIPTION_STATUSES = new Set([
  'WAITING_RECEIPT_UPLOAD',
  'RECEIPT_UNDER_REVIEW',
  'REJECTED_INVALID_RECEIPT',
  'REJECTED_NO_SLOTS',
  'REJECTED_SCHEDULE_CONFLICT',
  'REJECTED_GENERIC',
  'CONFIRMED',
  'CANCELED',
]);

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function sortedKeys(value: JsonRecord): string[] {
  return Object.keys(value).sort();
}

export function loadFirestoreExport(inputPath: string | URL): JsonRecord {
  const source: unknown = JSON.parse(readFileSync(inputPath, 'utf8'));
  if (!isRecord(source)) throw new Error('Expected Firestore export JSON to be an object.');
  return source;
}

function getCollections(source: JsonRecord): LegacyCollection {
  const collections = source.__collections__ ?? {};
  if (!isRecord(collections)) throw new Error("Expected '__collections__' to be an object.");
  return collections;
}

export function extractCollections(source: JsonRecord): FirestoreCollections {
  const collections = getCollections(source);
  const rawMajorEvents = collections.majorEvents ?? {};
  const rawEvents = collections.events ?? {};
  const rawUsers = collections.users ?? {};
  if (!isRecord(rawMajorEvents)) throw new Error("Expected '__collections__.majorEvents' to be an object.");
  if (!isRecord(rawEvents)) throw new Error("Expected '__collections__.events' to be an object.");
  if (!isRecord(rawUsers)) throw new Error("Expected '__collections__.users' to be an object.");
  return { rawMajorEvents, rawEvents, rawUsers };
}

export function coerceText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'boolean') text = value ? 'True' : 'False';
  else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else if (typeof value === 'bigint') text = value.toString();
  else return null;
  text = text.trim();
  return text || null;
}

export function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === 'bigint') {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : null;
  }
  if (typeof value !== 'string') return null;
  const stripped = value.trim();
  if (!stripped) return null;
  if (!/^[+-]?(?:\d+|(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?)$/.test(stripped)) return null;
  const number = Number(stripped);
  return Number.isFinite(number) ? Math.trunc(number) : null;
}

export function parseFloatValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = typeof value === 'number' ? value : typeof value === 'boolean' ? Number(value) : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

export function coerceBoolOrDefault(value: unknown, defaultValue: boolean): boolean {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return defaultValue;
  const lowered = value.trim().toLowerCase();
  if (['1', 'true', 't', 'yes', 'y'].includes(lowered)) return true;
  if (['0', 'false', 'f', 'no', 'n'].includes(lowered)) return false;
  return defaultValue;
}

export function coerceBool(value: unknown): boolean {
  return coerceBoolOrDefault(value, false);
}

export function normalizeIdentityDocument(rawIdentityDocument: unknown): string | null {
  const raw = coerceText(rawIdentityDocument);
  if (raw === null) return null;
  const normalized = [...raw].filter((character) => /\p{Nd}/u.test(character)).join('');
  return normalized || null;
}

export function normalizePhone(rawPhone: unknown): string | null {
  const raw = coerceText(rawPhone);
  if (raw === null) return null;
  let digits = [...raw].filter((character) => /\p{Nd}/u.test(character)).join('');
  if (!digits || [...digits].every((character) => character === '0')) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('55') && [12, 13].includes(digits.length)) return `+${digits}`;
  if ([10, 11].includes(digits.length)) return `+55${digits}`;
  return raw.trim().startsWith('+') && digits.length >= 8 ? `+${digits}` : null;
}

export function parseFirestoreTimestamp(value: unknown): Date | null {
  if (!isRecord(value) || value.__datatype__ !== 'timestamp' || !isRecord(value.value)) return null;
  const seconds = value.value._seconds;
  const nanoseconds = value.value._nanoseconds === undefined ? 0 : value.value._nanoseconds;
  if (seconds === null || seconds === undefined || nanoseconds === null || nanoseconds === undefined) return null;
  const secondsNumber = Number(seconds);
  const nanosecondsNumber = Number(nanoseconds);
  if (!Number.isFinite(secondsNumber) || !Number.isFinite(nanosecondsNumber)) return null;
  const date = new Date(Math.round((secondsNumber * 1000) + (nanosecondsNumber / 1_000_000)));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseEventIdFromReference(reference: unknown): string | null {
  if (!isRecord(reference) || reference.__datatype__ !== 'documentReference') return null;
  const refValue = coerceText(reference.value);
  if (refValue === null) return null;
  const parts = refValue.split('/');
  return parts.length >= 2 && parts[0] === 'events' ? parts[1] ?? null : null;
}

export function extractSubcollection(rawDoc: unknown, name: string): LegacyCollection {
  if (!isRecord(rawDoc) || !isRecord(rawDoc.__collections__)) return {};
  const collection = rawDoc.__collections__[name];
  return isRecord(collection) ? collection : {};
}

export function extractEventGroupName(eventGroup: unknown): string | null {
  return isRecord(eventGroup) ? coerceText(eventGroup.groupDisplayName) : null;
}

export function extractEventGroupEventIds(eventGroup: unknown): string[] {
  if (!isRecord(eventGroup)) return [];
  const rawIds = eventGroup.groupEventIDs || eventGroup.groupEventIds;
  if (!Array.isArray(rawIds)) return [];
  return rawIds
    .map((value) => coerceText(value))
    .filter((value): value is string => value !== null);
}

export function extractEventGroupMainEventId(eventGroup: unknown): string | null {
  return isRecord(eventGroup) ? coerceText(eventGroup.mainEventID || eventGroup.mainEventId) : null;
}

export function extractEmoji(rawDoc: unknown): string {
  if (!isRecord(rawDoc)) return DEFAULT_UNKNOWN_EMOJI;
  return coerceText(rawDoc.emoji) || coerceText(rawDoc.icon) || DEFAULT_UNKNOWN_EMOJI;
}

export function coerceTextFromDict(rawValue: unknown, key: string): string | null {
  return isRecord(rawValue) ? coerceText(rawValue[key]) : null;
}

export function parseCreditMinutes(rawHours: unknown): number | null {
  if (rawHours === null || rawHours === undefined) return null;
  const hours = typeof rawHours === 'number' ? rawHours : Number(String(rawHours));
  return Number.isFinite(hours) ? Math.trunc(hours * 60) : null;
}

export function mapSubscriptionStatus(rawStatus: unknown): SubscriptionStatus {
  if (typeof rawStatus === 'string') {
    const normalized = rawStatus.trim().toUpperCase();
    if (SUBSCRIPTION_STATUSES.has(normalized)) return normalized as SubscriptionStatus;
  }
  const status = parseInteger(rawStatus);
  switch (status) {
    case 0: return 'WAITING_RECEIPT_UPLOAD';
    case 1: return 'RECEIPT_UNDER_REVIEW';
    case 2: return 'CONFIRMED';
    case 3: return 'REJECTED_INVALID_RECEIPT';
    case 4: return 'REJECTED_NO_SLOTS';
    case 5: return 'REJECTED_SCHEDULE_CONFLICT';
    default: return 'REJECTED_GENERIC';
  }
}

export function mapEventType(rawType: unknown): EventType {
  const value = (coerceText(rawType) || '').toLowerCase();
  if (value === 'minicurso') return 'MINICURSO';
  if (value === 'palestra') return 'PALESTRA';
  return 'OTHER';
}

function utcNow(): Date {
  return new Date();
}

function pairKey(first: string, second: string): string {
  return JSON.stringify([first, second]);
}

function comparePair(left: { first: string; second: string }, right: { first: string; second: string }): number {
  if (left.first < right.first) return -1;
  if (left.first > right.first) return 1;
  if (left.second < right.second) return -1;
  if (left.second > right.second) return 1;
  return 0;
}

function sortedSeedValues<T extends { personId: string; eventId?: string; eventGroupId?: string }>(seedMap: Map<string, T>): T[] {
  return [...seedMap.values()].sort((left, right) => comparePair(
    { first: left.personId, second: left.eventId ?? left.eventGroupId ?? '' },
    { first: right.personId, second: right.eventId ?? right.eventGroupId ?? '' },
  ));
}

function earliestDate(left: Date, right: Date): Date {
  return left.getTime() <= right.getTime() ? left : right;
}

export class StableUuidGenerator {
  private readonly generatedBySeed = new Map<string, string>();

  forSeed(seed: string): string {
    const existing = this.generatedBySeed.get(seed);
    if (existing) return existing;
    const generated = createUuidV5(seed);
    this.generatedBySeed.set(seed, generated);
    return generated;
  }
}

export function parseFirestoreSource(input: JsonRecord | string | URL): JsonRecord {
  return typeof input === 'string' || input instanceof URL ? loadFirestoreExport(input) : input;
}

export function buildPayload(input: JsonRecord | string | URL, { now = utcNow() }: BuildPayloadOptions = {}): ImportPayload {
  const source = parseFirestoreSource(input);
  if (!isRecord(source)) throw new Error('Expected Firestore export JSON to be an object.');
  const { rawMajorEvents, rawEvents, rawUsers } = extractCollections(source);
  const fallbackNow = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  const idGenerator = new StableUuidGenerator();
  const mappings = {
    majorEventIds: new Map(sortedKeys(rawMajorEvents).map((legacyId) => [legacyId, idGenerator.forSeed(`major-event:${legacyId}`)])),
    eventIds: new Map(sortedKeys(rawEvents).map((legacyId) => [legacyId, idGenerator.forSeed(`event:${legacyId}`)])),
    eventGroupIds: new Map(),
    personIds: new Map(),
  };

  const peopleRowsById = new Map();
  buildPeopleFromUsers(rawUsers, mappings, peopleRowsById, idGenerator, fallbackNow);
  const initialPeopleCount = peopleRowsById.size;
  const major = mapMajorEvents(rawMajorEvents, mappings, peopleRowsById, idGenerator, fallbackNow);
  const events = mapEvents(rawEvents, mappings, peopleRowsById, idGenerator, fallbackNow);
  const majorSubscriptions = mergeMajorSubscriptionsFromUserRefs(
    rawUsers,
    mappings,
    peopleRowsById,
    idGenerator,
    major.majorEventSubscriptions,
    fallbackNow,
  );
  const subscriptions = mapEventSubscriptions(
    rawUsers,
    mappings,
    peopleRowsById,
    idGenerator,
    events.eventSubscriptionSeeds,
    major.majorSubEventSeeds,
    events.eventGroupSubscriptionSeeds,
    events.eventGroupEventIds,
    fallbackNow,
  );
  const eventAttendances = mapEventAttendances(rawEvents, mappings, peopleRowsById, idGenerator, fallbackNow);

  return {
    majorEvents: major.majorEvents,
    paymentInfos: major.paymentInfos,
    majorEventPrices: major.majorEventPrices,
    priceTiers: major.priceTiers,
    eventGroups: events.eventGroups,
    events: events.events,
    people: [...peopleRowsById.values()],
    majorEventSubscriptions: majorSubscriptions.rows,
    eventGroupSubscriptions: subscriptions.eventGroupSubscriptionRows,
    eventSubscriptions: subscriptions.eventSubscriptionRows,
    eventAttendances,
    unknownMajorEventRefs: events.unknownMajorEventRefs,
    skippedUserMajorEventRefs: majorSubscriptions.skippedRefs,
    skippedUserEventRefs: subscriptions.skippedUserEventRefs,
    generatedFallbackPeople: peopleRowsById.size - initialPeopleCount,
  };
}

export function buildPeopleFromUsers(
  rawUsers: LegacyCollection,
  mappings: ImportMappings,
  peopleRowsById: Map<string, PersonRow>,
  idGenerator: UuidGenerator,
  fallbackNow: Date,
): void {
  for (const userKey of sortedKeys(rawUsers)) {
    const rawUser = rawUsers[userKey];
    if (!isRecord(rawUser)) continue;
    const canonicalLegacyId = coerceText(rawUser.uid) || userKey;
    let personId = mappings.personIds.get(canonicalLegacyId);
    if (!personId) personId = idGenerator.forSeed(`person:${canonicalLegacyId}`);
    mappings.personIds.set(canonicalLegacyId, personId);
    mappings.personIds.set(userKey, personId);
    const existing = peopleRowsById.get(personId);
    if (!existing) {
      peopleRowsById.set(personId, {
        id: personId,
        name: coerceText(rawUser.fullName) || coerceText(rawUser.displayName) || coerceText(rawUser.email) || `Legacy User ${canonicalLegacyId}`,
        email: coerceText(rawUser.email),
        phone: normalizePhone(rawUser.phone),
        identityDocument: normalizeIdentityDocument(rawUser.cpf),
        academicId: coerceText(rawUser.academicID),
        externalRef: canonicalLegacyId,
        createdAt: fallbackNow,
        updatedAt: fallbackNow,
      });
      continue;
    }
    if (existing.email === null) existing.email = coerceText(rawUser.email);
    if (existing.phone === null) existing.phone = normalizePhone(rawUser.phone);
    if (existing.identityDocument === null) existing.identityDocument = normalizeIdentityDocument(rawUser.cpf);
    if (existing.academicId === null) existing.academicId = coerceText(rawUser.academicID);
  }
}

export function resolvePersonId(
  legacyPersonId: string,
  mappings: ImportMappings,
  peopleRowsById: Map<string, PersonRow>,
  idGenerator: UuidGenerator,
  fallbackNow: Date,
): string {
  const existing = mappings.personIds.get(legacyPersonId);
  if (existing) return existing;
  const generated = idGenerator.forSeed(`person-fallback:${legacyPersonId}`);
  mappings.personIds.set(legacyPersonId, generated);
  peopleRowsById.set(generated, {
    id: generated,
    name: `Legacy Person ${legacyPersonId}`,
    email: null,
    phone: null,
    identityDocument: null,
    academicId: null,
    externalRef: legacyPersonId,
    createdAt: fallbackNow,
    updatedAt: fallbackNow,
  });
  return generated;
}

export function resolveEventGroupId(groupName: string, mappings: ImportMappings, idGenerator: UuidGenerator): string {
  const existing = mappings.eventGroupIds.get(groupName);
  if (existing) return existing;
  const generated = idGenerator.forSeed(`event-group:${groupName}`);
  mappings.eventGroupIds.set(groupName, generated);
  return generated;
}

export function mapMajorEvents(
  rawMajorEvents: LegacyCollection,
  mappings: ImportMappings,
  peopleRowsById: Map<string, PersonRow>,
  idGenerator: UuidGenerator,
  fallbackNow: Date,
): MajorEventMapping {
  const majorEvents: MajorEventRow[] = [];
  const paymentInfos: PaymentInfoRow[] = [];
  const majorEventPrices: MajorEventPriceRow[] = [];
  const priceTiers: PriceTierRow[] = [];
  const majorEventSubscriptions: MajorEventSubscriptionRow[] = [];
  const majorSubEventSeeds = new Map<string, EventSubscriptionSeed>();
  const majorSubSeen = new Set<string>();

  for (const legacyMajorEventId of sortedKeys(rawMajorEvents)) {
    const rawMajorEvent = rawMajorEvents[legacyMajorEventId];
    if (!isRecord(rawMajorEvent)) continue;
    const majorEventId = mappings.majorEventIds.get(legacyMajorEventId);
    if (!majorEventId) continue;
    const name = coerceText(rawMajorEvent.name) || `Legacy Major Event ${legacyMajorEventId}`;
    const startDate = parseFirestoreTimestamp(rawMajorEvent.eventStartDate)
      || parseFirestoreTimestamp(rawMajorEvent.dateStart)
      || parseFirestoreTimestamp(rawMajorEvent.createdOn)
      || fallbackNow;
    const endDate = parseFirestoreTimestamp(rawMajorEvent.eventEndDate)
      || parseFirestoreTimestamp(rawMajorEvent.dateEnd)
      || startDate;
    const createdAt = parseFirestoreTimestamp(rawMajorEvent.createdOn) || fallbackNow;
    const [contactInfo, contactType] = mapContactInfo(rawMajorEvent.contactInfo);
    const paymentInfo = isRecord(rawMajorEvent.paymentInfo) ? rawMajorEvent.paymentInfo : {};
    const rawPrice = rawMajorEvent.price;
    const [majorEventPrice, eventPriceTiers] = buildMajorEventPriceRows(
      majorEventId,
      rawPrice,
      idGenerator,
      createdAt,
    );

    majorEvents.push({
      id: majorEventId,
      name,
      startDate,
      endDate,
      description: coerceText(rawMajorEvent.description),
      emoji: extractEmoji(rawMajorEvent),
      subscriptionStartDate: parseFirestoreTimestamp(rawMajorEvent.subscriptionStartDate),
      subscriptionEndDate: parseFirestoreTimestamp(rawMajorEvent.subscriptionEndDate),
      maxCoursesPerAttendee: parseInteger(rawMajorEvent.maxCourses),
      maxLecturesPerAttendee: parseInteger(rawMajorEvent.maxLectures),
      buttonText: coerceTextFromDict(rawMajorEvent.button, 'text'),
      buttonLink: coerceTextFromDict(rawMajorEvent.button, 'url'),
      contactInfo,
      contactType,
      isPaymentRequired: inferIsPaymentRequired(paymentInfo, rawPrice),
      additionalPaymentInfo: coerceText(paymentInfo.additionalPaymentInformation),
      createdAt,
      createdById: coerceText(rawMajorEvent.createdBy),
      updatedAt: fallbackNow,
    });

    const paymentRow = buildPaymentInfoRow(majorEventId, paymentInfo, idGenerator);
    if (paymentRow) paymentInfos.push(paymentRow);
    if (majorEventPrice) {
      majorEventPrices.push(majorEventPrice);
      priceTiers.push(...eventPriceTiers);
    }

    const rawSubscriptions = extractSubcollection(rawMajorEvent, 'subscriptions');
    for (const legacyPersonId of sortedKeys(rawSubscriptions)) {
      const rawSubscription = rawSubscriptions[legacyPersonId];
      if (!isRecord(rawSubscription)) continue;
      const personId = resolvePersonId(legacyPersonId, mappings, peopleRowsById, idGenerator, fallbackNow);
      const subscriptionKey = pairKey(personId, majorEventId);
      if (majorSubSeen.has(subscriptionKey)) continue;
      majorSubSeen.add(subscriptionKey);
      const payment = isRecord(rawSubscription.payment) ? rawSubscription.payment : {};
      const createdAtSub = parseFirestoreTimestamp(rawSubscription.time)
        || parseFirestoreTimestamp(payment.time)
        || fallbackNow;
      const paymentDate = parseFirestoreTimestamp(payment.validationTime)
        || parseFirestoreTimestamp(payment.validationDate)
        || parseFirestoreTimestamp(payment.time);
      const createdByIdSub = coerceText(payment.author);
      majorEventSubscriptions.push({
        id: idGenerator.forSeed(`major-event-subscription:${majorEventId}:${personId}`),
        majorEventId,
        personId,
        amountPaid: parseInteger(payment.price),
        paymentDate,
        paymentTier: coerceText(rawSubscription.subscriptionType),
        subscriptionStatus: mapSubscriptionStatus(payment.status),
        createdAt: createdAtSub,
        createdById: createdByIdSub,
      });

      if (Array.isArray(rawSubscription.subscribedToEvents)) {
        for (const legacyEventId of rawSubscription.subscribedToEvents) {
          const eventIdText = coerceText(legacyEventId);
          if (eventIdText === null) continue;
          const mappedEventId = mappings.eventIds.get(eventIdText);
          if (!mappedEventId) continue;
          upsertSeed(majorSubEventSeeds, personId, mappedEventId, createdAtSub, createdByIdSub);
        }
      }
    }
  }

  return { majorEvents, paymentInfos, majorEventPrices, priceTiers, majorEventSubscriptions, majorSubEventSeeds };
}

export function mergeMajorSubscriptionsFromUserRefs(
  rawUsers: LegacyCollection,
  mappings: ImportMappings,
  peopleRowsById: Map<string, PersonRow>,
  idGenerator: UuidGenerator,
  majorEventSubscriptions: MajorEventSubscriptionRow[],
  fallbackNow: Date,
): { rows: MajorEventSubscriptionRow[]; skippedRefs: number } {
  const seenPairs = new Set(majorEventSubscriptions.map((row) => pairKey(row.personId, row.majorEventId)));
  let skippedRefs = 0;
  for (const userKey of sortedKeys(rawUsers)) {
    const rawUser = rawUsers[userKey];
    if (!isRecord(rawUser)) continue;
    const personId = resolvePersonId(userKey, mappings, peopleRowsById, idGenerator, fallbackNow);
    const rawRefs = extractSubcollection(rawUser, 'majorEventSubscriptions');
    for (const legacyMajorEventId of sortedKeys(rawRefs)) {
      const rawRefDoc = rawRefs[legacyMajorEventId];
      if (!isRecord(rawRefDoc)) continue;
      const majorEventId = mappings.majorEventIds.get(legacyMajorEventId);
      if (!majorEventId) {
        skippedRefs += 1;
        continue;
      }
      const key = pairKey(personId, majorEventId);
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
      majorEventSubscriptions.push({
        id: idGenerator.forSeed(`major-event-subscription:${majorEventId}:${personId}`),
        majorEventId,
        personId,
        amountPaid: null,
        paymentDate: null,
        paymentTier: null,
        subscriptionStatus: 'WAITING_RECEIPT_UPLOAD',
        createdAt: fallbackNow,
        createdById: null,
      });
    }
  }
  return { rows: majorEventSubscriptions, skippedRefs };
}

export function mapEvents(
  rawEvents: LegacyCollection,
  mappings: ImportMappings,
  peopleRowsById: Map<string, PersonRow>,
  idGenerator: UuidGenerator,
  fallbackNow: Date,
): EventMapping {
  const events: EventRow[] = [];
  let unknownMajorEventRefs = 0;
  const eventSubscriptionSeeds = new Map<string, EventSubscriptionSeed>();
  const eventGroupSubscriptionSeeds = new Map<string, EventGroupSubscriptionSeed>();
  const eventGroupEventIds = new Map<string, Set<string>>();
  const eventGroupEmojis = new Map<string, string>();

  for (const legacyEventId of sortedKeys(rawEvents)) {
    const rawEvent = rawEvents[legacyEventId];
    if (!isRecord(rawEvent)) continue;
    const eventId = mappings.eventIds.get(legacyEventId);
    if (!eventId) continue;
    const name = coerceText(rawEvent.name) || `Legacy Event ${legacyEventId}`;
    const startDate = parseFirestoreTimestamp(rawEvent.eventStartDate)
      || parseFirestoreTimestamp(rawEvent.createdOn)
      || fallbackNow;
    const endDate = parseFirestoreTimestamp(rawEvent.eventEndDate) || startDate;
    const createdAt = parseFirestoreTimestamp(rawEvent.createdOn) || fallbackNow;

    const location = rawEvent.location;
    let latitude = null;
    let longitude = null;
    let locationDescription = null;
    if (isRecord(location)) {
      latitude = parseFloatValue(location.lat);
      longitude = parseFloatValue(location.lon);
      locationDescription = coerceText(location.description);
    }

    const legacyMajorEventRef = coerceText(rawEvent.inMajorEvent);
    let majorEventId = null;
    if (legacyMajorEventRef) {
      const mapped = mappings.majorEventIds.get(legacyMajorEventRef);
      if (mapped) majorEventId = mapped;
      else unknownMajorEventRefs += 1;
    }

    const eventGroupPayload = rawEvent.eventGroup;
    let eventGroupId = null;
    const eventGroupName = extractEventGroupName(eventGroupPayload);
    const mainEventId = extractEventGroupMainEventId(eventGroupPayload);
    const eventGroupEventIdList = extractEventGroupEventIds(eventGroupPayload);
    if (eventGroupName !== null) {
      eventGroupId = resolveEventGroupId(eventGroupName, mappings, idGenerator);
      const groupEventIds = eventGroupEventIds.get(eventGroupId) ?? new Set();
      groupEventIds.add(eventId);
      for (const legacyGroupEventId of eventGroupEventIdList) {
        const mappedEventId = mappings.eventIds.get(legacyGroupEventId);
        if (mappedEventId) groupEventIds.add(mappedEventId);
      }
      if (mainEventId !== null) {
        const mappedMainEventId = mappings.eventIds.get(mainEventId);
        if (mappedMainEventId) groupEventIds.add(mappedMainEventId);
        const mainEvent = rawEvents[mainEventId];
        if (isRecord(mainEvent)) eventGroupEmojis.set(eventGroupId, extractEmoji(mainEvent));
      }
      eventGroupEventIds.set(eventGroupId, groupEventIds);
    }

    const onlineAttendanceCode = coerceText(rawEvent.attendanceCode);
    const onlineAttendanceStart = parseFirestoreTimestamp(rawEvent.attendanceCollectionStart);
    const onlineAttendanceEnd = parseFirestoreTimestamp(rawEvent.attendanceCollectionEnd);
    const isOnlineAttendanceAllowed = Boolean(onlineAttendanceCode || onlineAttendanceStart || onlineAttendanceEnd);

    events.push({
      id: eventId,
      name,
      creditMinutes: parseCreditMinutes(rawEvent.creditHours),
      startDate,
      endDate,
      type: mapEventType(rawEvent.eventType),
      emoji: extractEmoji(rawEvent),
      description: coerceText(rawEvent.description),
      shortDescription: coerceText(rawEvent.shortDescription),
      latitude,
      longitude,
      locationDescription,
      majorEventId,
      eventGroupId,
      allowSubscription: coerceBool(rawEvent.allowSubscription),
      slots: parseInteger(rawEvent.slotsAvailable),
      shouldIssueCertificate: coerceBool(rawEvent.issueCertificate),
      shouldCollectAttendance: coerceBool(rawEvent.collectAttendance),
      isOnlineAttendanceAllowed,
      onlineAttendanceCode,
      onlineAttendanceStartDate: onlineAttendanceStart,
      onlineAttendanceEndDate: onlineAttendanceEnd,
      isPubliclyListed: true,
      youtubeCode: coerceText(rawEvent.youtubeCode),
      buttonText: coerceTextFromDict(rawEvent.button, 'text'),
      buttonLink: coerceTextFromDict(rawEvent.button, 'url'),
      createdAt,
      createdById: coerceText(rawEvent.createdBy),
      updatedAt: fallbackNow,
    });

    const isGroupMainEvent = eventGroupId !== null && mainEventId !== null && legacyEventId === mainEventId;
    const rawEventSubscriptions = extractSubcollection(rawEvent, 'subscriptions');
    for (const legacyPersonId of sortedKeys(rawEventSubscriptions)) {
      const rawSubscription = rawEventSubscriptions[legacyPersonId];
      if (!isRecord(rawSubscription)) continue;
      const personId = resolvePersonId(legacyPersonId, mappings, peopleRowsById, idGenerator, fallbackNow);
      const seedCreatedAt = parseFirestoreTimestamp(rawSubscription.time) || createdAt || fallbackNow;
      const createdById = coerceText(rawSubscription.author);
      if (isGroupMainEvent && eventGroupId !== null) {
        upsertGroupSeed(eventGroupSubscriptionSeeds, personId, eventGroupId, seedCreatedAt, createdById);
      } else {
        upsertEventSubscriptionSeed(eventSubscriptionSeeds, personId, eventId, seedCreatedAt, createdById, null);
      }
    }
  }

  const eventGroups = [...mappings.eventGroupIds.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([name, id]) => ({
      id,
      name,
      emoji: eventGroupEmojis.get(id) || DEFAULT_UNKNOWN_EMOJI,
      createdAt: fallbackNow,
      updatedAt: fallbackNow,
    }));

  return { eventGroups, events, unknownMajorEventRefs, eventSubscriptionSeeds, eventGroupSubscriptionSeeds, eventGroupEventIds };
}

export function mapEventSubscriptions(
  rawUsers: LegacyCollection,
  mappings: ImportMappings,
  peopleRowsById: Map<string, PersonRow>,
  idGenerator: UuidGenerator,
  eventSubscriptionSeedsFromEvents: Map<string, EventSubscriptionSeed>,
  majorSubEventSeeds: Map<string, EventSubscriptionSeed>,
  eventGroupSubscriptionSeeds: Map<string, EventGroupSubscriptionSeed>,
  eventGroupEventIds: Map<string, Set<string>>,
  fallbackNow: Date,
): {
  eventSubscriptionRows: EventSubscriptionRow[];
  eventGroupSubscriptionRows: EventGroupSubscriptionRow[];
  skippedUserEventRefs: number;
} {
  const eventSubscriptionSeeds = new Map(
    [...eventSubscriptionSeedsFromEvents.entries()].map(([key, seed]) => [key, { ...seed }]),
  );
  for (const seed of majorSubEventSeeds.values()) {
    upsertEventSubscriptionSeed(
      eventSubscriptionSeeds,
      seed.personId,
      seed.eventId,
      seed.createdAt,
      seed.createdById,
      null,
    );
  }

  let skippedUserEventRefs = 0;
  for (const userKey of sortedKeys(rawUsers)) {
    const rawUser = rawUsers[userKey];
    if (!isRecord(rawUser)) continue;
    const personId = resolvePersonId(userKey, mappings, peopleRowsById, idGenerator, fallbackNow);
    const rawRefs = extractSubcollection(rawUser, 'eventSubscriptions');
    for (const eventKey of sortedKeys(rawRefs)) {
      const rawRefDoc = rawRefs[eventKey];
      if (!isRecord(rawRefDoc)) continue;
      const legacyEventId = parseEventIdFromReference(rawRefDoc.reference) || eventKey;
      const eventId = mappings.eventIds.get(legacyEventId);
      if (!eventId) {
        skippedUserEventRefs += 1;
        continue;
      }
      upsertEventSubscriptionSeed(eventSubscriptionSeeds, personId, eventId, fallbackNow, null, null);
    }
  }

  const eventGroupSubscriptionRows: EventGroupSubscriptionRow[] = [];
  const eventGroupSubscriptionIds = new Map<string, string>();
  for (const seed of sortedSeedValues(eventGroupSubscriptionSeeds)) {
    const subscriptionId = idGenerator.forSeed(`event-group-subscription:${seed.eventGroupId}:${seed.personId}`);
    eventGroupSubscriptionIds.set(pairKey(seed.personId, seed.eventGroupId), subscriptionId);
    eventGroupSubscriptionRows.push({
      id: subscriptionId,
      eventGroupId: seed.eventGroupId,
      personId: seed.personId,
      createdAt: seed.createdAt,
      createdById: seed.createdById,
    });
  }

  for (const seed of sortedSeedValues(eventGroupSubscriptionSeeds)) {
    const subscriptionId = eventGroupSubscriptionIds.get(pairKey(seed.personId, seed.eventGroupId));
    if (!subscriptionId) continue;
    const eventIds = [...(eventGroupEventIds.get(seed.eventGroupId) ?? new Set())].sort();
    for (const eventId of eventIds) {
      upsertEventSubscriptionSeed(eventSubscriptionSeeds, seed.personId, eventId, seed.createdAt, seed.createdById, subscriptionId);
    }
  }

  const eventSubscriptionRows = sortedSeedValues(eventSubscriptionSeeds).map((seed) => ({
    id: idGenerator.forSeed(`event-subscription:${seed.eventId}:${seed.personId}`),
    eventId: seed.eventId,
    personId: seed.personId,
    eventGroupSubscriptionId: seed.eventGroupSubscriptionId,
    createdAt: seed.createdAt,
    createdById: seed.createdById,
  }));

  return { eventSubscriptionRows, eventGroupSubscriptionRows, skippedUserEventRefs };
}

export function mapEventAttendances(
  rawEvents: LegacyCollection,
  mappings: ImportMappings,
  peopleRowsById: Map<string, PersonRow>,
  idGenerator: UuidGenerator,
  fallbackNow: Date,
): EventAttendanceRow[] {
  const attendanceByPair = new Map<string, AttendanceSeed>();
  for (const legacyEventId of sortedKeys(rawEvents)) {
    const rawEvent = rawEvents[legacyEventId];
    if (!isRecord(rawEvent)) continue;
    const eventId = mappings.eventIds.get(legacyEventId);
    if (!eventId) continue;
    for (const collectionName of ['attendance', 'non-paying-attendance']) {
      const rawAttendance = extractSubcollection(rawEvent, collectionName);
      for (const legacyPersonId of sortedKeys(rawAttendance)) {
        const rawAttendanceDoc = rawAttendance[legacyPersonId];
        if (!isRecord(rawAttendanceDoc)) continue;
        const personId = resolvePersonId(legacyPersonId, mappings, peopleRowsById, idGenerator, fallbackNow);
        const attendedAt = parseFirestoreTimestamp(rawAttendanceDoc.time) || fallbackNow;
        upsertSeed(attendanceByPair, personId, eventId, attendedAt, coerceText(rawAttendanceDoc.author));
      }
    }
  }
  return sortedSeedValues(attendanceByPair).map((seed) => ({
    personId: seed.personId,
    eventId: seed.eventId,
    attendedAt: seed.createdAt,
    createdAt: seed.createdAt,
    createdById: seed.createdById,
  }));
}

function upsertSeed(
  seedMap: Map<string, AttendanceSeed | EventSubscriptionSeed>,
  personId: string,
  eventId: string,
  createdAt: Date,
  createdById: string | null,
): void {
  const key = pairKey(personId, eventId);
  const existing = seedMap.get(key);
  if (!existing) {
    seedMap.set(key, { personId, eventId, createdAt, createdById });
    return;
  }
  existing.createdAt = earliestDate(existing.createdAt, createdAt);
  if (existing.createdById === null && createdById !== null) existing.createdById = createdById;
}

function upsertGroupSeed(
  seedMap: Map<string, EventGroupSubscriptionSeed>,
  personId: string,
  eventGroupId: string,
  createdAt: Date,
  createdById: string | null,
): void {
  const key = pairKey(personId, eventGroupId);
  const existing = seedMap.get(key);
  if (!existing) {
    seedMap.set(key, { personId, eventGroupId, createdAt, createdById });
    return;
  }
  existing.createdAt = earliestDate(existing.createdAt, createdAt);
  if (existing.createdById === null && createdById !== null) existing.createdById = createdById;
}

function upsertEventSubscriptionSeed(
  seedMap: Map<string, EventSubscriptionSeed>,
  personId: string,
  eventId: string,
  createdAt: Date,
  createdById: string | null,
  eventGroupSubscriptionId: string | null,
): void {
  const key = pairKey(personId, eventId);
  const existing = seedMap.get(key);
  if (!existing) {
    seedMap.set(key, { personId, eventId, createdAt, createdById, eventGroupSubscriptionId });
    return;
  }
  existing.createdAt = earliestDate(existing.createdAt, createdAt);
  if (existing.createdById === null && createdById !== null) existing.createdById = createdById;
  if (existing.eventGroupSubscriptionId === null && eventGroupSubscriptionId !== null) {
    existing.eventGroupSubscriptionId = eventGroupSubscriptionId;
  }
}

export function buildPaymentInfoRow(
  majorEventId: string,
  paymentInfo: unknown,
  idGenerator: UuidGenerator,
): PaymentInfoRow | null {
  if (!isRecord(paymentInfo) || Object.keys(paymentInfo).length === 0) return null;
  const bankName = coerceText(paymentInfo.bankName);
  const agency = coerceText(paymentInfo.agency);
  const account = coerceText(paymentInfo.accountNumber) || coerceText(paymentInfo.account);
  const holder = coerceText(paymentInfo.name) || coerceText(paymentInfo.holder);
  const document = coerceText(paymentInfo.document);
  if (bankName === null || agency === null || account === null || holder === null || document === null) return null;
  return {
    id: idGenerator.forSeed(`payment-info:${majorEventId}`),
    bankName,
    agency,
    account,
    holder,
    document,
    majorEventId,
  };
}

export function buildMajorEventPriceRows(
  majorEventId: string,
  rawPrice: unknown,
  idGenerator: UuidGenerator,
  createdAt: Date,
): [MajorEventPriceRow | null, PriceTierRow[]] {
  let singlePrice = parseInteger(rawPrice);
  const tiers: Array<{ name: string; value: number }> = [];
  let priceType: PriceType = 'SINGLE';
  if (isRecord(rawPrice)) {
    singlePrice = parseInteger(rawPrice.single);
    if (Array.isArray(rawPrice.tiers)) {
      rawPrice.tiers.forEach((rawTier, index) => {
        if (!isRecord(rawTier)) return;
        const value = parseInteger(rawTier.price);
        if (value === null) return;
        const tierName = coerceText(rawTier.name) || coerceText(rawTier.title) || `Faixa ${index + 1}`;
        tiers.push({ name: tierName, value });
      });
    }
    if (tiers.length > 0) priceType = 'TIERED';
  }
  if (tiers.length === 0) {
    if (singlePrice === null) return [null, []];
    tiers.push({ name: 'Valor único', value: singlePrice });
  }
  const priceId = idGenerator.forSeed(`major-event-price:${majorEventId}`);
  const priceRow = { id: priceId, majorEventId, type: priceType, createdAt };
  const tierRows = tiers.map((tier, index) => ({
    id: idGenerator.forSeed(`price-tier:${majorEventId}:${index}:${tier.name}:${tier.value}`),
    priceId,
    name: tier.name,
    value: tier.value,
  }));
  return [priceRow, tierRows];
}

export function inferIsPaymentRequired(paymentInfo: unknown, price: unknown): boolean {
  if (isRecord(paymentInfo) && Object.keys(paymentInfo).length > 0) return true;
  const scalarPrice = parseInteger(price);
  if (scalarPrice !== null) return scalarPrice > 0;
  if (isRecord(price)) {
    const singlePrice = parseInteger(price.single);
    if (singlePrice !== null) return singlePrice > 0;
    if (Array.isArray(price.tiers)) return price.tiers.some((tier) => isRecord(tier) && (parseInteger(tier.price) || 0) > 0);
  }
  return false;
}

export function mapContactInfo(rawContactInfo: unknown): [string | null, ContactType | null] {
  if (isRecord(rawContactInfo)) {
    const email = coerceText(rawContactInfo.email);
    if (email) return [email, 'EMAIL'];
    const phone = coerceText(rawContactInfo.phone);
    if (phone) return [phone, 'PHONE'];
    const whatsapp = coerceText(rawContactInfo.whatsapp);
    if (whatsapp) return [whatsapp, 'WHATSAPP'];
    for (const value of Object.values(rawContactInfo)) {
      const text = coerceText(value);
      if (text) return [text, 'OTHER'];
    }
    return [null, null];
  }
  const text = coerceText(rawContactInfo);
  return text === null ? [null, null] : [text, 'OTHER'];
}

async function executeMany<T>(
  client: DatabaseClient,
  text: string,
  rows: readonly T[],
  valuesForRow: (row: T) => readonly unknown[],
): Promise<void> {
  for (const row of rows) await client.query(text, valuesForRow(row));
}

export async function writePayload(databaseOrClient: string | DatabaseClient, payload: ImportPayload): Promise<void> {
  let client: DatabaseClient;
  let ownsClient = false;
  if (typeof databaseOrClient === 'string') {
    client = await connectPostgres(databaseOrClient) as unknown as DatabaseClient;
    ownsClient = true;
  } else {
    client = databaseOrClient;
  }
  await client.query('BEGIN');
  try {
    await executeMany(client, `
      INSERT INTO major_events (
        id, name, "startDate", "endDate", description, emoji,
        "subscriptionStartDate", "subscriptionEndDate",
        "maxCoursesPerAttendee", "maxLecturesPerAttendee",
        "buttonText", "buttonLink", "contactInfo", "contactType",
        "isPaymentRequired", "additionalPaymentInfo",
        "createdAt", "createdById", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, "startDate"=EXCLUDED."startDate", "endDate"=EXCLUDED."endDate",
        description=EXCLUDED.description, emoji=EXCLUDED.emoji,
        "subscriptionStartDate"=EXCLUDED."subscriptionStartDate",
        "subscriptionEndDate"=EXCLUDED."subscriptionEndDate",
        "maxCoursesPerAttendee"=EXCLUDED."maxCoursesPerAttendee",
        "maxLecturesPerAttendee"=EXCLUDED."maxLecturesPerAttendee",
        "buttonText"=EXCLUDED."buttonText", "buttonLink"=EXCLUDED."buttonLink",
        "contactInfo"=EXCLUDED."contactInfo", "contactType"=EXCLUDED."contactType",
        "isPaymentRequired"=EXCLUDED."isPaymentRequired",
        "additionalPaymentInfo"=EXCLUDED."additionalPaymentInfo",
        "createdById"=EXCLUDED."createdById", "updatedAt"=EXCLUDED."updatedAt"
    `, payload.majorEvents, (row) => [
      row.id, row.name, row.startDate, row.endDate, row.description, row.emoji,
      row.subscriptionStartDate, row.subscriptionEndDate, row.maxCoursesPerAttendee,
      row.maxLecturesPerAttendee, row.buttonText, row.buttonLink, row.contactInfo,
      row.contactType, row.isPaymentRequired, row.additionalPaymentInfo, row.createdAt,
      row.createdById, row.updatedAt,
    ]);

    await executeMany(client, `
      INSERT INTO payment_info (id, "bankName", agency, account, holder, document, "majorEventId")
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT ("majorEventId") DO UPDATE SET
        "bankName"=EXCLUDED."bankName", agency=EXCLUDED.agency, account=EXCLUDED.account,
        holder=EXCLUDED.holder, document=EXCLUDED.document
    `, payload.paymentInfos, (row) => [row.id, row.bankName, row.agency, row.account, row.holder, row.document, row.majorEventId]);

    if (payload.majorEventPrices.length > 0) {
      await client.query(`
        DELETE FROM price_tiers
        WHERE "priceId" IN (
          SELECT id FROM major_event_prices WHERE "majorEventId" = ANY($1::text[])
        )
      `, [payload.majorEventPrices.map((row) => row.majorEventId)]);
    }

    await executeMany(client, `
      INSERT INTO major_event_prices (id, "majorEventId", type, "createdAt")
      VALUES ($1,$2,$3,$4)
      ON CONFLICT ("majorEventId") DO UPDATE SET
        id=EXCLUDED.id, type=EXCLUDED.type, "createdAt"=EXCLUDED."createdAt"
    `, payload.majorEventPrices, (row) => [row.id, row.majorEventId, row.type, row.createdAt]);

    await executeMany(client, `
      INSERT INTO price_tiers (id, "priceId", name, value)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (id) DO UPDATE SET
        "priceId"=EXCLUDED."priceId", name=EXCLUDED.name, value=EXCLUDED.value
    `, payload.priceTiers, (row) => [row.id, row.priceId, row.name, row.value]);

    await executeMany(client, `
      INSERT INTO event_groups (id, name, emoji, "createdAt", "updatedAt")
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, emoji=EXCLUDED.emoji, "updatedAt"=EXCLUDED."updatedAt"
    `, payload.eventGroups, (row) => [row.id, row.name, row.emoji, row.createdAt, row.updatedAt]);

    await executeMany(client, `
      INSERT INTO events (
        id, name, "creditMinutes", "startDate", "endDate", type, emoji,
        description, "shortDescription", latitude, longitude, "locationDescription",
        "majorEventId", "eventGroupId", "allowSubscription", slots,
        "shouldIssueCertificate", "shouldCollectAttendance", "isOnlineAttendanceAllowed",
        "onlineAttendanceCode", "onlineAttendanceStartDate", "onlineAttendanceEndDate",
        "isPubliclyListed", "youtubeCode", "buttonText", "buttonLink",
        "createdAt", "createdById", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, "creditMinutes"=EXCLUDED."creditMinutes",
        "startDate"=EXCLUDED."startDate", "endDate"=EXCLUDED."endDate", type=EXCLUDED.type,
        emoji=EXCLUDED.emoji, description=EXCLUDED.description,
        "shortDescription"=EXCLUDED."shortDescription", latitude=EXCLUDED.latitude,
        longitude=EXCLUDED.longitude, "locationDescription"=EXCLUDED."locationDescription",
        "majorEventId"=EXCLUDED."majorEventId", "eventGroupId"=EXCLUDED."eventGroupId",
        "allowSubscription"=EXCLUDED."allowSubscription", slots=EXCLUDED.slots,
        "shouldIssueCertificate"=EXCLUDED."shouldIssueCertificate",
        "shouldCollectAttendance"=EXCLUDED."shouldCollectAttendance",
        "isOnlineAttendanceAllowed"=EXCLUDED."isOnlineAttendanceAllowed",
        "onlineAttendanceCode"=EXCLUDED."onlineAttendanceCode",
        "onlineAttendanceStartDate"=EXCLUDED."onlineAttendanceStartDate",
        "onlineAttendanceEndDate"=EXCLUDED."onlineAttendanceEndDate",
        "isPubliclyListed"=EXCLUDED."isPubliclyListed", "youtubeCode"=EXCLUDED."youtubeCode",
        "buttonText"=EXCLUDED."buttonText", "buttonLink"=EXCLUDED."buttonLink",
        "createdById"=EXCLUDED."createdById", "updatedAt"=EXCLUDED."updatedAt"
    `, payload.events, (row) => [
      row.id, row.name, row.creditMinutes, row.startDate, row.endDate, row.type, row.emoji,
      row.description, row.shortDescription, row.latitude, row.longitude, row.locationDescription,
      row.majorEventId, row.eventGroupId, row.allowSubscription, row.slots,
      row.shouldIssueCertificate, row.shouldCollectAttendance, row.isOnlineAttendanceAllowed,
      row.onlineAttendanceCode, row.onlineAttendanceStartDate, row.onlineAttendanceEndDate,
      row.isPubliclyListed, row.youtubeCode, row.buttonText, row.buttonLink, row.createdAt,
      row.createdById, row.updatedAt,
    ]);

    await executeMany(client, `
      INSERT INTO people (
        id, name, email, phone, "identityDocument", "academicId", "externalRef", "createdAt", "updatedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone,
        "identityDocument"=EXCLUDED."identityDocument", "academicId"=EXCLUDED."academicId",
        "externalRef"=EXCLUDED."externalRef", "updatedAt"=EXCLUDED."updatedAt"
    `, payload.people, (row) => [
      row.id, row.name, row.email, row.phone, row.identityDocument, row.academicId,
      row.externalRef, row.createdAt, row.updatedAt,
    ]);

    await executeMany(client, `
      INSERT INTO major_event_subscriptions (
        id, "majorEventId", "personId", "amountPaid", "paymentDate", "paymentTier",
        "subscriptionStatus", "createdAt", "createdById"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        "majorEventId"=EXCLUDED."majorEventId", "personId"=EXCLUDED."personId",
        "amountPaid"=EXCLUDED."amountPaid", "paymentDate"=EXCLUDED."paymentDate",
        "paymentTier"=EXCLUDED."paymentTier", "subscriptionStatus"=EXCLUDED."subscriptionStatus",
        "createdAt"=EXCLUDED."createdAt", "createdById"=EXCLUDED."createdById"
    `, payload.majorEventSubscriptions, (row) => [
      row.id, row.majorEventId, row.personId, row.amountPaid, row.paymentDate,
      row.paymentTier, row.subscriptionStatus, row.createdAt, row.createdById,
    ]);

    await executeMany(client, `
      INSERT INTO event_group_subscriptions (id, "eventGroupId", "personId", "createdAt", "createdById")
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO UPDATE SET
        "eventGroupId"=EXCLUDED."eventGroupId", "personId"=EXCLUDED."personId",
        "createdAt"=EXCLUDED."createdAt", "createdById"=EXCLUDED."createdById"
    `, payload.eventGroupSubscriptions, (row) => [row.id, row.eventGroupId, row.personId, row.createdAt, row.createdById]);

    await executeMany(client, `
      INSERT INTO event_subscriptions (id, "eventId", "personId", "eventGroupSubscriptionId", "createdAt", "createdById")
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO UPDATE SET
        "eventId"=EXCLUDED."eventId", "personId"=EXCLUDED."personId",
        "eventGroupSubscriptionId"=EXCLUDED."eventGroupSubscriptionId",
        "createdAt"=EXCLUDED."createdAt", "createdById"=EXCLUDED."createdById"
    `, payload.eventSubscriptions, (row) => [
      row.id, row.eventId, row.personId, row.eventGroupSubscriptionId, row.createdAt, row.createdById,
    ]);

    await executeMany(client, `
      INSERT INTO event_attendances ("personId", "eventId", "attendedAt", "createdAt", "createdById")
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT ("personId", "eventId") DO UPDATE SET
        "attendedAt"=EXCLUDED."attendedAt", "createdAt"=EXCLUDED."createdAt",
        "createdById"=EXCLUDED."createdById"
    `, payload.eventAttendances, (row) => [row.personId, row.eventId, row.attendedAt, row.createdAt, row.createdById]);

    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original database error.
    }
    throw error;
  } finally {
    if (ownsClient && client.end) await client.end();
  }
}

function parseOptionValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value.`);
  return value;
}

export function parseArgs(argv: readonly string[] = process.argv.slice(2)): FirestoreImportOptions {
  const options: FirestoreImportOptions = {
    input: 'import/file.json',
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
    if (argument === undefined) break;
    if (argument === '--dry-run') {
      options.dryRun = true;
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
      default: throw new Error(`Unknown option: ${argument}`);
    }
  }
  return options;
}

function printPreparedRows(payload: ImportPayload): void {
  console.log(
    'Prepared rows -> '
      + `major_events=${payload.majorEvents.length}, `
      + `payment_infos=${payload.paymentInfos.length}, `
      + `major_event_prices=${payload.majorEventPrices.length}, `
      + `price_tiers=${payload.priceTiers.length}, `
      + `event_groups=${payload.eventGroups.length}, `
      + `events=${payload.events.length}, `
      + `people=${payload.people.length}, `
      + `major_event_subscriptions=${payload.majorEventSubscriptions.length}, `
      + `event_group_subscriptions=${payload.eventGroupSubscriptions.length}, `
      + `event_subscriptions=${payload.eventSubscriptions.length}, `
      + `event_attendances=${payload.eventAttendances.length}, `
      + `generated_fallback_people=${payload.generatedFallbackPeople}, `
      + `events_with_unknown_major_ref=${payload.unknownMajorEventRefs}, `
      + `skipped_user_major_event_refs=${payload.skippedUserMajorEventRefs}, `
      + `skipped_user_event_refs=${payload.skippedUserEventRefs}`,
  );
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    console.log('Usage: bun run data-import -- firestore-to-postgres [--input PATH] [--dry-run] [database options]');
    return;
  }
  const payload = buildPayload(options.input);
  printPreparedRows(payload);
  if (options.dryRun) {
    console.log('Dry run enabled. No database changes were made.');
    return;
  }
  await writePayload(databaseUrlFromOptions(options), payload);
  console.log('Import completed.');
}

if (isMain(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
