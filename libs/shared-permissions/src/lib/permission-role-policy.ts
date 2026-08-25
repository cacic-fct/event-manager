import { EVENT_MANAGER_PERMISSION_CATALOG } from './permission-catalog';
import { EVENT_MANAGER_PERMISSION_PRESETS } from './permission-presets';
import { Permission, type PermissionRequirement } from './permission-types';

export type EventManagerSystemRoleKey =
  | 'super-admin'
  | 'platform-admin'
  | 'major-event-manager'
  | 'operations-coordinator'
  | 'attendance-coordinator'
  | 'sports-coordinator';

export type EventManagerSystemRoleDefinition = {
  key: EventManagerSystemRoleKey;
  name: string;
  description: string;
  emoji: string;
  permissions: PermissionRequirement;
  assignable: boolean;
  external: boolean;
};

export type PermissionContextDependency = {
  permission: Permission;
  requires: PermissionRequirement;
  reason: string;
};

const preset = (id: string): PermissionRequirement =>
  EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === id)?.permissions ?? [];

const uniquePermissions = (...sets: readonly PermissionRequirement[]): PermissionRequirement => [
  ...new Set(sets.flat()),
];

export const EVENT_MANAGER_SYSTEM_ROLES = [
  {
    key: 'super-admin',
    name: 'Superadministrador',
    description: 'Acesso total administrado externamente pelo Keycloak. Não pode ser atribuído nesta página.',
    emoji: '🛡️',
    permissions: EVENT_MANAGER_PERMISSION_CATALOG,
    assignable: false,
    external: true,
  },
  {
    key: 'platform-admin',
    name: 'Administrador da plataforma',
    description: 'Administra toda a plataforma, incluindo pessoas, permissões e operações globais.',
    emoji: '🔐',
    permissions: EVENT_MANAGER_PERMISSION_CATALOG,
    assignable: true,
    external: false,
  },
  {
    key: 'major-event-manager',
    name: 'Gestor de grande evento',
    description: 'Coordena estrutura, publicação, formulários e operação de um grande evento.',
    emoji: '🎪',
    permissions: uniquePermissions(preset('major-event-admin'), preset('event-structure-manager'), [
      Permission.RelatedPerson.Read,
    ]),
    assignable: true,
    external: false,
  },
  {
    key: 'operations-coordinator',
    name: 'Coordenação operacional',
    description: 'Gerencia inscrições, comprovantes, presenças e certificados dentro dos escopos atribuídos.',
    emoji: '🧭',
    permissions: uniquePermissions(
      preset('major-event-receipt-validator'),
      preset('attendance-coordinator'),
      preset('certificate-operator'),
      [Permission.RelatedPerson.Read],
    ),
    assignable: true,
    external: false,
  },
  {
    key: 'attendance-coordinator',
    name: 'Equipe de presenças',
    description: 'Coleta e corrige presenças e administra coletores somente nos eventos atribuídos.',
    emoji: '✅',
    permissions: uniquePermissions(preset('attendance-coordinator'), [Permission.RelatedPerson.Read]),
    assignable: true,
    external: false,
  },
  {
    key: 'sports-coordinator',
    name: 'Coordenação esportiva',
    description: 'Administra torneios, equipes, inscrições, partidas, arbitragem e resultados esportivos.',
    emoji: '🏆',
    permissions: uniquePermissions(preset('sports-tournament-admin'), [Permission.RelatedPerson.Read]),
    assignable: true,
    external: false,
  },
] as const satisfies readonly EventManagerSystemRoleDefinition[];

export const EVENT_MANAGER_SYSTEM_ROLE_BY_KEY = new Map(
  EVENT_MANAGER_SYSTEM_ROLES.map((role) => [role.key, role] as const),
);

const sameResourceReadDependencies = Object.fromEntries(
  Object.values(Permission).flatMap((resourcePermissions) => {
    if (typeof resourcePermissions === 'string' || !('Read' in resourcePermissions)) {
      return [];
    }

    const readPermission = resourcePermissions.Read as Permission;
    return (Object.values(resourcePermissions) as Permission[])
      .filter((permission) => permission !== readPermission)
      .map((permission) => [permission, [readPermission] as PermissionRequirement]);
  }),
) as Partial<Record<Permission, PermissionRequirement>>;

export const EVENT_MANAGER_HARD_PERMISSION_DEPENDENCIES: Readonly<Partial<Record<Permission, PermissionRequirement>>> =
  {
    ...sameResourceReadDependencies,
    [Permission.Certificate.Reissue]: [Permission.Certificate.Read, Permission.Certificate.Issue],
    [Permission.EventForm.Publish]: [Permission.EventForm.Read, Permission.EventForm.Update],
    [Permission.EventForm.Export]: [Permission.EventForm.Read, Permission.EventForm.Results],
    [Permission.MergeCandidate.Merge]: [Permission.MergeCandidate.Read, Permission.MergeCandidate.Update],
    [Permission.MergeCandidate.Undo]: [Permission.MergeCandidate.Read, Permission.MergeCandidate.Merge],
    [Permission.PlacePreset.Merge]: [
      Permission.PlacePreset.Read,
      Permission.PlacePreset.Update,
      Permission.PlacePreset.Delete,
    ],
    [Permission.SportsTournament.Duplicate]: [Permission.SportsTournament.Read, Permission.SportsTournament.Create],
    [Permission.SportsCategory.Duplicate]: [Permission.SportsCategory.Read, Permission.SportsCategory.Create],
    [Permission.SportsTeam.Duplicate]: [Permission.SportsTeam.Read, Permission.SportsTeam.Create],
  };

