import { Routes, RouterModule } from '@angular/router';

import { ProfileInfoPage } from './profile-info.page';

export const routes: Routes = [
  {
    path: '',
    component: ProfileInfoPage,
  },
  {
    path: 'settings',
    loadChildren: () => import('src/app/profile/profile-info/settings/settings.routes').then((m) => m.routes),
  },
];
