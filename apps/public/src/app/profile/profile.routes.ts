import { Route } from '@angular/router';

export const routes: Route[] = [
  {
    path: 'attendances',
    title: 'Participações',
    loadChildren: () => import('./attendance/attendance.routes').then((m) => m.routes),
  },
  {
    path: 'wallet',
    title: 'Crachá',
    loadComponent: () => import('./wallet/pages/wallet/wallet').then((m) => m.Wallet),
  },
  {
    path: 'wallet/add-card',
    title: 'Adicionar cartão',
    loadComponent: () => import('./wallet/pages/add-card/add-card').then((m) => m.WalletAddCard),
  },
  {
    path: 'wallet/add-card/restaurant',
    title: 'Cartão do R.U.',
    loadComponent: () =>
      import('./wallet/pages/restaurant-card-enrollment/restaurant-card-enrollment').then((m) => m.RestaurantCardEnrollment),
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
