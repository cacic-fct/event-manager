import { Routes, RouterModule } from '@angular/router';

import { MoreInfoPage } from './more-info.page';

export const routes: Routes = [
  {
    path: '',
    component: MoreInfoPage,
  },
  {
    path: 'evento/:eventID',
    title: 'Informações do evento',
    loadChildren: () =>
      import('src/app/tabs/calendar/event-info-display/event-info-display.routes').then((m) => m.routes),
  },
];
