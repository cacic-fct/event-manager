import { Routes } from '@angular/router';
import { LegalPage } from 'src/app/settings/legal/legal.page';

export const routes: Routes = [
  {
    path: '',
    component: LegalPage,
  },
  {
    path: 'licencas',
    loadChildren: () => import('./licenses/licenses.routes').then((m) => m.routes),
  },
];
