import { Route } from '@angular/router';
import { authGuard, developmentOnlyGuard } from '@cacic-fct/shared-angular';
import {
  attendanceCollectionListGuard,
  attendanceCollectionScannerGuard,
} from './attendance/collection/access.service';
import { myDayFeatureGuard } from './my-day/my-day.guard';

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
        loadComponent: () => import('./menu/menu.component').then((m) => m.MenuComponent),
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
        path: 'my-day',
        loadComponent: () => import('./my-day/my-day.page').then((m) => m.MyDayPage),
        title: 'Meu dia',
        data: { reuseTab: true },
        canActivate: [myDayFeatureGuard],
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./notifications/notifications-tab.component').then((m) => m.NotificationsTabComponent),
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
    loadComponent: () => import('./auth/error/auth-error-page').then((m) => m.AuthErrorPage),
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
    path: 'draws/event/:eventId',
    canActivate: [authGuard],
    loadComponent: () => import('./prize-draws/prize-draw-page').then((m) => m.PublicPrizeDrawPage),
    title: 'Sorteios',
    data: { targetType: 'EVENT' },
  },
  {
    path: 'draws/event-group/:eventGroupId',
    canActivate: [authGuard],
    loadComponent: () => import('./prize-draws/prize-draw-page').then((m) => m.PublicPrizeDrawPage),
    title: 'Sorteios',
    data: { targetType: 'EVENT_GROUP' },
  },
  {
    path: 'draws/major-event/:majorEventId',
    canActivate: [authGuard],
    loadComponent: () => import('./prize-draws/prize-draw-page').then((m) => m.PublicPrizeDrawPage),
    title: 'Sorteios',
    data: { targetType: 'MAJOR_EVENT' },
  },
  {
    path: 'map',
    loadComponent: () => import('./map/public-map-page').then((m) => m.PublicMapPage),
    title: 'Mapa de eventos',
  },
  {
    path: 'tournament/:tournamentId/subscribe',
    loadComponent: () => import('./sports/operations/self-subscription-page').then((m) => m.SportsSelfSubscriptionPage),
    title: 'Inscrição no torneio',
  },
  {
    path: 'tournament/:tournamentId',
    loadComponent: () => import('./sports/viewer/tournament-page').then((m) => m.SportsTournamentPage),
    title: 'Torneio',
  },
  {
    path: 'sports/match/:matchId',
    loadComponent: () => import('./sports/viewer/match-page').then((m) => m.SportsMatchPage),
    title: 'Partida',
  },
  {
    path: 'sports/operate/:matchId',
    loadComponent: () => import('./sports/operations/official-match-page').then((m) => m.OfficialSportsMatchPage),
    title: 'Operar partida',
  },
  {
    path: 'sports/team/:teamId',
    loadComponent: () => import('./sports/operations/team-operations-page').then((m) => m.SportsTeamOperationsPage),
    title: 'Gerenciar equipe',
  },
  {
    path: 'sports',
    loadComponent: () => import('./sports/operations/sports-autoroute-page').then((m) => m.SportsAutoroutePage),
    title: 'Minha próxima partida',
  },
  {
    path: 'major-event/:majorEventId/subscription',
    loadComponent: () =>
      import('./major-events/registration/standard/subscription').then((m) => m.MajorEventSubscription),
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
      import('./major-events/registration/ranked/ranked-subscription').then((m) => m.RankedMajorEventSubscription),
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
    loadComponent: () => import('./major-events/payment/payment-info').then((m) => m.PaymentInfo),
    title: 'Pagamento',
  },
  {
    path: 'attendance/register',
    loadComponent: () =>
      import('./attendance/self-registration/events/event-list-page').then((m) => m.OnlineAttendanceListComponent),
    title: 'Confirmar presença',
  },
  {
    path: 'attendance/register/:eventId',
    loadComponent: () =>
      import('./attendance/self-registration/code/code-page').then((m) => m.OnlineAttendanceCodeComponent),
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
    path: 'attendance/collect/:eventId/method',
    loadComponent: () => import('./attendance/collection/method/method-page').then((m) => m.AttendanceMethodPage),
    title: 'Escolher forma de coleta',
    canActivate: [attendanceCollectionScannerGuard],
  },
  {
    path: 'attendance/collect/:eventId/scanner',
    loadComponent: () => import('./attendance/collection/scanner/scanner-page').then((m) => m.AttendanceScanner),
    title: 'Coletar presença',
    canActivate: [attendanceCollectionScannerGuard],
  },
  {
    path: 'attendance/collect/:eventId/oral',
    loadComponent: () => import('./attendance/collection/oral/oral-page').then((m) => m.OralAttendancePage),
    title: 'Chamada oral',
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
    loadComponent: () => import('./help/help').then((m) => m.Help),
  },
  {
    path: 'validate',
    loadComponent: () =>
      import('./certificates/validation/certificate-validation').then((m) => m.CertificateValidation),
    title: 'Validar certificado',
    data: { reuseTab: true, reuseTabForEventNavigation: true },
  },
  {
    path: 'validate/:certificateId',
    loadComponent: () =>
      import('./certificates/validation/certificate-validation').then((m) => m.CertificateValidation),
    title: 'Validar certificado',
    data: { reuseTab: true, reuseTabForEventNavigation: true },
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
