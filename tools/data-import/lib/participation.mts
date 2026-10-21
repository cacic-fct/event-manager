import type { TransferResource } from './transfer.mts';
import { normalizeSpaces, normalizeTextKey } from './text.mts';

const TARGET_FIELD_BY_KIND = {
  'event-subscription': 'eventId',
  'group-subscription': 'eventGroupId',
  'major-event-subscription': 'majorEventId',
} as const;

type ParticipationKind = keyof typeof TARGET_FIELD_BY_KIND;

export interface ParticipationDeduplicationResult {
  resources: TransferResource[];
  duplicateResourcesRemoved: number;
  sameNameReferenceGroups: number;
}

interface SameNameReferenceGroup {
  nameKey: string;
  referenceKeys: Set<string>;
  resourceCount: number;
}

function isParticipationKind(value: string): value is ParticipationKind {
  return Object.hasOwn(TARGET_FIELD_BY_KIND, value);
}

function getPersonReference(resource: TransferResource): Record<string, unknown> {
  const person = resource.data.person;
  if (typeof person !== 'object' || person === null || Array.isArray(person)) {
    throw new Error('Participation resource must include a person reference object.');
  }
  return person as Record<string, unknown>;
}

function getTargetId(resource: TransferResource): string {
  if (!isParticipationKind(resource.kind)) {
    throw new Error(`Unsupported participation resource kind: ${resource.kind}`);
  }
  const targetId = resource.data[TARGET_FIELD_BY_KIND[resource.kind]];
  if (typeof targetId !== 'string' || !targetId) {
    throw new Error(`Participation resource is missing ${TARGET_FIELD_BY_KIND[resource.kind]}.`);
  }
  return targetId;
}

function canonicalPersonReference(person: Record<string, unknown>): string {
  const entries = Object.entries(person)
    .map(([field, value]) => {
      if (typeof value !== 'string') return [field, value] as const;
      const normalized = normalizeSpaces(value);
      switch (field) {
        case 'name':
          return [field, normalizeTextKey(normalized)] as const;
        case 'email':
          return [field, normalized.toLocaleLowerCase('und')] as const;
        case 'phone':
          return [field, normalized.replace(/[^\d+]/gu, '')] as const;
        case 'identityDocument':
          return [field, normalized.replace(/[^\p{Letter}\p{Number}]/gu, '').toLocaleUpperCase('und')] as const;
        case 'academicId':
          return [field, normalized.toLocaleUpperCase('und')] as const;
        default:
          return [field, normalized] as const;
      }
    })
    .sort(([left], [right]) => String(left).localeCompare(String(right)));
  return JSON.stringify(entries);
}

/** Remove repeated person references within a target while preserving distinct same-name identities. */
export function dedupeParticipationResources(
  resources: readonly TransferResource[],
  ambiguousNameKeys: ReadonlySet<string> = new Set(),
): ParticipationDeduplicationResult {
  const uniqueResources: TransferResource[] = [];
  const seenResourceKeys = new Set<string>();
  const groups = new Map<string, SameNameReferenceGroup>();
  let duplicateResourcesRemoved = 0;

  for (const resource of resources) {
    const targetId = getTargetId(resource);
    const person = getPersonReference(resource);
    const nameKey = normalizeTextKey(person.name);
    const referenceKey = canonicalPersonReference(person);
    const resourceKey = JSON.stringify([resource.kind, targetId, referenceKey]);
    const groupKey = JSON.stringify([resource.kind, targetId, nameKey]);
    const group = groups.get(groupKey) ?? {
      nameKey,
      referenceKeys: new Set<string>(),
      resourceCount: 0,
    };
    group.resourceCount += 1;
    group.referenceKeys.add(referenceKey);
    groups.set(groupKey, group);

    const lookupIsAmbiguous = nameKey !== '' && ambiguousNameKeys.has(nameKey);
    if (seenResourceKeys.has(resourceKey) && lookupIsAmbiguous) {
      throw new Error(
        `Repeated participation rows for ambiguous person '${String(person.name ?? '')}' cannot be resolved safely. Resolve the person identifiers or remove the duplicate source rows before exporting.`,
      );
    }
    if (seenResourceKeys.has(resourceKey)) {
      duplicateResourcesRemoved += 1;
      continue;
    }
    seenResourceKeys.add(resourceKey);
    uniqueResources.push(resource);
  }

  const sameNameReferenceGroups = [...groups.values()].filter(
    ({ nameKey, referenceKeys, resourceCount }) =>
      referenceKeys.size > 1 || (resourceCount > 1 && ambiguousNameKeys.has(nameKey)),
  ).length;

  return { resources: uniqueResources, duplicateResourcesRemoved, sameNameReferenceGroups };
}
