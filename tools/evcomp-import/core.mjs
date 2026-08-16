import { createHash, randomBytes } from 'node:crypto';

export function createUuidV7(now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 || now > 0xffffffffffff) {
    throw new Error('UUIDv7 timestamp must be a non-negative 48-bit integer.');
  }
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = 0x70 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function normalizeAcademicId(value) {
  return value == null ? '' : String(value).replace(/\s+/g, '').toUpperCase();
}

export function normalizeName(value) {
  return typeof value === 'string'
    ? value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

export function toSourceBoolean(value) {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw new Error(`Unexpected EvComp boolean value: ${String(value)}`);
}

export function resolvePerson(sourcePerson, targetPeople) {
  const sourceAcademicId = normalizeAcademicId(sourcePerson.academicId);
  const sourceEmail = normalizeEmail(sourcePerson.email);

  const academicMatches = sourceAcademicId
    ? targetPeople.filter((person) => normalizeAcademicId(person.academicId) === sourceAcademicId)
    : [];
  const emailMatches = sourceEmail
    ? targetPeople.filter((person) =>
        [person.email, ...(person.secondaryEmails ?? [])].some((email) => normalizeEmail(email) === sourceEmail),
      )
    : [];
  const identifierCandidates = [
    ...new Map([...academicMatches, ...emailMatches].map((item) => [item.id, item])).values(),
  ];
  if (academicMatches.length > 1 || emailMatches.length > 1) {
    return { status: 'ambiguous', candidates: identifierCandidates, matchedBy: 'identifier' };
  }
  if (academicMatches.length === 1 && emailMatches.length === 1 && academicMatches[0].id !== emailMatches[0].id) {
    return { status: 'conflict', candidates: identifierCandidates, matchedBy: 'identifier' };
  }
  if (emailMatches.length === 1) {
    return { status: 'matched', person: emailMatches[0], matchedBy: academicMatches.length ? 'email+academicId' : 'email' };
  }
  if (academicMatches.length === 1) {
    return { status: 'matched', person: academicMatches[0], matchedBy: 'academicId' };
  }

  const sourceName = normalizeName(sourcePerson.name);
  const nameCandidates = sourceName
    ? targetPeople.filter((person) => normalizeName(person.name) === sourceName)
    : [];
  return { status: 'unmatched', nameCandidates };
}

export function assertConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('Configuration must be a JSON object.');
  if (!Array.isArray(config.eventMappings) || !Array.isArray(config.activityMappings)) {
    throw new Error('Configuration must contain eventMappings and activityMappings arrays.');
  }

  const sourceEventIds = new Set();
  for (const mapping of config.eventMappings) {
    requireValue(mapping.sourceEventId, 'eventMappings[].sourceEventId');
    requireUuid(mapping.targetMajorEventId, 'eventMappings[].targetMajorEventId');
    const key = String(mapping.sourceEventId);
    if (sourceEventIds.has(key)) throw new Error(`Duplicate source event mapping: ${key}`);
    sourceEventIds.add(key);
  }

  const sourceActivityIds = new Set();
  for (const mapping of config.activityMappings) {
    requireValue(mapping.sourceActivityId, 'activityMappings[].sourceActivityId');
    requireUuid(mapping.targetEventId, 'activityMappings[].targetEventId');
    const key = String(mapping.sourceActivityId);
    if (sourceActivityIds.has(key)) throw new Error(`Duplicate source activity mapping: ${key}`);
    sourceActivityIds.add(key);
  }

  const sourcePersonIds = new Set();
  for (const mapping of config.personMappings ?? []) {
    requireValue(mapping.sourcePersonId, 'personMappings[].sourcePersonId');
    requireUuid(mapping.targetPersonId, 'personMappings[].targetPersonId');
    const key = String(mapping.sourcePersonId);
    if (sourcePersonIds.has(key)) throw new Error(`Duplicate source person mapping: ${key}`);
    sourcePersonIds.add(key);
  }
}

export function configFingerprint(config) {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex').slice(0, 16);
}

export function quoteMysqlIdentifier(identifier) {
  if (typeof identifier !== 'string' || !/^[\p{L}\p{N}_]+$/u.test(identifier)) {
    throw new Error(`Unsafe MySQL identifier in source schema mapping: ${String(identifier)}`);
  }
  return `\`${identifier.replaceAll('`', '``')}\``;
}

function requireValue(value, path) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new Error(`Missing ${path}.`);
  }
}

function requireUuid(value, path) {
  requireValue(value, path);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${path} must be a UUID.`);
  }
}
