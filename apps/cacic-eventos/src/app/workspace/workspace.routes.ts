/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { Route } from '@angular/router';
import { workspaceCanReadTabGuard } from './workspace.guard';
import { workspaceNavItems } from './workspace-nav';

const eventsData = getWorkspaceRouteData('events');
const groupsData = getWorkspaceRouteData('groups');
const majorEventsData = getWorkspaceRouteData('major-events');
const peopleData = getWorkspaceRouteData('people');
const mergeCandidatesData = getWorkspaceRouteData('merge-candidates');
const certificatesData = getWorkspaceRouteData('certificates');
const attendancesData = getWorkspaceRouteData('attendances');
const subscriptionsData = getWorkspaceRouteData('subscriptions');
const permissionsData = getWorkspaceRouteData('permissions');

function getWorkspaceRouteData(id: (typeof workspaceNavItems)[number]['id']) {
  return workspaceNavItems.find((item) => item.id === id)!;
}

function guardedWorkspaceTabRoute(
  path: string,
  data: (typeof workspaceNavItems)[number],
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
        import('./workspace-permission-denied.component').then(
          (m) => m.WorkspacePermissionDeniedComponent,
        ),
    },
  ];
}

export const workspaceRoutes: Route[] = [
  {
    path: '',
    loadComponent: () =>
      import('./workspace-layout.component').then(
        (m) => m.WorkspaceLayoutComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () => import('./home/home').then((m) => m.Home),
      },

      ...guardedWorkspaceTabRoute(eventsData.path, eventsData, () =>
        import('./tabs/events/workspace-events-tab.component').then(
          (m) => m.WorkspaceEventsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(
        `${eventsData.path}/:eventId`,
        eventsData,
        () =>
          import('./tabs/events/workspace-events-tab.component').then(
            (m) => m.WorkspaceEventsTabComponent,
          ),
      ),

      ...guardedWorkspaceTabRoute(groupsData.path, groupsData, () =>
        import('./tabs/event-groups/workspace-event-groups-tab.component').then(
          (m) => m.WorkspaceEventGroupsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(
        `${groupsData.path}/:groupId`,
        groupsData,
        () =>
          import(
            './tabs/event-groups/workspace-event-groups-tab.component'
          ).then((m) => m.WorkspaceEventGroupsTabComponent),
      ),

      ...guardedWorkspaceTabRoute(majorEventsData.path, majorEventsData, () =>
        import('./tabs/major-events/workspace-major-events-tab.component').then(
          (m) => m.WorkspaceMajorEventsTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(
        `${majorEventsData.path}/:majorEventId`,
        majorEventsData,
        () =>
          import(
            './tabs/major-events/workspace-major-events-tab.component'
          ).then((m) => m.WorkspaceMajorEventsTabComponent),
      ),

      ...guardedWorkspaceTabRoute(peopleData.path, peopleData, () =>
        import('./tabs/people/workspace-people-tab.component').then(
          (m) => m.WorkspacePeopleTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(
        `${peopleData.path}/:personId`,
        peopleData,
        () =>
          import('./tabs/people/workspace-people-tab.component').then(
            (m) => m.WorkspacePeopleTabComponent,
          ),
      ),

      ...guardedWorkspaceTabRoute(
        mergeCandidatesData.path,
        mergeCandidatesData,
        () =>
          import(
            './tabs/merge-candidates/workspace-merge-candidates-tab.component'
          ).then((m) => m.WorkspaceMergeCandidatesTabComponent),
      ),

      ...guardedWorkspaceTabRoute(certificatesData.path, certificatesData, () =>
        import('./tabs/certificates/workspace-certificates-tab.component').then(
          (m) => m.WorkspaceCertificatesTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(
        `${certificatesData.path}/:targetType/:targetId`,
        certificatesData,
        () =>
          import(
            './tabs/certificates/workspace-certificates-tab.component'
          ).then((m) => m.WorkspaceCertificatesTabComponent),
      ),
      ...guardedWorkspaceTabRoute(
        `${certificatesData.path}/:targetType/:targetId/:configId`,
        certificatesData,
        () =>
          import(
            './tabs/certificates/workspace-certificates-tab.component'
          ).then((m) => m.WorkspaceCertificatesTabComponent),
      ),

      ...guardedWorkspaceTabRoute(attendancesData.path, attendancesData, () =>
        import('./tabs/attendances/workspace-attendances-tab.component').then(
          (m) => m.WorkspaceAttendancesTabComponent,
        ),
      ),
      ...guardedWorkspaceTabRoute(
        `${attendancesData.path}/event/:eventId`,
        attendancesData,
        () =>
          import('./tabs/attendances/workspace-attendances-tab.component').then(
            (m) => m.WorkspaceAttendancesTabComponent,
          ),
      ),
      ...guardedWorkspaceTabRoute(
        `${attendancesData.path}/major-event/:majorEventId`,
        attendancesData,
        () =>
          import('./tabs/attendances/workspace-attendances-tab.component').then(
            (m) => m.WorkspaceAttendancesTabComponent,
          ),
      ),

      ...guardedWorkspaceTabRoute(
        subscriptionsData.path,
        subscriptionsData,
        () =>
          import(
            './tabs/subscriptions/workspace-subscriptions-tab.component'
          ).then((m) => m.WorkspaceSubscriptionsTabComponent),
      ),
      ...guardedWorkspaceTabRoute(
        `${subscriptionsData.path}/event/:eventId`,
        subscriptionsData,
        () =>
          import(
            './tabs/subscriptions/workspace-subscriptions-tab.component'
          ).then((m) => m.WorkspaceSubscriptionsTabComponent),
      ),
      ...guardedWorkspaceTabRoute(
        `${subscriptionsData.path}/major-event/:majorEventId`,
        subscriptionsData,
        () =>
          import(
            './tabs/subscriptions/workspace-subscriptions-tab.component'
          ).then((m) => m.WorkspaceSubscriptionsTabComponent),
      ),

      ...guardedWorkspaceTabRoute(permissionsData.path, permissionsData, () =>
        import('./tabs/permissions/workspace-permissions-tab.component').then(
          (m) => m.WorkspacePermissionsTabComponent,
        ),
      ),
    ],
  },
];
