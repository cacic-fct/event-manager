import { formatDate } from '@angular/common';
import {
  EVENT_MANAGER_PERMISSION_CATALOG,
  EVENT_MANAGER_PERMISSION_PRESETS,
  EventManagerPermissionGrantScope,
  Permission,
  formatPermissionGroups,
  getPermissionIncludedData,
  getPermissionIncludedDataSummary,
  getPermissionResourceIcon,
  getPermissionResourceLabel,
  getPermissionScopeLabel,
  requiresGlobalPermissionGrantScope,
} from '@cacic-fct/shared-permissions';
import type { PermissionIncludedData } from '@cacic-fct/shared-permissions';
import {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantInput,
  EventManagerPermissionGrantTarget,
  EventManagerPermissionGrantUpdateInput,
} from '@cacic-fct/event-manager-admin-contracts';
import { format, isAfter, isValid, parseISO } from 'date-fns';

export type PermissionGrantOption = {
  permission: Permission;
  label: string;
  icon: string;
  includedData: readonly PermissionIncludedData[];
  includedDataSummary: string;
};

export type PermissionGrantGroup = {
  resource: string;
  label: string;
  icon: string;
  options: PermissionGrantOption[];
};

export type PermissionGrantPresetOption = {
  id: string;
  label: string;
  description: string;
  icon: string;
};

export type PermissionGrantPresetPreviewGroup = {
  resource: string;
  label: string;
  icon: string;
  permissionLabels: string;
  permissionCount: number;
  includedData: readonly PermissionIncludedData[];
};

export type PermissionGrantScopeOption = {
  scope: EventManagerPermissionGrantScope;
  label: string;
  icon: string;
  disabled?: boolean;
};

export type PermissionGrantDraft = EventManagerPermissionGrantInput & {
  id: string;
  sourceLabel: string;
  targetLabel: string | null;
};

export const PERMISSION_GRANT_GROUPS: PermissionGrantGroup[] = formatPermissionGroups(EVENT_MANAGER_PERMISSION_CATALOG).map(
  (group) => ({
    resource: group.type,
    label: group.label,
    icon: group.resourceIcon,
    options: group.actions.map((action) => ({
      permission: `${group.type}#${action.scope}` as Permission,
      label: action.label,
      icon: action.icon,
      includedData: getPermissionIncludedData(`${group.type}#${action.scope}` as Permission),
      includedDataSummary: getPermissionIncludedDataSummary(`${group.type}#${action.scope}` as Permission),
    })),
  }),
);

export const PERMISSION_GRANT_PRESET_OPTIONS: PermissionGrantPresetOption[] = EVENT_MANAGER_PERMISSION_PRESETS.map(
  (preset) => ({
    id: preset.id,
    label: preset.label,
    description: preset.description,
    icon: preset.icon,
  }),
);

export const PERMISSION_GRANT_SCOPES: PermissionGrantScopeOption[] = [
  {
    scope: EventManagerPermissionGrantScope.Global,
    label: 'Global',
    icon: 'public',
  },
  {
    scope: EventManagerPermissionGrantScope.Event,
    label: 'Evento',
    icon: 'event',
  },
  {
    scope: EventManagerPermissionGrantScope.MajorEvent,
    label: 'Grande evento',
    icon: 'festival',
  },
  {
    scope: EventManagerPermissionGrantScope.EventGroup,
    label: 'Grupo de eventos',
    icon: 'folder',
  },
];

export function getPermissionGrantLabel(permission: string): string {
  const [resource, scope] = permission.split('#');
  return `${getPermissionResourceLabel(resource)} · ${getPermissionScopeLabel(scope)}`;
}

export function getPermissionGrantIcon(permission: string): string {
  const [resource] = permission.split('#');
  return getPermissionResourceIcon(resource);
}

export function getPermissionGrantIncludedData(permission: string): readonly PermissionIncludedData[] {
  return getPermissionIncludedData(permission as Permission);
}

export function formatPermissionIncludedDataFields(item: PermissionIncludedData): string {
  return item.fields.join(', ');
}

