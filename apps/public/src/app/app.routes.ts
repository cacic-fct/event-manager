import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: 'development-tools',
    loadChildren: () =>
      import('./development-tools/development-tools.routes').then(
        (m) => m.routes,
      ),
    title: 'Ferramentas de Desenvolvimento',
  },
  {
    path: '',
    loadComponent: () =>
      import('./shared/components/bottom-toolbar/bottom-toolbar.layout').then(
        (m) => m.ToolbarLayoutComponent,
      ),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'menu',
      },
      {
        path: 'menu',
        loadComponent: () =>
          import('./tabs/menu/menu.component').then((m) => m.MenuComponent),
        title: 'Menu',
      },
      {
        path: 'calendar',
        loadComponent: () =>
          import('./tabs/calendar/calendar').then((m) => m.Calendar),
        title: 'Calendário',
      },
    ],
  },
  {
    path: 'event/:eventId',
    loadComponent: () => import('./event/event').then((m) => m.Event),
    title: 'Evento',
  },
  {
    path: 'home',
    loadComponent: () =>
      import('./landing/login-page.component').then(
        (m) => m.LoginPageComponent,
      ),
  },
  {
    path: 'profile',
    loadChildren: () =>
      import('./profile/profile.routes').then((m) => m.routes),
  },
  {
    path: 'about',
    loadChildren: () => import('./about/about.routes').then((m) => m.routes),
  },
  {
    path: 'validate',
    loadComponent: () =>
      import('./certificate-validation/certificate-validation').then(
        (m) => m.CertificateValidation,
      ),
  },
  {
    path: 'validate/:certificateId',
    loadComponent: () =>
      import('./certificate-validation/certificate-validation').then(
        (m) => m.CertificateValidation,
      ),
  },
  {
    path: 'validar',
    redirectTo: 'validate',
  },
  {
    path: 'validar/:certificateId',
    redirectTo: 'validate/:certificateId',
  },
];
