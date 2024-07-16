import { Routes } from '@angular/router';

import { DevelopmentToolsPage } from './development-tools.page';

export const routes: Routes = [
  {
    path: '',
    component: DevelopmentToolsPage,
  },
  {
    path: 'populate-db',
    loadChildren: () => import('./populate-database/populate-database.routes').then((m) => m.routes),
  },
  {
    path: 'barcode-scanner',
    loadComponent: () => import('./barcode-scanner/barcode-scanner.page').then((m) => m.BarcodeScannerPage),
  },
];
