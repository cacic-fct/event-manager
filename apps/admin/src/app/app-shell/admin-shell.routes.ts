import { Route, type UrlMatcher, type CanMatchFn } from '@angular/router';
import { canValidateReceiptsGuard, canReadFeatureGuard, canCreateContextGuard, superAdminGuard } from './access.guard';
import { NavigationLinkId, NavigationLinkItem, navigationLinkItems } from './navigation';
import { sportsWorkspaceMatcher } from '../sports/sports-workspace-routes';
import { formsUnsavedChangesGuard } from '../forms/forms-unsaved-changes.guard';
import { prizeDrawsUnsavedChangesGuard } from '../prize-draws/prize-draws-unsaved-changes.guard';
import {
  workspacePendingChangesActivateGuard,
  workspacePendingChangesGuard,
} from './workspace-pending-changes.service';

const eventsData = getFeatureRouteData('events');
const placesData = getFeatureRouteData('places');
const groupsData = getFeatureRouteData('groups');
const majorEventsData = getFeatureRouteData('major-events');
const sportsData = getFeatureRouteData('sports');
const publicationData = getFeatureRouteData('publication');
const peopleData = getFeatureRouteData('people');
const mergeCandidatesData = getFeatureRouteData('merge-candidates');
const certificatesData = getFeatureRouteData('certificates');
const formsData = getFeatureRouteData('forms');
const attendancesData = getFeatureRouteData('attendances');
const subscriptionsData = getFeatureRouteData('subscriptions');
const ticketsData = getFeatureRouteData('tickets');
const notificationsData = getFeatureRouteData('notifications');
const globalOperationsData = getFeatureRouteData('global-operations');
const permissionsData = getFeatureRouteData('permissions');
const auditLogsData = getFeatureRouteData('audit-logs');
const preferencesData = getFeatureRouteData('preferences');
const prizeDrawsData = getFeatureRouteData('prize-draws');

function getFeatureRouteData(id: NavigationLinkId) {
  const item = navigationLinkItems.find((navItem) => navItem.id === id);
  if (!item) {
    throw new Error(`Workspace navigation item ${id} is not registered.`);
  }
  return item;
}