export const EVENT_MANAGER_CONTEXT_PERMISSION_DEPENDENCIES = [
  {
    permission: Permission.EventLecturer.Create,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Selecionar uma pessoa ministrante exige consultar pessoas já relacionadas ao escopo.',
  },
  {
    permission: Permission.EventLecturer.Update,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Alterar o vínculo exige consultar pessoas já relacionadas ao escopo.',
  },
  {
    permission: Permission.EventAttendanceCollector.Create,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Selecionar uma pessoa coletora exige consultar pessoas já relacionadas ao escopo.',
  },
  {
    permission: Permission.Subscription.Create,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Criar uma inscrição em nome de alguém exige localizar pessoas já relacionadas ao escopo.',
  },
  {
    permission: Permission.Subscription.Import,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Conciliar uma importação exige comparar identificadores de pessoas relacionadas ao escopo.',
  },
  {
    permission: Permission.EventAttendance.Import,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Conciliar presenças exige comparar identificadores de pessoas relacionadas ao escopo.',
  },
  {
    permission: Permission.Certificate.Issue,
    requires: [Permission.EventAttendance.Read, Permission.Subscription.Read],
    reason: 'A emissão pode depender de presença e inscrição; o cargo precisa enxergar os dados de elegibilidade.',
  },
  {
    permission: Permission.Receipt.Approve,
    requires: [Permission.Subscription.Read, Permission.Subscription.Update],
    reason: 'Aprovar um comprovante consulta e altera o estado da inscrição relacionada.',
  },
  {
    permission: Permission.Receipt.Reject,
    requires: [Permission.Subscription.Read, Permission.Subscription.Update],
    reason: 'Recusar um comprovante consulta e altera o estado da inscrição relacionada.',
  },
  {
    permission: Permission.Receipt.Undo,
    requires: [Permission.Subscription.Read, Permission.Subscription.Update],
    reason: 'Desfazer um comprovante consulta e altera o estado da inscrição relacionada.',
  },
  {
    permission: Permission.SportsTeam.AssignRepresentative,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Designar representante exige localizar pessoas já relacionadas ao escopo.',
  },
  {
    permission: Permission.SportsOfficial.Create,
    requires: [Permission.RelatedPerson.Read],
    reason: 'Designar a equipe de arbitragem exige localizar pessoas já relacionadas ao escopo.',
  },
  {
    permission: Permission.SportsScore.Update,
    requires: [Permission.SportsMatch.Operate],
    reason: 'Registrar o placar altera o estado operacional da partida relacionada.',
  },
  {
    permission: Permission.SportsScore.Review,
    requires: [Permission.SportsMatch.Review],
    reason: 'Revisar o placar exige autoridade para revisar a partida relacionada.',
  },
] as const satisfies readonly PermissionContextDependency[];

export function expandHardPermissionDependencies(permissions: Iterable<Permission>): Set<Permission> {
  const expanded = new Set(permissions);
  const pending = [...expanded];

  while (pending.length > 0) {
    const permission = pending.pop();
    if (!permission) continue;

    for (const dependency of EVENT_MANAGER_HARD_PERMISSION_DEPENDENCIES[permission] ?? []) {
      if (!expanded.has(dependency)) {
        expanded.add(dependency);
        pending.push(dependency);
      }
    }
  }

  return expanded;
}

export function removePermissionAndDependents(
  permissions: Iterable<Permission>,
  permissionToRemove: Permission,
): Set<Permission> {
  const remaining = new Set(permissions);
  remaining.delete(permissionToRemove);

  let changed = true;
  while (changed) {
    changed = false;
    for (const permission of remaining) {
      const dependencies = EVENT_MANAGER_HARD_PERMISSION_DEPENDENCIES[permission] ?? [];
      if (dependencies.some((dependency) => !remaining.has(dependency))) {
        remaining.delete(permission);
        changed = true;
      }
    }
  }

  return remaining;
}

export function getMissingContextPermissionDependencies(
  permissions: Iterable<Permission>,
): PermissionContextDependency[] {
  const selected = new Set(permissions);
  return EVENT_MANAGER_CONTEXT_PERMISSION_DEPENDENCIES.filter(
    (dependency) =>
      selected.has(dependency.permission) && dependency.requires.some((required) => !selected.has(required)),
  );
}
