import { Route } from '@angular/router';
import { authGuard } from '@cacic-fct/shared-angular';

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
    path: 'wallet/tickets/:ticketId/transfer',
    title: 'Transferir bilhete',
    canActivate: [authGuard],
    loadComponent: () => import('./ticketing/ticket-transfer-start-page').then((m) => m.TicketTransferStartPage),
  },
  {
    path: 'wallet/tickets/:ticketId',
    title: 'Informações do bilhete',
    canActivate: [authGuard],
    loadComponent: () => import('./ticketing/ticket-details-page').then((m) => m.TicketDetailsPage),
  },
  {
    path: 'wallet/ticket-transfers',
    title: 'Transferência de bilhetes',
    canActivate: [authGuard],
    loadComponent: () => import('./ticketing/ticket-transfers-page').then((m) => m.TicketTransfersPage),
  },
  {
    path: 'wallet/ticket-transfers/:transferId',
    title: 'Pedido de transferência',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./ticketing/ticket-transfer-details-page').then((m) => m.TicketTransferDetailsPage),
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
