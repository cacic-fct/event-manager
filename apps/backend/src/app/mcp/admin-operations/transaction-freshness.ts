import { PRISMA_MODEL_IDENTITIES } from '../../audiences/audience-relations.generated';
import { Prisma } from '@prisma/client';
import type { AdminMcpOperation } from './catalog';

const identities: Readonly<
  Record<
    string,
    {
      readonly table: string;
      readonly labelColumn: string | null;
      readonly idFields: readonly { readonly name: string; readonly column: string }[];
    }
  >
> = PRISMA_MODEL_IDENTITIES;

const modelsByKey: Record<string, string> = {
  eventId: 'Event',
  eventGroupId: 'EventGroup',
  majorEventId: 'MajorEvent',
  personId: 'People',
  tournamentId: 'SportsTournament',
  sportsTournamentId: 'SportsTournament',
  categoryId: 'SportsCategory',
  teamId: 'SportsTeam',
  registrationId: 'SportsRegistration',
  matchId: 'SportsMatch',
  venueId: 'SportsVenue',
  actionId: 'SportsMatchAction',
  rosterId: 'SportsMatchRoster',
  officialId: 'SportsOfficialAssignment',
  formId: 'EventForm',
  eventFormId: 'EventForm',
  subscriptionId: 'EventSubscription',
  certificateId: 'Certificate',
  configId: 'CertificateConfig',
  prizeDrawId: 'PrizeDraw',
  roleId: 'EventManagerRole',
  groupId: 'EventManagerPermissionGroup',
};

function primaryModel(operation: AdminMcpOperation): string | undefined {
  const resource = operation.permissions[0]?.split('#')[0];
  const explicit: Record<string, string> = {
    person: 'People',
    'event-attendance': 'EventAttendance',
    subscription: 'EventSubscription',
    'merge-candidate': 'MergeCandidate',
    'place-preset': 'PlacePreset',
    'event-form': 'EventForm',
  };
  if (resource && explicit[resource]) {
    return explicit[resource];
  }
  if (operation.field.includes('PermissionRole')) {
    return 'EventManagerRole';
  }
  if (operation.field.includes('PermissionGroup')) {
    return 'EventManagerPermissionGroup';
  }
  const name = resource
    ?.split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  return name && name in identities ? name : undefined;
}

function commandReferences(operation: AdminMcpOperation, args: Record<string, unknown>): Map<string, Set<string>> {
  const targets = new Map<string, Set<string>>();
  const primary = primaryModel(operation);
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') {
      return;
    }
    for (const [key, item] of Object.entries(value)) {
      const singular = key.endsWith('Ids') ? `${key.slice(0, -3)}Id` : key;
      const model = key === 'id' || key === 'ids' ? primary : modelsByKey[singular];
      if (model) {
        const ids = (Array.isArray(item) ? item : [item]).filter((id): id is string => typeof id === 'string');
        const set = targets.get(model) ?? new Set<string>();
        ids.forEach((id) => set.add(id));
        targets.set(model, set);
      }
      if (item && typeof item === 'object') {
        collect(item);
      }
    }
  }
  collect(args);
  return targets;
}

/** Lock only schema-owned tables and parameterized IDs, never an input table name. */
export async function lockCommandTargets(
  tx: Prisma.TransactionClient,
  operation: AdminMcpOperation,
  args: Record<string, unknown>,
): Promise<void> {
  const targets = commandReferences(operation, args);
  const primary = primaryModel(operation);
  for (const [name, ids] of [...targets].sort(([left], [right]) => left.localeCompare(right))) {
    const model = identities[name];
    if (!ids.size || !model || model.idFields.length !== 1 || model.idFields[0].name !== 'id') {
      continue;
    }
    const table = Prisma.raw(`"${model.table.replaceAll('"', '""')}"`);
    const column = Prisma.raw(`"${model.idFields[0].column.replaceAll('"', '""')}"`);
    await tx.$queryRaw(
      Prisma.sql`SELECT ${column} FROM ${table} WHERE ${column} IN (${Prisma.join([...ids].sort())}) ORDER BY ${column} FOR UPDATE`,
    );
  }
  if (primary === 'EventAttendance' && typeof args['eventId'] === 'string' && typeof args['personId'] === 'string') {
    await tx.$queryRaw`SELECT "eventId" FROM "event_attendances" WHERE "eventId" = ${args['eventId']} AND "personId" = ${args['personId']} FOR UPDATE`;
  }
}

export async function commandTargetLabels(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  operation: AdminMcpOperation,
  args: Record<string, unknown>,
  personalData: boolean,
) {
  const labels: { kind: string; id: string; label: string | null }[] = [];
  for (const [name, ids] of commandReferences(operation, args)) {
    const model = identities[name];
    if (
      !ids.size ||
      !model?.labelColumn ||
      model.idFields.length !== 1 ||
      model.idFields[0].name !== 'id' ||
      (name === 'People' && !personalData)
    ) {
      continue;
    }
    const table = Prisma.raw(`"${model.table.replaceAll('"', '""')}"`);
    const key = Prisma.raw(`"${model.idFields[0].column.replaceAll('"', '""')}"`);
    const label = Prisma.raw(`"${model.labelColumn.replaceAll('"', '""')}"`);
    const rows = await tx.$queryRaw<{ id: string; label: string | null }[]>(
      Prisma.sql`SELECT ${key} AS "id", ${label} AS "label" FROM ${table} WHERE ${key} IN (${Prisma.join([...ids])}) LIMIT 20`,
    );
    labels.push(...rows.map((row) => ({ kind: name, id: row.id, label: row.label?.slice(0, 250) ?? null })));
    if (labels.length >= 20) {
      break;
    }
  }
  return labels.slice(0, 20);
}
