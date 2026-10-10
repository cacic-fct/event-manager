import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { Router, provideRouter, type Route } from '@angular/router';
import { routes } from '../app-shell/admin-shell.routes';
import { contextOperations } from './event-workspace-context.service';

const children = routes[0].children ?? [];

function matchingRoute(path: string): Route | undefined {
  const segments = path.split('/').filter(Boolean);
  return children.find((route) => {
    const routeSegments = route.path?.split('/').filter(Boolean);
    return routeSegments?.length === segments.length && routeSegments.every((segment, index) =>
      segment.startsWith(':') || segment === segments[index],
    );
  });
}

@Component({ template: 'Resource' })
class RedirectDestination {}

describe('canonical event workspace routes', () => {
  it.each(['event', 'group', 'major-event'] as const)('keeps the canonical %s entry and settings routes', (kind) => {
    const overview = `/event-workspace/${kind}/record-1`;
    const settings = `${overview}/settings`;
    expect(matchingRoute(overview)?.data).toMatchObject({ targetType: kind });
    expect(matchingRoute(settings)?.data).toMatchObject({ targetType: kind, section: 'settings' });
    expect(matchingRoute(`${overview}/unknown`)).toBeUndefined();
    const operations = contextOperations({ kind, id: 'record-1' });
    expect(operations.find((operation) => operation.id === 'settings')?.path.join('/')).toBe(settings);
    expect(operations.find((operation) => operation.id === 'overview')?.path.join('/')).toBe(kind === 'event' ? undefined : overview);
  });

  it.each([
    ['events', 'event-workspace'],
    ['events/:id', 'event-workspace/event/:id'],
    ['groups/:id', 'event-workspace/group/:id'],
    ['major-events/:id', 'event-workspace/major-event/:id'],
  ])('redirects legacy %s links to their canonical destination', (path, redirectTo) => {
    expect(children.find((route) => route.path === path)).toEqual({ path, pathMatch: 'full', redirectTo });
  });

  it('registers the global ticket picker and event-scoped ticket workspaces', () => {
    expect(children.some((route) => route.path === 'tickets' && route.pathMatch === 'full')).toBe(true);
    expect(children.some((route) => route.path === 'tickets/event/:eventId')).toBe(true);
    expect(children.some((route) => route.path === 'tickets/major-event/:majorEventId')).toBe(true);
  });

  it.each([
    ['/events', '/event-workspace'],
    ['/events/event-1', '/event-workspace/event/event-1'],
    ['/groups/group-1', '/event-workspace/group/group-1'],
    ['/major-events/major-1', '/event-workspace/major-event/major-1'],
  ])('opens legacy bookmark %s with its URL state', async (legacy, canonical) => {
    TestBed.configureTestingModule({ providers: [provideRouter([
      ...children.filter((route) => route.redirectTo),
      { path: 'event-workspace', component: RedirectDestination },
      { path: 'event-workspace/:kind/:id', component: RedirectDestination },
    ])] });
    await RouterTestingHarness.create(`${legacy}?source=calendar#details`);
    expect(TestBed.inject(Router).url).toBe(`${canonical}?source=calendar#details`);
  });
});
