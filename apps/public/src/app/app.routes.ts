import { Route } from '@angular/router';
import { developmentOnlyGuard, redirectAuthenticatedGuard } from '@cacic-fct/shared-angular';
import {
  attendanceCollectionListGuard,
  attendanceCollectionScannerGuard,
} from './attendance/collection/attendance-collection-access.service';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [redirectAuthenticatedGuard(['/calendar'])],
    loadComponent: () => import('./landing/home.component').then((m) => m.HomeComponent),
  },
  {
    path: '',
    loadComponent: () => import('./tabs/bottom-toolbar/bottom-toolbar.layout').then((m) => m.ToolbarLayoutComponent),
    children: [
      {
        path: 'menu',
        loadComponent: () => import('./tabs/menu/menu.component').then((m) => m.MenuComponent),
        title: 'Menu',
        data: { reuseTab: true },
      },
      {
        path: 'calendar',
        loadComponent: () => import('./tabs/calendar/calendar').then((m) => m.Calendar),
        title: 'Calendário',
        data: { reuseTab: true },
      },
      {
        path: 'major-event',
        loadComponent: () => import('./major-event/major-event').then((m) => m.MajorEvent),
        title: 'Grandes eventos',
        data: { reuseTab: true },
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./tabs/notifications/notifications-tab.component').then((m) => m.NotificationsTabComponent),
        title: 'Notificações',
        data: { reuseTab: true },
      },
    ],
  },
  {
    path: 'dev-tools',
    loadChildren: () => import('./development-tools/development-tools.routes').then((m) => m.routes),
    title: 'Ferramentas de desenvolvimento',
    canActivate: [developmentOnlyGuard],
  },
  {
    path: 'event/:eventId',
    loadComponent: () => import('./event/event').then((m) => m.Event),
    title: 'Evento',
  },
  {
    path: 'major-event/:majorEventId/subscription',
    loadComponent: () => import('./major-event/subscription/subscription').then((m) => m.MajorEventSubscription),
    title: 'Inscrição',
    children: [
      {
        path: 'event/:eventId',
        loadComponent: () => import('./event/event').then((m) => m.Event),
        title: 'Informações do evento',
      },
    ],
  },
  {
    path: 'major-event/:majorEventId/ranked-subscription',
    loadComponent: () =>
      import('./major-event/subscription/ranked-subscription').then((m) => m.RankedMajorEventSubscription),
    title: 'Inscrição',
    children: [
      {
        path: 'select',
        pathMatch: 'full',
        redirectTo: '',
      },
      {
        path: 'rank',
        pathMatch: 'full',
        redirectTo: '',
      },
      {
        path: 'event/:eventId',
        loadComponent: () => import('./event/event').then((m) => m.Event),
        title: 'Evento',
      },
    ],
  },
  {
    path: 'major-event/:majorEventId/payment',
    loadComponent: () => import('./major-event/payment/payment-info').then((m) => m.PaymentInfo),
    title: 'Pagamento',
  },
  {
    path: 'attendance/register',
    loadComponent: () =>
      import('./attendance/online-attendance/online-attendance-list.component').then(
        (m) => m.OnlineAttendanceListComponent,
      ),
    title: 'Confirmar presença',
  },
  {
    path: 'attendance/register/:eventId',
    loadComponent: () =>
      import('./attendance/online-attendance/online-attendance-code.component').then(
        (m) => m.OnlineAttendanceCodeComponent,
      ),
    title: 'Confirmar presença',
  },
  {
    path: 'attendance/collect',
    loadComponent: () => import('./attendance/collection/scanner-event-list').then((m) => m.ScannerEventList),
    title: 'Coletar presenças',
    canActivate: [attendanceCollectionListGuard],
  },
  {
    path: 'attendance/collect/:eventId',
    loadComponent: () => import('./attendance/collection/attendance-scanner').then((m) => m.AttendanceScanner),
    title: 'Coletar presença',
    canActivate: [attendanceCollectionScannerGuard],
  },
  {
    path: 'profile',
    loadChildren: () => import('./profile/profile.routes').then((m) => m.routes),
  },
  {
    path: 'about',
    loadChildren: () => import('./about/about.routes').then((m) => m.routes),
  },
  {
    path: 'humans.txt',
    redirectTo: 'about',
  },
  {
    path: 'help',
    loadComponent: () => import('./help/help').then((m) => m.Help),
  },
  {
    path: 'validate',
    loadComponent: () => import('./certificate-validation/certificate-validation').then((m) => m.CertificateValidation),
  },
  {
    path: 'validate/:certificateId',
    loadComponent: () => import('./certificate-validation/certificate-validation').then((m) => m.CertificateValidation),
  },
  {
    path: 'validar',
    redirectTo: '/validate',
  },
  {
    path: 'validar/:certificateId',
    redirectTo: '/validate/:certificateId',
  },
  {
    path: 'legal',
    redirectTo: '/about/legal',
  },
  {
    path: 'licenses',
    redirectTo: '/about/legal',
  },
];
