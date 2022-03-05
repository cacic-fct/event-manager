import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    loadChildren: () =>
      import('./tabs/tabs.module').then((m) => m.TabsPageModule),
  },
  {
    path: 'calendario/evento/:id',
    loadChildren: () =>
      import('./page-calendar-event/page-calendar-event.module').then(
        (m) => m.PageCalendarEventPageModule
      ),
  },
  {
    path: 'about',
    loadChildren: () =>
      import('./page-about/page-about.module').then(
        (m) => m.PageAboutPageModule
      ),
  },

  {
    path: 'licenses',
    loadChildren: () =>
      import('./page-licenses/page-licenses.module').then(
        (m) => m.PageLegalPageModule
      ),
  },
  {
    path: 'vinculo',
    loadChildren: () =>
      import('./customize-experience/customize-experience.module').then(
        (m) => m.CustomizeExperiencePageModule
      ),
  },
  {
    path: 'settings',
    loadChildren: () =>
      import('./page-settings/page-settings.module').then(
        (m) => m.PageSettingsPageModule
      ),
  },
];
@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
