import { Prisma } from '@prisma/client';
import { audienceContext, eventAudienceWhere, groupAudienceWhere, majorEventAudienceWhere, type EventAudiencePrincipal } from './audience-context';
import { AUDIENCE_RELATIONS } from './audience-relations.generated';

type QueryObject = Record<string, unknown>;
type RelationField = { name: string; type: string; isList: boolean; isRequired: boolean; ownsRelation: boolean };
const models = new Map<string, { fields: readonly RelationField[] }>(Object.entries(AUDIENCE_RELATIONS).map(([name, fields]) => [name, { fields }]));
const filteredOperations = new Set([
  'findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany',
  'count', 'aggregate', 'groupBy', 'update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany', 'upsert',
]);

function object(value: unknown): QueryObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as QueryObject : undefined;
}

// Follow owning foreign keys only. Reverse collections never make a person or user private.
export function modelAudienceWhere(modelName: string, principal: EventAudiencePrincipal, visited = new Set<string>()): QueryObject | undefined {
  if (principal.bypass || visited.has(modelName)) return undefined;
  if (modelName === 'Event') return eventAudienceWhere(principal) as QueryObject;
  if (modelName === 'EventGroup') return groupAudienceWhere(principal) as QueryObject;
  if (modelName === 'MajorEvent') return majorEventAudienceWhere(principal) as QueryObject;
  const model = models.get(modelName);
  if (!model) return undefined;
  const path = new Set([...visited, modelName]);
  const parts: QueryObject[] = [];
  for (const field of model.fields) {
    if (field.isList || !field.ownsRelation) continue;
    const where = modelAudienceWhere(field.type, principal, path);
    if (!where) continue;
    const relation = { [field.name]: { is: where } };
    parts.push(field.isRequired ? relation : { OR: [{ [field.name]: null }, relation] });
  }
  return parts.length ? { AND: parts } : undefined;
}

function addWhere(args: QueryObject, where: QueryObject | undefined): void {
  if (!where) return;
  // Preserve unique selectors at the top level for findUnique/update/upsert.
  const previous = object(args['where']) ?? {};
  args['where'] = { ...previous, AND: [...(Array.isArray(previous['AND']) ? previous['AND'] : previous['AND'] ? [previous['AND']] : []), where] };
}

function rewriteSelections(modelName: string, args: QueryObject, principal: EventAudiencePrincipal): void {
  const model = models.get(modelName);
  if (!model) return;
  for (const selectionKey of ['select', 'include']) {
    const selection = object(args[selectionKey]);
    if (!selection) continue;
    const next = { ...selection };
    args[selectionKey] = next;
    for (const field of model.fields) {
      if (!next[field.name]) continue;
      const nested = { ...(object(next[field.name]) ?? {}) };
      // Required to-one relations do not accept where. Their owning row is filtered instead.
      if (field.isList || !field.isRequired) addWhere(nested, modelAudienceWhere(field.type, principal));
      rewriteSelections(field.type, nested, principal);
      next[field.name] = nested;
    }
    if (next['_count']) {
      const count = object(next['_count']);
      const countSelection = object(count?.['select']);
      const selectedCounts: QueryObject = countSelection ? { ...countSelection } : Object.fromEntries(model.fields.filter((field) => field.isList).map((field) => [field.name, true]));
      for (const field of model.fields) {
        if (!field.isList || !selectedCounts[field.name]) continue;
        const filteredCount = { ...(object(selectedCounts[field.name]) ?? {}) };
        addWhere(filteredCount, modelAudienceWhere(field.type, principal));
        selectedCounts[field.name] = filteredCount;
      }
      next['_count'] = { select: selectedCounts };
    }
  }
}

export function scopeAudienceQuery(modelName: string, operation: string, input: QueryObject, principal: EventAudiencePrincipal): QueryObject {
  if (principal.bypass) return input;
  if (principal.pastParticipationBefore && !['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation)) {
    principal = { ...principal, pastParticipationBefore: undefined };
  }
  const args = { ...input };
  if (filteredOperations.has(operation)) addWhere(args, modelAudienceWhere(modelName, principal));
  rewriteSelections(modelName, args, principal);
  return args;
}

export const audiencePrismaExtension = Prisma.defineExtension({
  name: 'event-audience',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        const principal = audienceContext.getStore();
        const execute = query as (input: QueryObject) => Promise<unknown>;
        return execute(principal ? scopeAudienceQuery(model, operation, args as QueryObject, principal) : args as QueryObject);
      },
    },
  },
});
