import type { EventTargetType } from '@cacic-fct/event-manager-public-contracts';

/** Raw Angular Router commands; the router escapes the identifier exactly once. */
export function eventInformationRoute(targetType: EventTargetType, targetId: string): string[] {
  return [`/${targetType}`, targetId];
}

/** Canonical information path for server-generated participant links. */
export function eventInformationPath(targetType: EventTargetType, targetId: string): string {
  return `/${targetType}/${encodeURIComponent(targetId)}`;
}
