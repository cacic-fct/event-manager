export type AdminEventWorkspaceKind = 'event' | 'group' | 'major-event';
export type AdminEventWorkspaceSection = 'settings';
export type AdminSportsWorkspaceArea = 'overview' | 'categories' | 'teams' | 'matches' | 'reviews';

export interface AdminEventWorkspaceRouteTarget {
  kind: AdminEventWorkspaceKind;
  id: string;
  section?: AdminEventWorkspaceSection;
}

export interface AdminSportsWorkspaceRouteTarget {
  majorEventId: string;
  area?: AdminSportsWorkspaceArea;
  categoryId?: string;
  teamId?: string;
  matchId?: string;
}

/**
 * Builds the raw router commands used by the admin event workspace.
 * IDs intentionally stay unescaped here because Angular Router escapes each
 * command segment. Use the corresponding path helper for server-generated URLs.
 */
export function adminEventWorkspaceRoute(target: AdminEventWorkspaceRouteTarget): string[] {
  return [
    '/event-workspace',
    target.kind,
    target.id,
    ...(target.section ? [target.section] : []),
  ];
}

/** Builds the URI-encoded path for a server-generated admin event workspace link. */
export function adminEventWorkspacePath(target: AdminEventWorkspaceRouteTarget): string {
  return adminRoutePath(adminEventWorkspaceRoute(target));
}

/** Builds the raw router commands used by the admin event workspace creation flows. */
export function adminEventWorkspaceCreationRoute(kind: AdminEventWorkspaceKind): string[] {
  return ['/event-workspace', 'new', kind];
}

/** Builds the URI-encoded path for a server-generated admin creation link. */
export function adminEventWorkspaceCreationPath(kind: AdminEventWorkspaceKind): string {
  return adminRoutePath(adminEventWorkspaceCreationRoute(kind));
}

/** Builds the raw router commands used by the admin sports workspace. */
export function adminSportsWorkspaceRoute(target: AdminSportsWorkspaceRouteTarget): string[] {
  const route = ['/sports', 'major-event', target.majorEventId];
  if (!target.area || target.area === 'overview') return route;

  route.push(target.area);
  if (target.area === 'categories' && target.categoryId) route.push(target.categoryId);
  if (target.area === 'teams' && target.teamId) route.push(target.teamId);
  if (target.area === 'matches' && target.categoryId) {
    route.push(target.categoryId);
    if (target.matchId) route.push(target.matchId);
  }
  if (target.area === 'reviews' && target.teamId) route.push(target.teamId);
  return route;
}

/** Builds the URI-encoded path for a server-generated admin sports link. */
export function adminSportsWorkspacePath(target: AdminSportsWorkspaceRouteTarget): string {
  return adminRoutePath(adminSportsWorkspaceRoute(target));
}

function adminRoutePath(route: readonly string[]): string {
  return `/${route
    .map((segment, index) => encodeURIComponent(index === 0 ? segment.replace(/^\/+/, '') : segment))
    .join('/')}`;
}
