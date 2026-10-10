import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { DefaultUrlSerializer, Router, provideRouter, UrlSegment, type Route } from '@angular/router';
import { routes } from '../app-shell/admin-shell.routes';
import { contextOperations } from './event-workspace-context.service';

const children = routes[0].children ?? [];
const serializer = new DefaultUrlSerializer();

function matchingRoute(path: string): Route | undefined {
  const segments = path.split('/').filter(Boolean).map((part) => new UrlSegment(part, {}));
  return children.find((route) => route.matcher?.(segments, serializer.parse('/').root, route));
}

@Component({ template: 'Resource' })
class RedirectDestination {}

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

  it.each([
    ['events', 'event-workspace'],
    ['events/:id', 'event-workspace/event/:id'],
    ['groups/:id', 'event-workspace/group/:id'],
    ['major-events/:id', 'event-workspace/major-event/:id'],
  ])('redirects legacy %s links to their canonical destination', (path, redirectTo) => {
    expect(children.find((route) => route.path === path)).toEqual({ path, pathMatch: 'full', redirectTo });
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
