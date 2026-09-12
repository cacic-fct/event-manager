import { createUuidV7, normalizeAcademicId, normalizeEmail, resolvePerson } from './core.mjs';
import { getImportedTarget, recordImportedTarget } from './provenance.mjs';

const IMPORT_ENTITY_TYPE = 'person';

/**
 * Resolve EvComp people against active target records and, when applying an
 * import, create a target record for a person with a reliable identifier that
 * has no safe match. The caller owns the surrounding transaction.
 */
export async function resolveImportPeople(
  target,
  sourcePeople,
  explicitMappings,
  { apply = false, sourceNamespace = 'evcomp', actorId = null } = {},
) {
  const uniqueSourcePeople = uniquePeopleBySourceId(sourcePeople);
  const normalizedNamespace = normalizeSourceNamespace(sourceNamespace);
  const explicitPersonMappings = normalizeMappings(explicitMappings);
  const provenanceBySourceId = new Map();
  const provenanceTargetIds = new Set();

  for (const sourcePerson of uniqueSourcePeople) {
    const sourceId = sourceIdOf(sourcePerson);
    if (sourceId == null) continue;
    const targetId = await getImportedTarget(target, normalizedNamespace, IMPORT_ENTITY_TYPE, sourceId);
    if (targetId == null) continue;
    const normalizedTargetId = String(targetId);
    provenanceBySourceId.set(sourceId, normalizedTargetId);
    provenanceTargetIds.add(normalizedTargetId);
  }

  if (uniqueSourcePeople.length === 0) {
    return { resolutions: new Map(), counters: emptyCounters() };
  }

  const targetPeople = await findTargetPeople(target, uniqueSourcePeople, [
    ...new Set([...explicitPersonMappings.values(), ...provenanceTargetIds]),
  ]);
  const targetPeopleById = new Map(targetPeople.map((person) => [person.id, person]));
  const persistedPeople = provenanceTargetIds.size ? await findPeopleByIds(target, [...provenanceTargetIds]) : [];
  const persistedPeopleById = new Map(persistedPeople.map((person) => [person.id, person]));
  const candidatePeople = [...targetPeople];
  const resolutions = new Map();
  const counters = emptyCounters();

  for (const sourcePerson of uniqueSourcePeople) {
    const sourceId = sourceIdOf(sourcePerson);
    const sourceKey = sourceId ?? String(sourcePerson.sourceId);
    const explicitTargetId = explicitPersonMappings.get(sourceKey);
    let resolution;

    if (explicitTargetId !== undefined) {
      const provenanceTargetId = provenanceBySourceId.get(sourceKey);
      const explicitPerson = targetPeopleById.get(explicitTargetId);
      if (!explicitPerson) {
        throw new Error(`Mapped target person does not exist, is deleted, or is merged: ${explicitTargetId}`);
      }
      if (provenanceTargetId && provenanceTargetId !== explicitTargetId) {
        resolution = {
          status: 'conflict',
          reason: 'provenance_mapping_conflict',
          candidates: [explicitPerson, persistedPeopleById.get(provenanceTargetId)].filter(Boolean),
        };
      } else {
        resolution = { status: 'matched', person: explicitPerson, matchedBy: 'explicitMapping' };
      }
    } else {
      const provenanceTargetId = provenanceBySourceId.get(sourceKey);
      const persistedPerson = provenanceTargetId ? persistedPeopleById.get(provenanceTargetId) : undefined;
      if (provenanceTargetId && !isActivePerson(persistedPerson)) {
        resolution = {
          status: 'unmatched',
          reason: 'stale_import_mapping',
          sourceTargetId: provenanceTargetId,
          candidates: [],
        };
      } else if (persistedPerson) {
        resolution = resolvePersistedPerson(sourcePerson, persistedPerson, candidatePeople);
      } else {
        resolution = resolvePerson(sourcePerson, candidatePeople);
      }

      if (
        resolution.status === 'unmatched' &&
        resolution.reason !== 'stale_import_mapping' &&
        hasReliableIdentifier(sourcePerson)
      ) {
        if (hasUsableName(sourcePerson)) {
          const plannedPerson = buildPersonRecord(sourcePerson, createUuidV7(), actorId);
          const person = apply ? await createPerson(target, plannedPerson) : plannedPerson;
          candidatePeople.push(person);
          targetPeopleById.set(person.id, person);
          resolution = { status: 'matched', person, matchedBy: apply ? 'created' : 'planned' };
          if (apply) counters.created += 1;
        } else {
          resolution = { ...resolution, reason: 'missing_name', canCreate: false };
        }
      }
    }

    if (resolution.status !== 'matched' && !resolution.reason) {
      const defaultReason =
        {
          ambiguous: 'ambiguous_person',
          conflict: 'conflicting_person_identifiers',
          unmatched: 'unmatched_person',
        }[resolution.status] ?? resolution.status;
      resolution = { ...resolution, reason: defaultReason };
    }
    resolutions.set(sourceKey, resolution);
    if (resolution.status === 'matched' && !['created', 'planned'].includes(resolution.matchedBy)) {
      counters.reused += 1;
    } else if (resolution.status === 'matched' && resolution.matchedBy === 'planned') {
      counters.planned += 1;
    } else if (resolution.status !== 'matched') {
      counters.unresolved += 1;
    }

    if (
      resolution.status === 'matched' &&
      sourceId != null &&
      apply &&
      provenanceBySourceId.get(sourceId) !== resolution.person.id
    ) {
      await recordImportedTarget(
        target,
        normalizedNamespace,
        IMPORT_ENTITY_TYPE,
        sourceId,
        resolution.person.id,
        actorId,
      );
    }
  }

  return { resolutions, counters };
}

