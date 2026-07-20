import { Route } from '@angular/router';
import { canValidateReceiptsGuard, canReadFeatureGuard, superAdminGuard } from './access.guard';
import { NavigationLinkId, NavigationLinkItem, navigationLinkItems } from './navigation';

const eventsData = getWorkspaceRouteData('events');
const placesData = getWorkspaceRouteData('places');
const groupsData = getWorkspaceRouteData('groups');
const majorEventsData = getWorkspaceRouteData('major-events');
const publicationData = getWorkspaceRouteData('publication');
const peopleData = getWorkspaceRouteData('people');
const mergeCandidatesData = getWorkspaceRouteData('merge-candidates');
const certificatesData = getWorkspaceRouteData('certificates');
const formsData = getWorkspaceRouteData('forms');
const attendancesData = getWorkspaceRouteData('attendances');
const subscriptionsData = getWorkspaceRouteData('subscriptions');
const notificationsData = getWorkspaceRouteData('notifications');
const globalOperationsData = getWorkspaceRouteData('global-operations');
const permissionsData = getWorkspaceRouteData('permissions');
const auditLogsData = getWorkspaceRouteData('audit-logs');
const preferencesData = getWorkspaceRouteData('preferences');

function getWorkspaceRouteData(id: NavigationLinkId) {
  const item = navigationLinkItems.find((navItem) => navItem.id === id);
  if (!item) {
    throw new Error(`Workspace navigation item ${id} is not registered.`);
  }
  return item;
}

function guardedWorkspaceTabRoute(
  path: string,
  data: NavigationLinkItem,
  loadComponent: Route['loadComponent'],
): Route[] {
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
      loadComponent: () =>
        import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
    },
  ];
}