export function getPermissionGrantSelectionLabel(permissions: readonly Permission[]): string {
  if (permissions.length === 0) {
    return 'Nenhuma permissão selecionada';
  }

  if (permissions.length === 1) {
    return getPermissionGrantLabel(permissions[0]);
  }

  return `${permissions.length} permissões selecionadas`;
}

export function getPermissionGrantScopeLabel(scope: EventManagerPermissionGrantScope): string {
  return PERMISSION_GRANT_SCOPES.find((option) => option.scope === scope)?.label ?? scope;
}

export function getPermissionGrantTargetLabel(grant: EventManagerPermissionGrant): string {
  return getPermissionGrantTargetFieldsLabel(grant);
}

export function getPermissionGrantDraftTargetLabel(draft: PermissionGrantDraft): string {
  return getPermissionGrantTargetFieldsLabel(draft);
}

function getPermissionGrantTargetFieldsLabel(target: {
  scope: EventManagerPermissionGrantScope;
  targetLabel?: string | null;
  eventId?: string | null;
  majorEventId?: string | null;
  eventGroupId?: string | null;
}): string {
  if (target.scope === EventManagerPermissionGrantScope.Global) {
    return 'Todos os eventos';
  }

  return target.targetLabel ?? target.eventId ?? target.majorEventId ?? target.eventGroupId ?? 'Alvo removido';
}

export function getPermissionGrantPresetDescription(presetId: string): string {
  return EVENT_MANAGER_PERMISSION_PRESETS.find((preset) => preset.id === presetId)?.description ?? '';
}

export function getPermissionGrantValidityWindowLabel(
  grant: Pick<EventManagerPermissionGrant, 'validFrom' | 'validUntil'>,
): string {
  const validFrom = grant.validFrom ? formatDateTime(grant.validFrom) : null;
  const validUntil = grant.validUntil ? formatDateTime(grant.validUntil) : null;

  if (validFrom && validUntil) {
    return `De ${validFrom} até ${validUntil}`;
  }

  if (validFrom) {
    return `A partir de ${validFrom}`;
  }

  if (validUntil) {
    return `Até ${validUntil}`;
  }

  return 'Validade indefinida';
}

export function getPermissionGrantStatusLabel(grant: EventManagerPermissionGrant): string {
  const now = new Date();
  const validFrom = grant.validFrom ? parseISO(grant.validFrom) : null;
  const validUntil = grant.validUntil ? parseISO(grant.validUntil) : null;

  if (validFrom && isAfter(validFrom, now)) {
    return 'Agendada';
  }

  if (validUntil && !isAfter(validUntil, now)) {
    return 'Expirada';
  }

  return 'Ativa';
}

export function getPermissionsIncludedData(permissions: readonly Permission[]): readonly PermissionIncludedData[] {
  const includedData = new Map<string, PermissionIncludedData>();
  for (const permission of permissions) {
    for (const item of getPermissionIncludedData(permission)) {
      includedData.set(`${item.label}:${item.fields.join('|')}`, item);
    }
  }

  return [...includedData.values()];
}

export function getPermissionGrantTargetDateLabel(
  target: EventManagerPermissionGrantTarget,
  scope: EventManagerPermissionGrantScope,
  locale: string,
): string {
  if (!target.startDate) {
    return '';
  }

  if (scope === EventManagerPermissionGrantScope.Event) {
    return formatDate(target.startDate, 'short', locale);
  }

  const startDate = formatDate(target.startDate, 'shortDate', locale);
  if (!target.endDate) {
    return startDate;
  }

  const endDate = formatDate(target.endDate, 'shortDate', locale);
  return startDate === endDate ? startDate : `${startDate} - ${endDate}`;
}

