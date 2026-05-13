import { Route } from '@angular/router';
import { developmentOnlyGuard } from '@cacic-fct/shared-angular';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./landing/home.component').then((m) => m.HomeComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./shared/components/bottom-toolbar/bottom-toolbar.layout').then((m) => m.ToolbarLayoutComponent),
    children: [
      {
        path: 'menu',
        loadComponent: () => import('./tabs/menu/menu.component').then((m) => m.MenuComponent),
        title: 'Menu',
      },
      {
        path: 'calendar',
        loadComponent: () => import('./tabs/calendar/calendar').then((m) => m.Calendar),
        title: 'Calendário',
      },
    ],
  },
  {
    path: 'dev-tools',
    loadChildren: () => import('./development-tools/development-tools.routes').then((m) => m.routes),
    title: 'Ferramentas de Desenvolvimento',
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
      import('./attendance/online-attendance-list.component').then((m) => m.OnlineAttendanceListComponent),
    title: 'Confirmar presença',
  },
  {
    path: 'attendance/register/:eventId',
    loadComponent: () =>
      import('./attendance/online-attendance-code.component').then((m) => m.OnlineAttendanceCodeComponent),
    title: 'Confirmar presença',
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
];