function guardedFeatureRoute(path: string, data: NavigationLinkItem, loadComponent: Route['loadComponent'], guard: CanMatchFn = canReadFeatureGuard): Route[] {
  return [
    {
      path,
      data,
      canMatch: [guard],
      ...(data.id === 'forms' ? {
        canDeactivate: [formsUnsavedChangesGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange' as const,
      } : {}),
      ...(data.id === 'prize-draws' && !path.endsWith('/draw') ? {
        canDeactivate: [prizeDrawsUnsavedChangesGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange' as const,
      } : {}),
      ...(['events', 'groups', 'major-events', 'certificates', 'tickets'].includes(data.id) ? {
        canActivate: [workspacePendingChangesActivateGuard],
        canDeactivate: [workspacePendingChangesGuard],
        runGuardsAndResolvers: 'paramsOrQueryParamsChange' as const,
      } : {}),
      loadComponent,
    },
    {
      path,
      data,
      loadComponent: () => import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
    },
  ];
}

function guardedFeatureMatcher(
  matcher: UrlMatcher,
  data: NavigationLinkItem,
  loadComponent: Route['loadComponent'],
): Route[] {
  return [
    {
      matcher,
      data,
      canMatch: [canReadFeatureGuard],
      canActivate: [workspacePendingChangesActivateGuard],
      canDeactivate: [workspacePendingChangesGuard],
      runGuardsAndResolvers: 'paramsOrQueryParamsChange',
      loadComponent,
    },
    {
      matcher,
      data,
      loadComponent: () => import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
    },
  ];
}

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./admin-shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        loadChildren: () => import('../dashboard/home.routes').then((m) => m.routes),
      },

      { path: 'events', pathMatch: 'full', redirectTo: 'event-workspace' },
      { path: 'events/:id', pathMatch: 'full', redirectTo: 'event-workspace/event/:id' },
      { path: 'groups/:id', pathMatch: 'full', redirectTo: 'event-workspace/group/:id' },
      { path: 'major-events/:id', pathMatch: 'full', redirectTo: 'event-workspace/major-event/:id' },

      {
        path: 'event-workspace',
        pathMatch: 'full',
        loadComponent: () => import('../event-workspace/event-workspace-page.component').then((m) => m.EventWorkspacePageComponent),
      },
      ...guardedFeatureRoute('event-workspace/new/event', eventsData, () =>
        import('../events/events-page.component').then((m) => m.EventsPageComponent),
        canCreateContextGuard,
      ),
      ...guardedFeatureRoute('event-workspace/new/group', groupsData, () =>
        import('../event-groups/event-groups-page.component').then((m) => m.EventGroupsPageComponent),
        canCreateContextGuard,
      ),
      ...guardedFeatureRoute('event-workspace/new/major-event', majorEventsData, () =>
        import('../major-events/major-events-page.component').then((m) => m.MajorEventsPageComponent),
        canCreateContextGuard,
      ),

      {
        path: ticketsData.path,
        pathMatch: 'full',
        data: ticketsData,
        canMatch: [canReadFeatureGuard],
        loadComponent: () => import('../tickets/ticket-admin-landing-page.component').then((m) => m.TicketAdminLandingPageComponent),
      },
      {
        path: ticketsData.path,
        pathMatch: 'full',
        data: ticketsData,
        loadComponent: () => import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
      },
      ...guardedFeatureRoute('tickets/event/:eventId', ticketsData, () =>
        import('../tickets/ticket-admin-page.component').then((m) => m.TicketAdminPageComponent),
      ),
      ...guardedFeatureRoute('tickets/major-event/:majorEventId', ticketsData, () =>
        import('../tickets/ticket-admin-page.component').then((m) => m.TicketAdminPageComponent),
      ),
      ...(['event', 'group', 'major-event'] as const).flatMap((kind) => guardedFeatureMatcher(
        (segments) => (segments.length === 3 || (segments.length === 4 && segments[3].path === 'settings')) && segments[0].path === 'event-workspace' && segments[1].path === kind
          ? { consumed: segments, posParams: { targetType: segments[1], targetId: segments[2], ...(segments[3] ? { section: segments[3] } : {}) } } : null,
        kind === 'event' ? eventsData : kind === 'group' ? groupsData : majorEventsData,
        () => import('../event-workspace/event-workspace-page.component').then((m) => m.EventWorkspacePageComponent),
      )),


      ...guardedFeatureRoute(placesData.path, placesData, () =>
        import('../places/places-page.component').then((m) => m.PlacesPageComponent),
      ),
      ...guardedFeatureRoute(`${placesData.path}/:placeId`, placesData, () =>
        import('../places/places-page.component').then((m) => m.PlacesPageComponent),
      ),



      ...guardedFeatureMatcher(sportsWorkspaceMatcher, sportsData, () =>
        import('../sports/sports-page.component').then((m) => m.SportsPageComponent),
      ),

      ...guardedFeatureRoute(publicationData.path, publicationData, () =>
        import('../publication/publication-page.component').then((m) => m.PublicationPageComponent),
      ),
      ...guardedFeatureRoute(`${publicationData.path}/:targetType/:targetId`, publicationData, () =>
        import('../publication/publication-page.component').then((m) => m.PublicationPageComponent),
      ),

      ...guardedFeatureRoute(peopleData.path, peopleData, () =>
        import('../people/people-page.component').then((m) => m.PeoplePageComponent),
      ),
      ...guardedFeatureRoute(`${peopleData.path}/:personId`, peopleData, () =>
        import('../people/people-page.component').then((m) => m.PeoplePageComponent),
      ),

      ...guardedFeatureRoute(mergeCandidatesData.path, mergeCandidatesData, () =>
        import('../merge-candidates/merge-candidates-page.component').then((m) => m.MergeCandidatesPageComponent),
      ),

      ...guardedFeatureRoute(certificatesData.path, certificatesData, () =>
        import('../certificates/certificates-page.component').then((m) => m.CertificatesPageComponent),
      ),
      ...guardedFeatureRoute(`${certificatesData.path}/:targetType/:targetId`, certificatesData, () =>
        import('../certificates/certificates-page.component').then((m) => m.CertificatesPageComponent),
      ),
      ...guardedFeatureRoute(`${certificatesData.path}/:targetType/:targetId/:configId`, certificatesData, () =>
        import('../certificates/certificates-page.component').then((m) => m.CertificatesPageComponent),
      ),
      ...guardedFeatureRoute(formsData.path, formsData, () =>
        import('../forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),
      ...guardedFeatureRoute(prizeDrawsData.path, prizeDrawsData, () =>
        import('../prize-draws/prize-draws-page.component').then((m) => m.PrizeDrawsPageComponent),
      ),
      ...guardedFeatureRoute(`${prizeDrawsData.path}/:drawId/draw`, prizeDrawsData, () =>
        import('../prize-draws/prize-draw-page.component').then((m) => m.PrizeDrawPageComponent),
      ),
      ...guardedFeatureRoute(`${prizeDrawsData.path}/:drawId`, prizeDrawsData, () =>
        import('../prize-draws/prize-draws-page.component').then((m) => m.PrizeDrawsPageComponent),
      ),
      ...guardedFeatureRoute(`${formsData.path}/:formId`, formsData, () =>
        import('../forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),
      ...guardedFeatureRoute(`${formsData.path}/event/:eventId`, formsData, () =>
        import('../forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),
      ...guardedFeatureRoute(`${formsData.path}/major-event/:majorEventId`, formsData, () =>
        import('../forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),

      ...guardedFeatureRoute(attendancesData.path, attendancesData, () =>
        import('../attendances/attendances-page.component').then((m) => m.AttendancesPageComponent),
      ),
      ...guardedFeatureRoute(`${attendancesData.path}/event/:eventId/oral`, attendancesData, () =>
        import('../attendances/oral/oral-attendance-page.component').then((m) => m.AdminOralAttendancePageComponent),
      ),
      ...guardedFeatureRoute(`${attendancesData.path}/event/:eventId/statistics`, attendancesData, () =>
        import('../attendances/statistics/attendance-statistics-page.component').then(
          (m) => m.AttendanceStatisticsPageComponent,
        ),
      ),
      ...guardedFeatureRoute(`${attendancesData.path}/event/:eventId`, attendancesData, () =>
        import('../attendances/attendances-page.component').then((m) => m.AttendancesPageComponent),
      ),
      ...guardedFeatureRoute(`${attendancesData.path}/major-event/:majorEventId`, attendancesData, () =>
        import('../attendances/attendances-page.component').then((m) => m.AttendancesPageComponent),
      ),
      ...guardedFeatureRoute(`${attendancesData.path}/major-event/:majorEventId/person/:personId`, attendancesData, () =>
        import('../attendances/attendances-page.component').then((m) => m.AttendancesPageComponent),
      ),

      ...guardedFeatureRoute(`${subscriptionsData.path}/event/:eventId/interests`, subscriptionsData, () =>
        import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),
      ...guardedFeatureRoute(`${subscriptionsData.path}/major-event/:majorEventId/interests`, subscriptionsData, () =>
        import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),
      ...guardedFeatureRoute(`${subscriptionsData.path}/group/:groupId/interests`, subscriptionsData, () =>
        import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),

      ...guardedFeatureRoute(`${subscriptionsData.path}/interests`, subscriptionsData, () =>
        import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),
      ...guardedFeatureRoute(subscriptionsData.path, subscriptionsData, () =>
        import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),
      ...guardedFeatureRoute(`${subscriptionsData.path}/event/:eventId`, subscriptionsData, () =>
        import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),
      {
        path: `${subscriptionsData.path}/major-event/:majorEventId/validate-receipts`,
        data: subscriptionsData,
        canMatch: [canValidateReceiptsGuard],
        loadComponent: () =>
          import('../subscriptions/receipt-validation/receipt-validation-page.component').then(
            (m) => m.ReceiptValidationPageComponent,
          ),
      },
      {
        path: `${subscriptionsData.path}/major-event/:majorEventId/validate-receipts`,
        data: subscriptionsData,
        loadComponent: () => import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
      },
      ...guardedFeatureRoute(
        `${subscriptionsData.path}/major-event/:majorEventId/subscription/:subscriptionId`,
        subscriptionsData,
        () => import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),
      ...guardedFeatureRoute(`${subscriptionsData.path}/major-event/:majorEventId`, subscriptionsData, () =>
        import('../subscriptions/subscriptions-page.component').then((m) => m.SubscriptionsPageComponent),
      ),
      {
        path: permissionsData.path,
        data: permissionsData,
        canMatch: [canReadFeatureGuard],
        loadChildren: () => import('../permissions/permissions.routes').then((m) => m.routes),
      },
      {
        path: permissionsData.path,
        data: permissionsData,
        loadComponent: () => import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
      },
      ...guardedFeatureRoute(globalOperationsData.path, globalOperationsData, () =>
        import('../global-operations/global-operations-page.component').then((m) => m.GlobalOperationsPageComponent),
      ),
      {
        path: auditLogsData.path,
        data: auditLogsData,
        canMatch: [superAdminGuard],
        loadComponent: () => import('../audit-logs/audit-logs-page.component').then((m) => m.AuditLogsPageComponent),
      },
      {
        path: auditLogsData.path,
        data: auditLogsData,
        loadComponent: () => import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
      },
      ...guardedFeatureRoute(notificationsData.path, notificationsData, () =>
        import('../notifications/notifications-page.component').then((m) => m.NotificationsPageComponent),
      ),
      ...guardedFeatureRoute(preferencesData.path, preferencesData, () =>
        import('../preferences/preferences-page.component').then((m) => m.PreferencesPageComponent),
      ),
    ],
  },
];
