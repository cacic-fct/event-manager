import { Route } from '@angular/router';
import {
  developmentOnlyGuard,
} from '@cacic-fct/shared-angular';
import {
  attendanceCollectionListGuard,
  attendanceCollectionScannerGuard,
} from './attendance/collection/access.service';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/home-redirect.page').then((m) => m.HomeComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/bottom-navigation/layout').then((m) => m.ToolbarLayoutComponent),
    children: [
      {
        path: 'menu',
        loadComponent: () => import('./menu/page').then((m) => m.MenuComponent),
        title: 'Menu',
        data: { reuseTab: true },
      },
      {
        path: 'calendar',
        loadComponent: () => import('./calendar/calendar-page').then((m) => m.Calendar),
        title: 'Calendário',
        data: { reuseTab: true },
      },
      {
        path: 'major-event',
        loadComponent: () => import('./major-events/list/event-list-page').then((m) => m.MajorEvent),
        title: 'Grandes eventos',
        data: { reuseTab: true },
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/page').then((m) => m.NotificationsTabComponent),
        title: 'Notificações',
        data: { reuseTab: true },
      },
    ],
  },
  {
    path: 'dev-tools',
    loadChildren: () => import('./developer-tools/development-tools.routes').then((m) => m.routes),
    title: 'Ferramentas de desenvolvimento',
    canActivate: [developmentOnlyGuard],
  },
  {
    path: 'auth/error',
    loadComponent: () => import('./auth/error/page').then((m) => m.AuthErrorPage),
    title: 'Erro de login',
  },
  {
    path: 'preview/:previewToken/event',
    loadComponent: () => import('./events/detail/event-page').then((m) => m.Event),
    title: 'Pré-Visualização',
  },
  {
    path: 'preview/:previewToken/major-event',
    loadComponent: () => import('./major-events/list/event-list-page').then((m) => m.MajorEvent),
    title: 'Pré-Visualização',
  },
  {
    path: 'preview/:previewToken/group',
    loadComponent: () => import('./preview/group-page').then((m) => m.GroupPreviewComponent),
    title: 'Pré-Visualização',
  },
  {
    path: 'event/:eventId',
    loadComponent: () => import('./events/detail/event-page').then((m) => m.Event),
    title: 'Evento',
  },
  {
    path: 'major-event/:majorEventId/subscription',
    loadComponent: () => import('./major-events/registration/standard/page').then((m) => m.MajorEventSubscription),
    title: 'Inscrição',
    children: [
      {
        path: 'event/:eventId',
        loadComponent: () => import('./events/detail/event-page').then((m) => m.Event),
        title: 'Informações do evento',
      },
    ],
  },
  {
    path: 'major-event/:majorEventId/ranked-subscription',
    loadComponent: () =>
      import('./major-events/registration/ranked/page').then((m) => m.RankedMajorEventSubscription),
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
        loadComponent: () => import('./events/detail/event-page').then((m) => m.Event),
        title: 'Evento',
      },
    ],
  },
  {
    path: 'major-event/:majorEventId/payment',
    loadComponent: () => import('./major-events/payment/page').then((m) => m.PaymentInfo),
    title: 'Pagamento',
  },
  {
    path: 'attendance/register',
    loadComponent: () =>
      import('./attendance/self-registration/events/event-list-page').then(
        (m) => m.OnlineAttendanceListComponent,
      ),
    title: 'Confirmar presença',
  },
  {
    path: 'attendance/register/:eventId',
    loadComponent: () =>
      import('./attendance/self-registration/code/code-page').then(
        (m) => m.OnlineAttendanceCodeComponent,
      ),
    title: 'Confirmar presença',
  },
  {
    path: 'attendance/collect',
    loadComponent: () => import('./attendance/collection/events/event-list-page').then((m) => m.ScannerEventList),
    title: 'Coletar presenças',
    canActivate: [attendanceCollectionListGuard],
  },
  {
    path: 'attendance/collect/:eventId',
    loadComponent: () => import('./attendance/collection/scanner/scanner-page').then((m) => m.AttendanceScanner),
    title: 'Coletar presença',
    canActivate: [attendanceCollectionScannerGuard],
  },
  {
    path: 'profile',
    loadChildren: () => import('./profile/profile.routes').then((m) => m.routes),
  },
  {
    path: 'preferences',
    loadChildren: () => import('./preferences/preferences.routes').then((m) => m.routes),
    title: 'Preferências',
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
    loadComponent: () => import('./help/page').then((m) => m.Help),
  },
  {
    path: 'validate',
    loadComponent: () => import('./certificates/validation/page').then((m) => m.CertificateValidation),
    title: 'Validar certificado',
  },
  {
    path: 'validate/:certificateId',
    loadComponent: () => import('./certificates/validation/page').then((m) => m.CertificateValidation),
    title: 'Validar certificado',
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
