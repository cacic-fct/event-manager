import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: 'attendances',
    title: 'Participações',
    loadChildren: () => import('./attendances/attendances.routes').then((m) => m.routes),
  },
  {
    path: 'wallet',
    title: 'Crachá',
    loadComponent: () => import('./wallet/wallet').then((m) => m.Wallet),
  },
  {
    path: 'forms/:formId',
    title: 'Formulário',
    loadComponent: () => import('../forms/event-form-page').then((m) => m.EventFormPage),
  },
  {
    path: 'lecturer-profile',
    title: 'Perfil de palestrante',
    loadComponent: () => import('./lecturer-profile/lecturer-profile').then((m) => m.LecturerProfileComponent),
  },
];