function resolvePersistedPerson(sourcePerson, persistedPerson, candidatePeople) {
  const candidates = candidatePeople.some((person) => person.id === persistedPerson.id)
    ? candidatePeople
    : [...candidatePeople, persistedPerson];
  const resolution = resolvePerson(sourcePerson, candidates);
  if (resolution.status === 'matched' && resolution.person.id === persistedPerson.id) {
    return { status: 'matched', person: persistedPerson, matchedBy: 'provenance' };
  }
  if (resolution.status === 'unmatched' && sourceIdentifiersAgree(sourcePerson, persistedPerson)) {
    return { status: 'matched', person: persistedPerson, matchedBy: 'provenance' };
  }

  return {
    ...resolution,
    status: resolution.status === 'ambiguous' ? 'ambiguous' : 'conflict',
    reason: 'provenance_identity_conflict',
    candidates: [
      ...new Map([...(resolution.candidates ?? []), persistedPerson].map((person) => [person.id, person])).values(),
    ],
  };
}

function sourceIdentifiersAgree(sourcePerson, targetPerson) {
  const sourceAcademicId = normalizeAcademicId(sourcePerson.academicId);
  const targetAcademicId = normalizeAcademicId(targetPerson.academicId);
  if (sourceAcademicId && targetAcademicId && sourceAcademicId !== targetAcademicId) {
    return false;
  }

  const sourceEmail = normalizeEmail(sourcePerson.email);
  const targetEmails = [targetPerson.email, ...(targetPerson.secondaryEmails ?? [])]
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
  if (sourceEmail && targetEmails.length > 0 && !targetEmails.includes(sourceEmail)) {
    return false;
  }

  return true;
}

async function createPerson(target, person) {
  const result = await target.query(
    `INSERT INTO people (id, name, email, "academicId", "secondaryEmails", "createdById", "updatedAt")
     VALUES ($1,$2,$3,$4,ARRAY[]::text[],$5,NOW())
     RETURNING id, name, email, "secondaryEmails", "academicId"`,
    [person.id, person.name, person.email, person.academicId, person.createdById],
  );
  if (!result.rowCount || !result.rows?.[0]) {
    throw new Error(`Target person creation returned no row for ${person.id}.`);
  }
  return result.rows[0];
}

function buildPersonRecord(sourcePerson, id, actorId = null) {
  return {
    id,
    name: String(sourcePerson.name ?? '')
      .trim()
      .replace(/\s+/g, ' '),
    email: normalizeEmail(sourcePerson.email) || null,
    academicId: sourcePerson.academicId == null ? null : String(sourcePerson.academicId).trim() || null,
    createdById: actorId,
    secondaryEmails: [],
  };
}

async function findTargetPeople(target, sourcePeople, explicitIds) {
  const academicIds = sourcePeople.map((person) => normalizeAcademicId(person.academicId)).filter(Boolean);
  const emails = sourcePeople.map((person) => normalizeEmail(person.email)).filter(Boolean);
  const names = sourcePeople
    .map((person) =>
      String(person.name ?? '')
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const result = await target.query(
    `SELECT id, name, email, "secondaryEmails", "academicId"
     FROM people
     WHERE "deletedAt" IS NULL AND "mergedIntoId" IS NULL
       AND (id = ANY($4::text[]) OR regexp_replace(upper(coalesce("academicId",'')), '\\s', '', 'g') = ANY($1::text[])
         OR lower(btrim(email)) = ANY($2::text[])
         OR EXISTS (SELECT 1 FROM unnest("secondaryEmails") item WHERE lower(btrim(item)) = ANY($2::text[]))
         OR lower(btrim(name)) = ANY($3::text[]))`,
    [academicIds, emails, names, explicitIds],
  );
  return result.rows ?? [];
}

async function findPeopleByIds(target, ids) {
  const result = await target.query(
    `SELECT id, name, email, "secondaryEmails", "academicId", "deletedAt", "mergedIntoId"
     FROM people WHERE id = ANY($1::text[])`,
    [ids],
  );
  return result.rows ?? [];
}

function isActivePerson(person) {
  return Boolean(person && person.deletedAt == null && person.mergedIntoId == null);
}

function uniquePeopleBySourceId(sourcePeople) {
  const seen = new Set();
  return sourcePeople.filter((person) => {
    const sourceId = sourceIdOf(person);
    if (sourceId == null) return true;
    if (seen.has(sourceId)) return false;
    seen.add(sourceId);
    return true;
  });
}

function sourceIdOf(sourcePerson) {
  return sourcePerson?.sourceId == null ? null : String(sourcePerson.sourceId);
}

function normalizeMappings(explicitMappings) {
  if (explicitMappings == null) return new Map();
  const entries = explicitMappings instanceof Map ? explicitMappings.entries() : Object.entries(explicitMappings);
  return new Map([...entries].map(([sourceId, targetId]) => [String(sourceId), String(targetId)]));
}

function hasReliableIdentifier(sourcePerson) {
  return Boolean(normalizeAcademicId(sourcePerson.academicId) || normalizeEmail(sourcePerson.email));
}

function hasUsableName(sourcePerson) {
  return String(sourcePerson.name ?? '').trim().length > 0;
}

function normalizeSourceNamespace(sourceNamespace) {
  const normalized = String(sourceNamespace ?? '').trim();
  if (!normalized) throw new Error('sourceNamespace must be a non-empty string.');
  return normalized;
}

function emptyCounters() {
  return { created: 0, reused: 0, planned: 0, unresolved: 0 };
}