export const routes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./shell.component').then((m) => m.AdminShellComponent),
    children: [
      {
        path: '',
        loadChildren: () => import('../home/home.routes').then((m) => m.routes),
      },

      ...guardedWorkspaceTabRoute(eventsData.path, eventsData, () =>
        import('../features/events/events-page.component').then((m) => m.EventsPageComponent),
      ),
      ...guardedWorkspaceTabRoute(`${eventsData.path}/:eventId`, eventsData, () =>
        import('../features/events/events-page.component').then((m) => m.EventsPageComponent),
      ),

      ...guardedWorkspaceTabRoute(placesData.path, placesData, () =>
        import('../features/places/places-page.component').then((m) => m.PlacesPageComponent),
      ),
      ...guardedWorkspaceTabRoute(`${placesData.path}/:placeId`, placesData, () =>
        import('../features/places/places-page.component').then((m) => m.PlacesPageComponent),
      ),

      ...guardedWorkspaceTabRoute(groupsData.path, groupsData, () =>
        import('../features/event-groups/event-groups-page.component').then(
          (m) => m.EventGroupsPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${groupsData.path}/:groupId`, groupsData, () =>
        import('../features/event-groups/event-groups-page.component').then(
          (m) => m.EventGroupsPageComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(majorEventsData.path, majorEventsData, () =>
        import('../features/major-events/major-events-page.component').then(
          (m) => m.MajorEventsPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${majorEventsData.path}/:majorEventId`, majorEventsData, () =>
        import('../features/major-events/major-events-page.component').then(
          (m) => m.MajorEventsPageComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(publicationData.path, publicationData, () =>
        import('../features/publication/publication-page.component').then(
          (m) => m.PublicationPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${publicationData.path}/:targetType/:targetId`, publicationData, () =>
        import('../features/publication/publication-page.component').then(
          (m) => m.PublicationPageComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(peopleData.path, peopleData, () =>
        import('../features/people/people-page.component').then((m) => m.PeoplePageComponent),
      ),
      ...guardedWorkspaceTabRoute(`${peopleData.path}/:personId`, peopleData, () =>
        import('../features/people/people-page.component').then((m) => m.PeoplePageComponent),
      ),

      ...guardedWorkspaceTabRoute(mergeCandidatesData.path, mergeCandidatesData, () =>
        import('../features/merge-candidates/merge-candidates-page.component').then(
          (m) => m.MergeCandidatesPageComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(certificatesData.path, certificatesData, () =>
        import('../features/certificates/certificates-page.component').then(
          (m) => m.CertificatesPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${certificatesData.path}/:targetType/:targetId`, certificatesData, () =>
        import('../features/certificates/certificates-page.component').then(
          (m) => m.CertificatesPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${certificatesData.path}/:targetType/:targetId/:configId`, certificatesData, () =>
        import('../features/certificates/certificates-page.component').then(
          (m) => m.CertificatesPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(formsData.path, formsData, () =>
        import('../features/forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),
      ...guardedWorkspaceTabRoute(`${formsData.path}/:formId`, formsData, () =>
        import('../features/forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),
      ...guardedWorkspaceTabRoute(`${formsData.path}/event/:eventId`, formsData, () =>
        import('../features/forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),
      ...guardedWorkspaceTabRoute(`${formsData.path}/major-event/:majorEventId`, formsData, () =>
        import('../features/forms/forms-page.component').then((m) => m.FormsPageComponent),
      ),

      ...guardedWorkspaceTabRoute(attendancesData.path, attendancesData, () =>
        import('../features/attendances/attendances-page.component').then(
          (m) => m.AttendancesPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${attendancesData.path}/event/:eventId`, attendancesData, () =>
        import('../features/attendances/attendances-page.component').then(
          (m) => m.AttendancesPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${attendancesData.path}/major-event/:majorEventId`, attendancesData, () =>
        import('../features/attendances/attendances-page.component').then(
          (m) => m.AttendancesPageComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(subscriptionsData.path, subscriptionsData, () =>
        import('../features/subscriptions/subscriptions-page.component').then(
          (m) => m.SubscriptionsPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${subscriptionsData.path}/event/:eventId`, subscriptionsData, () =>
        import('../features/subscriptions/subscriptions-page.component').then(
          (m) => m.SubscriptionsPageComponent,
        ),
      ),
      {
        path: `${subscriptionsData.path}/major-event/:majorEventId/validate-receipts`,
        data: subscriptionsData,
        canMatch: [canValidateReceiptsGuard],
        loadComponent: () =>
          import('../features/subscriptions/receipt-validation/receipt-validation-page.component').then(
            (m) => m.ReceiptValidationPageComponent,
          ),
      },
      {
        path: `${subscriptionsData.path}/major-event/:majorEventId/validate-receipts`,
        data: subscriptionsData,
        loadComponent: () =>
          import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
      },
      ...guardedWorkspaceTabRoute(`${subscriptionsData.path}/major-event/:majorEventId`, subscriptionsData, () =>
        import('../features/subscriptions/subscriptions-page.component').then(
          (m) => m.SubscriptionsPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(permissionsData.path, permissionsData, () =>
        import('../features/permissions/permissions-page.component').then(
          (m) => m.PermissionsPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(globalOperationsData.path, globalOperationsData, () =>
        import('../features/global-operations/global-operations-page.component').then(
          (m) => m.GlobalOperationsPageComponent,
        ),
      ),
      {
        path: auditLogsData.path,
        data: auditLogsData,
        canMatch: [superAdminGuard],
        loadComponent: () =>
          import('../features/audit-logs/audit-logs-page.component').then(
            (m) => m.AuditLogsPageComponent,
          ),
      },
      {
        path: auditLogsData.path,
        data: auditLogsData,
        loadComponent: () =>
          import('./permission-denied.component').then((m) => m.PermissionDeniedComponent),
      },
      ...guardedWorkspaceTabRoute(notificationsData.path, notificationsData, () =>
        import('../features/notifications/notifications-page.component').then(
          (m) => m.NotificationsPageComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(preferencesData.path, preferencesData, () =>
        import('../features/preferences/preferences-page.component').then(
          (m) => m.PreferencesPageComponent,
        ),
      ),
    ],
  },
];
