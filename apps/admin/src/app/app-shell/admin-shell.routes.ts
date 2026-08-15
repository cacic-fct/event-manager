import { Route, type UrlMatcher } from '@angular/router';
import { canValidateReceiptsGuard, canReadFeatureGuard, superAdminGuard } from './access.guard';
import { NavigationLinkId, NavigationLinkItem, navigationLinkItems } from './navigation';
import { sportsWorkspaceMatcher } from '../sports/sports-workspace-routes';

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
const notificationsData = getFeatureRouteData('notifications');
const globalOperationsData = getFeatureRouteData('global-operations');
const permissionsData = getFeatureRouteData('permissions');
const auditLogsData = getFeatureRouteData('audit-logs');
const preferencesData = getFeatureRouteData('preferences');

function getFeatureRouteData(id: NavigationLinkId) {
  const item = navigationLinkItems.find((navItem) => navItem.id === id);
  if (!item) {
    throw new Error(`Workspace navigation item ${id} is not registered.`);
  }
  return item;
}

function guardedFeatureRoute(path: string, data: NavigationLinkItem, loadComponent: Route['loadComponent']): Route[] {
  return [
    {
      path,
      data,
      canMatch: [canReadFeatureGuard],
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

      ...guardedFeatureRoute(eventsData.path, eventsData, () =>
        import('../events/events-page.component').then((m) => m.EventsPageComponent),
      ),
      ...guardedFeatureRoute(`${eventsData.path}/:eventId`, eventsData, () =>
        import('../events/events-page.component').then((m) => m.EventsPageComponent),
      ),

      ...guardedFeatureRoute(placesData.path, placesData, () =>
        import('../places/places-page.component').then((m) => m.PlacesPageComponent),
      ),
      ...guardedFeatureRoute(`${placesData.path}/:placeId`, placesData, () =>
        import('../places/places-page.component').then((m) => m.PlacesPageComponent),
      ),

      ...guardedFeatureRoute(groupsData.path, groupsData, () =>
        import('../event-groups/event-groups-page.component').then((m) => m.EventGroupsPageComponent),
      ),
      ...guardedFeatureRoute(`${groupsData.path}/:groupId`, groupsData, () =>
        import('../event-groups/event-groups-page.component').then((m) => m.EventGroupsPageComponent),
      ),

      ...guardedFeatureRoute(majorEventsData.path, majorEventsData, () =>
        import('../major-events/major-events-page.component').then((m) => m.MajorEventsPageComponent),
      ),
      ...guardedFeatureRoute(`${majorEventsData.path}/:majorEventId`, majorEventsData, () =>
        import('../major-events/major-events-page.component').then((m) => m.MajorEventsPageComponent),
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
      ...guardedFeatureRoute(`${attendancesData.path}/event/:eventId`, attendancesData, () =>
        import('../attendances/attendances-page.component').then((m) => m.AttendancesPageComponent),
      ),
      ...guardedFeatureRoute(`${attendancesData.path}/major-event/:majorEventId`, attendancesData, () =>
        import('../attendances/attendances-page.component').then((m) => m.AttendancesPageComponent),
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
      ...guardedFeatureRoute(permissionsData.path, permissionsData, () =>
        import('../permissions/permissions-page.component').then((m) => m.PermissionsPageComponent),
      ),
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
