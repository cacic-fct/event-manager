import { inject } from '@angular/core';
import { Route, Router } from '@angular/router';
import { authGuard } from '@cacic-fct/shared-angular';
import { eventInformationRoute } from '@cacic-fct/shared-utils';

const legacyDetailRoutes: Route[] = (['event', 'event-group', 'major-event'] as const).map((targetType) => ({
  path: `${targetType}/:eventId`,
  pathMatch: 'full',
  redirectTo: ({ params, queryParams, fragment }) =>
    inject(Router).createUrlTree(eventInformationRoute(targetType, params['eventId']), {
      queryParams,
      fragment: fragment ?? undefined,
    }),
}));

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./list/attendances').then((m) => m.Attendances),
  },
  {
    path: ':eventType/:eventId/organizer',
    canActivate: [authGuard],
    canDeactivate: [(component: { canDeactivate(): Promise<boolean> }) => component.canDeactivate()],
    loadComponent: () => import('./organizer-info/organizer-info').then((m) => m.OrganizerInfoComponent),
  },
  ...legacyDetailRoutes,
];
