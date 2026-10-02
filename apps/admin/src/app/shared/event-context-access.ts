import { Permission, WORKSPACE_TAB_PERMISSIONS } from '@cacic-fct/shared-permissions';

export type CreatableEventContext = 'event' | 'group' | 'major-event';

const creationAccess = {
  event: { permission: Permission.Event.Create, tab: 'events' },
  group: { permission: Permission.EventGroup.Create, tab: 'groups' },
  'major-event': { permission: Permission.MajorEvent.Create, tab: 'major-events' },
} as const;

/** Creation opens the full editor, so its lookup/read requirements also apply. */
export function canCreateEventContext(
  permissions: { has(permission: Permission): boolean },
  kind: CreatableEventContext,
): boolean {
  const access = creationAccess[kind];
  const editor = WORKSPACE_TAB_PERMISSIONS.find((tab) => tab.id === access.tab);
  return permissions.has(access.permission) && Boolean(editor?.read.every((permission) => permissions.has(permission)));
}
