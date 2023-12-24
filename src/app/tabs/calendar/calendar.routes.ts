import { RouterModule, Routes } from '@angular/router';
import { CalendarPage } from './calendar.page';

export const routes: Routes = [
  {
    path: '',
    component: CalendarPage,
  },
  {
    path: 'evento/:eventID',
    title: 'Informações do evento',
    loadChildren: () => import('./event-info-display/event-info-display.routes').then((m) => m.routes),
  },
];