export function getPermissionGrantDateTime(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function hasSamePermissionGrantValidity(
  grant: Pick<EventManagerPermissionGrant, 'validFrom' | 'validUntil'>,
  input: Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'>,
): boolean {
  return (
    getPermissionGrantDateTime(grant.validFrom) === getPermissionGrantDateTime(input.validFrom) &&
    getPermissionGrantDateTime(grant.validUntil) === getPermissionGrantDateTime(input.validUntil)
  );
}

export function getPermissionGrantInputTargetKey(
  input: Pick<
    EventManagerPermissionGrantInput,
    'userId' | 'permission' | 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'
  >,
): string {
  return [
    input.userId,
    input.permission,
    input.scope,
    input.eventId ?? '',
    input.majorEventId ?? '',
    input.eventGroupId ?? '',
  ].join('|');
}

export function buildPermissionGrantTargetInput(
  permission: Permission,
  scope: EventManagerPermissionGrantScope,
  targetId: string,
): Pick<EventManagerPermissionGrantInput, 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'> {
  const effectiveScope = requiresGlobalPermissionGrantScope(permission) ? EventManagerPermissionGrantScope.Global : scope;

  return {
    scope: effectiveScope,
    eventId: effectiveScope === EventManagerPermissionGrantScope.Event ? targetId : null,
    majorEventId: effectiveScope === EventManagerPermissionGrantScope.MajorEvent ? targetId : null,
    eventGroupId: effectiveScope === EventManagerPermissionGrantScope.EventGroup ? targetId : null,
  };
}

export function buildPermissionGrantDraft(
  input: EventManagerPermissionGrantInput,
  sourceLabel: string,
  targetLabel: string | null,
): PermissionGrantDraft {
  return {
    ...input,
    id: getPermissionGrantInputTargetKey(input),
    sourceLabel,
    targetLabel,
  };
}

export function buildPermissionGrantInputFromDraft(
  draft: PermissionGrantDraft,
): EventManagerPermissionGrantInput {
  return {
    userId: draft.userId,
    personId: draft.personId,
    permission: draft.permission,
    scope: draft.scope,
    eventId: draft.eventId,
    majorEventId: draft.majorEventId,
    eventGroupId: draft.eventGroupId,
    validFrom: draft.validFrom,
    validUntil: draft.validUntil,
  };
}

export function buildPermissionGrantInput(
  personId: string,
  userId: string,
  permission: Permission,
  scope: EventManagerPermissionGrantScope,
  targetId: string,
  validity: Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'>,
): EventManagerPermissionGrantInput {
  return {
    userId,
    personId,
    permission,
    ...buildPermissionGrantTargetInput(permission, scope, targetId),
    ...validity,
  };
}

export function buildPermissionGrantUpdateInput(
  permission: Permission,
  scope: EventManagerPermissionGrantScope,
  targetId: string,
  validity: Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'>,
): EventManagerPermissionGrantUpdateInput {
  return {
    permission,
    ...buildPermissionGrantTargetInput(permission, scope, targetId),
    ...validity,
  };
}

export function findPermissionGrantBatchConflict(
  inputs: readonly EventManagerPermissionGrantInput[],
  grants: readonly EventManagerPermissionGrant[],
): EventManagerPermissionGrant | null {
  for (const input of inputs) {
    const existingGrant = grants.find((grant) => isSamePermissionGrantTarget(grant, input));
    if (existingGrant && !hasSamePermissionGrantValidity(existingGrant, input)) {
      return existingGrant;
    }
  }

  return null;
}

export function isSamePermissionGrantTarget(
  left: Pick<
    EventManagerPermissionGrantInput,
    'userId' | 'permission' | 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'
  >,
  right: Pick<
    EventManagerPermissionGrantInput,
    'userId' | 'permission' | 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'
  >,
): boolean {
  return getPermissionGrantInputTargetKey(left) === getPermissionGrantInputTargetKey(right);
}

export function getPermissionGrantInputTargetLabel(
  input: Pick<EventManagerPermissionGrantInput, 'scope' | 'eventId' | 'majorEventId' | 'eventGroupId'>,
  targets: {
    events: readonly EventManagerPermissionGrantTarget[];
    majorEvents: readonly EventManagerPermissionGrantTarget[];
    eventGroups: readonly EventManagerPermissionGrantTarget[];
  },
): string | null {
  switch (input.scope) {
    case EventManagerPermissionGrantScope.Event:
      return targets.events.find((target) => target.id === input.eventId)?.label ?? null;
    case EventManagerPermissionGrantScope.MajorEvent:
      return targets.majorEvents.find((target) => target.id === input.majorEventId)?.label ?? null;
    case EventManagerPermissionGrantScope.EventGroup:
      return targets.eventGroups.find((target) => target.id === input.eventGroupId)?.label ?? null;
    default:
      return null;
  }
}

