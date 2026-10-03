import { DefaultUrlSerializer, UrlSegment, type Route } from '@angular/router';
import { routes } from '../app-shell/admin-shell.routes';
import { contextOperations } from './event-workspace-context.service';

const children = routes[0].children ?? [];
const serializer = new DefaultUrlSerializer();

function matchingRoute(path: string): Route | undefined {
  const segments = path.split('/').filter(Boolean).map((part) => new UrlSegment(part, {}));
  return children.find((route) => route.matcher?.(segments, serializer.parse('/').root, route));
}

describe('canonical event workspace routes', () => {
  it.each(['event', 'group', 'major-event'] as const)('keeps the canonical %s entry and settings routes', (kind) => {
    const overview = `/event-workspace/${kind}/record-1`;
    const settings = `${overview}/settings`;
    expect(matchingRoute(overview)).toBeDefined();
    expect(matchingRoute(settings)).toBeDefined();
    expect(matchingRoute(`${overview}/unknown`)).toBeUndefined();
    const operations = contextOperations({ kind, id: 'record-1' });
    expect(operations.find((operation) => operation.id === 'settings')?.path.join('/')).toBe(settings);
    expect(operations.find((operation) => operation.id === 'overview')?.path.join('/')).toBe(kind === 'event' ? undefined : overview);
  });

  it('does not register the removed editor aliases or compatibility redirects', () => {
    expect(children.filter((route) => /^(events|groups|major-events)(\/|$)/.test(route.path ?? ''))).toEqual([]);
    expect(children.filter((route) => route.redirectTo)).toEqual([]);
  });

  it('registers the global ticket picker and event-scoped ticket workspaces', () => {
    expect(children.some((route) => route.path === 'tickets' && route.pathMatch === 'full')).toBe(true);
    expect(children.some((route) => route.path === 'tickets/event/:eventId')).toBe(true);
    expect(children.some((route) => route.path === 'tickets/major-event/:majorEventId')).toBe(true);
  });
});
