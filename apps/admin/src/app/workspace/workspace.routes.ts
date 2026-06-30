import { Route } from '@angular/router';
import { canValidateReceiptsGuard, workspaceCanReadTabGuard, workspaceSuperAdminGuard } from './workspace.guard';
import { WorkspaceNavLinkId, WorkspaceNavLinkItem, workspaceNavLinkItems } from './workspace-nav';

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

function getWorkspaceRouteData(id: WorkspaceNavLinkId) {
  const item = workspaceNavLinkItems.find((navItem) => navItem.id === id);
  if (!item) {
    throw new Error(`Workspace navigation item ${id} is not registered.`);
  }
  return item;
}

function guardedWorkspaceTabRoute(
  path: string,
  data: WorkspaceNavLinkItem,
  loadComponent: Route['loadComponent'],
): Route[] {
  return [
    {
      path,
      data,
      canMatch: [workspaceCanReadTabGuard],
      loadComponent,
    },
    {
      path,
      data,
      loadComponent: () =>
        import('./workspace-permission-denied.component').then((m) => m.WorkspacePermissionDeniedComponent),
    },
  ];
}

export const workspaceRoutes: Route[] = [
  {
    path: '',
    loadComponent: () => import('./workspace-layout.component').then((m) => m.WorkspaceLayoutComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./home/home').then((m) => m.Home),
      },

      ...guardedWorkspaceTabRoute(eventsData.path, eventsData, () =>
        import('./tabs/events/workspace-events-tab.component').then((m) => m.WorkspaceEventsTabComponent),
      ),
      ...guardedWorkspaceTabRoute(`${eventsData.path}/:eventId`, eventsData, () =>
        import('./tabs/events/workspace-events-tab.component').then((m) => m.WorkspaceEventsTabComponent),
      ),

      ...guardedWorkspaceTabRoute(placesData.path, placesData, () =>
        import('./tabs/places/workspace-places-tab.component').then((m) => m.WorkspacePlacesTabComponent),
      ),
      ...guardedWorkspaceTabRoute(`${placesData.path}/:placeId`, placesData, () =>
        import('./tabs/places/workspace-places-tab.component').then((m) => m.WorkspacePlacesTabComponent),
      ),

      ...guardedWorkspaceTabRoute(groupsData.path, groupsData, () =>
        import('./tabs/event-groups/workspace-event-groups-tab.component').then(
          (m) => m.WorkspaceEventGroupsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${groupsData.path}/:groupId`, groupsData, () =>
        import('./tabs/event-groups/workspace-event-groups-tab.component').then(
          (m) => m.WorkspaceEventGroupsTabComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(majorEventsData.path, majorEventsData, () =>
        import('./tabs/major-events/workspace-major-events-tab.component').then(
          (m) => m.WorkspaceMajorEventsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${majorEventsData.path}/:majorEventId`, majorEventsData, () =>
        import('./tabs/major-events/workspace-major-events-tab.component').then(
          (m) => m.WorkspaceMajorEventsTabComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(publicationData.path, publicationData, () =>
        import('./tabs/publishing/workspace-publishing-tab.component').then(
          (m) => m.WorkspacePublicationTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${publicationData.path}/:targetType/:targetId`, publicationData, () =>
        import('./tabs/publishing/workspace-publishing-tab.component').then(
          (m) => m.WorkspacePublicationTabComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(peopleData.path, peopleData, () =>
        import('./tabs/people/workspace-people-tab.component').then((m) => m.WorkspacePeopleTabComponent),
      ),
      ...guardedWorkspaceTabRoute(`${peopleData.path}/:personId`, peopleData, () =>
        import('./tabs/people/workspace-people-tab.component').then((m) => m.WorkspacePeopleTabComponent),
      ),

      ...guardedWorkspaceTabRoute(mergeCandidatesData.path, mergeCandidatesData, () =>
        import('./tabs/merge-candidates/workspace-merge-candidates-tab.component').then(
          (m) => m.WorkspaceMergeCandidatesTabComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(certificatesData.path, certificatesData, () =>
        import('./tabs/certificates/workspace-certificates-tab.component').then(
          (m) => m.WorkspaceCertificatesTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${certificatesData.path}/:targetType/:targetId`, certificatesData, () =>
        import('./tabs/certificates/workspace-certificates-tab.component').then(
          (m) => m.WorkspaceCertificatesTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${certificatesData.path}/:targetType/:targetId/:configId`, certificatesData, () =>
        import('./tabs/certificates/workspace-certificates-tab.component').then(
          (m) => m.WorkspaceCertificatesTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(formsData.path, formsData, () =>
        import('./tabs/forms/workspace-forms-tab.component').then((m) => m.WorkspaceFormsTabComponent),
      ),
      ...guardedWorkspaceTabRoute(`${formsData.path}/event/:eventId`, formsData, () =>
        import('./tabs/forms/workspace-forms-tab.component').then((m) => m.WorkspaceFormsTabComponent),
      ),
      ...guardedWorkspaceTabRoute(`${formsData.path}/major-event/:majorEventId`, formsData, () =>
        import('./tabs/forms/workspace-forms-tab.component').then((m) => m.WorkspaceFormsTabComponent),
      ),

      ...guardedWorkspaceTabRoute(attendancesData.path, attendancesData, () =>
        import('./tabs/attendances/workspace-attendances-tab.component').then(
          (m) => m.WorkspaceAttendancesTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${attendancesData.path}/event/:eventId`, attendancesData, () =>
        import('./tabs/attendances/workspace-attendances-tab.component').then(
          (m) => m.WorkspaceAttendancesTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${attendancesData.path}/major-event/:majorEventId`, attendancesData, () =>
        import('./tabs/attendances/workspace-attendances-tab.component').then(
          (m) => m.WorkspaceAttendancesTabComponent,
        ),
      ),

      ...guardedWorkspaceTabRoute(subscriptionsData.path, subscriptionsData, () =>
        import('./tabs/subscriptions/workspace-subscriptions-tab.component').then(
          (m) => m.WorkspaceSubscriptionsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(`${subscriptionsData.path}/event/:eventId`, subscriptionsData, () =>
        import('./tabs/subscriptions/workspace-subscriptions-tab.component').then(
          (m) => m.WorkspaceSubscriptionsTabComponent,
        ),
      ),
      {
        path: `${subscriptionsData.path}/major-event/:majorEventId/validate-receipts`,
        data: subscriptionsData,
        canMatch: [canValidateReceiptsGuard],
        loadComponent: () =>
          import('./tabs/subscriptions/receipt-validation/workspace-receipt-validation.component').then(
            (m) => m.WorkspaceReceiptValidationComponent,
          ),
      },
      {
        path: `${subscriptionsData.path}/major-event/:majorEventId/validate-receipts`,
        data: subscriptionsData,
        loadComponent: () =>
          import('./workspace-permission-denied.component').then((m) => m.WorkspacePermissionDeniedComponent),
      },
      ...guardedWorkspaceTabRoute(`${subscriptionsData.path}/major-event/:majorEventId`, subscriptionsData, () =>
        import('./tabs/subscriptions/workspace-subscriptions-tab.component').then(
          (m) => m.WorkspaceSubscriptionsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(permissionsData.path, permissionsData, () =>
        import('./tabs/permissions/workspace-permissions-tab.component').then(
          (m) => m.WorkspacePermissionsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(globalOperationsData.path, globalOperationsData, () =>
        import('./tabs/global-operations/workspace-global-operations-tab.component').then(
          (m) => m.WorkspaceGlobalOperationsTabComponent,
        ),
      ),
      {
        path: auditLogsData.path,
        data: auditLogsData,
        canMatch: [workspaceSuperAdminGuard],
        loadComponent: () =>
          import('./tabs/audit-logs/workspace-audit-logs-tab.component').then(
            (m) => m.WorkspaceAuditLogsTabComponent,
          ),
      },
      {
        path: auditLogsData.path,
        data: auditLogsData,
        loadComponent: () =>
          import('./workspace-permission-denied.component').then((m) => m.WorkspacePermissionDeniedComponent),
      },
      ...guardedWorkspaceTabRoute(notificationsData.path, notificationsData, () =>
        import('./tabs/notifications/workspace-notifications-tab.component').then(
          (m) => m.WorkspaceNotificationsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(preferencesData.path, preferencesData, () =>
        import('./tabs/preferences/workspace-preferences-tab.component').then(
          (m) => m.WorkspacePreferencesTabComponent,
        ),
      ),
    ],
  },
];