export type PermissionGrantValidityResult =
  | { valid: true; value: Pick<EventManagerPermissionGrantInput, 'validFrom' | 'validUntil'> }
  | { valid: false; message: string };

export function normalizePermissionGrantValidity(
  validFromValue: string,
  validUntilValue: string,
  now = new Date(),
): PermissionGrantValidityResult {
  const validFrom = normalizeDateTimeInput(validFromValue, 'início da validade');
  const validUntil = normalizeDateTimeInput(validUntilValue, 'fim da validade');

  if (!validFrom.valid) {
    return validFrom;
  }
  if (!validUntil.valid) {
    return validUntil;
  }

  if (validFrom.value && validUntil.value && !isAfter(parseISO(validUntil.value), parseISO(validFrom.value))) {
    return { valid: false, message: 'O fim da validade precisa ser posterior ao início.' };
  }

  if (validUntil.value && !isAfter(parseISO(validUntil.value), now)) {
    return { valid: false, message: 'O fim da validade precisa ser futuro.' };
  }

  return {
    valid: true,
    value: {
      validFrom: validFrom.value,
      validUntil: validUntil.value,
    },
  };
}

export function sortPermissionGrants(grants: readonly EventManagerPermissionGrant[]): EventManagerPermissionGrant[] {
  return [...grants].sort((left, right) => {
    const permissionOrder = getPermissionGrantLabel(left.permission).localeCompare(
      getPermissionGrantLabel(right.permission),
      'pt-BR',
    );
    if (permissionOrder !== 0) {
      return permissionOrder;
    }

    return getPermissionGrantScopeLabel(left.scope).localeCompare(getPermissionGrantScopeLabel(right.scope), 'pt-BR');
  });
}

export function getPresetScope(
  presetId: string,
  fallbackScope: EventManagerPermissionGrantScope,
): EventManagerPermissionGrantScope {
  const allowedScopes = getPresetAllowedScopes(presetId);
  if (allowedScopes.includes(fallbackScope)) {
    return fallbackScope;
  }

  return getPresetPreferredScope(presetId, fallbackScope);
}

export function getPresetPreferredScope(
  presetId: string,
  fallbackScope: EventManagerPermissionGrantScope,
): EventManagerPermissionGrantScope {
  const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    return fallbackScope;
  }

  if (preset.permissions.some((permission) => requiresGlobalPermissionGrantScope(permission))) {
    return EventManagerPermissionGrantScope.Global;
  }

  if ((preset.allowedScopes as readonly EventManagerPermissionGrantScope[]).includes(preset.preferredScope)) {
    return preset.preferredScope;
  }

  return preset.allowedScopes[0] ?? fallbackScope;
}

export function getPresetAllowedScopes(presetId: string): readonly EventManagerPermissionGrantScope[] {
  const preset = EVENT_MANAGER_PERMISSION_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    return PERMISSION_GRANT_SCOPES.map((scope) => scope.scope);
  }

  if (preset.permissions.some((permission) => requiresGlobalPermissionGrantScope(permission))) {
    return [EventManagerPermissionGrantScope.Global];
  }

  return preset.allowedScopes;
}

export function isPresetScopeAllowed(presetId: string, scope: EventManagerPermissionGrantScope): boolean {
  return getPresetAllowedScopes(presetId).includes(scope);
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function formatDateTimeInput(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const date = parseISO(value);
  if (!isValid(date)) {
    return '';
  }

  return format(date, "yyyy-MM-dd'T'HH:mm");
}

function normalizeDateTimeInput(value: string, label: string): { valid: true; value: string | null } | { valid: false; message: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true, value: null };
  }

  const date = parseISO(trimmed);
  if (!isValid(date)) {
    return { valid: false, message: `Informe uma data válida para ${label}.` };
  }

  return { valid: true, value: date.toISOString() };
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}
