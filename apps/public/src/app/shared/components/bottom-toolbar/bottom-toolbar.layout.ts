import { Component, inject, PLATFORM_ID } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { RouterOutlet } from '@angular/router';
import { BottomToolbarComponent } from './bottom-toolbar.component';
import { toSignal } from '@angular/core/rxjs-interop';
import { isPlatformBrowser } from '@angular/common';
import { filter, map } from 'rxjs';

@Component({
  imports: [BottomToolbarComponent, RouterOutlet],
  template: `
    <div class="layout-container">
      <main class="toolbar-content" [class.no-x-padding]="noXPadding()">
        <router-outlet />
      </main>
      <app-bottom-toolbar [items]="items"></app-bottom-toolbar>
    </div>
  `,
  styles: `
    .layout-container {
      display: flex;
      flex-direction: column;
      min-height: 100dvh;
    }

    .toolbar-content {
      flex: 1;
    }
  `,
})
export class ToolbarLayoutComponent {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  private getRouteData(key: string): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    let route = this.router.routerState.root;

    while (route.firstChild) {
      route = route.firstChild;
    }

    return route.snapshot?.data?.[key] ?? false;
  }

  readonly items: ToolbarItem[] = [
    {
      label: 'Calendário',
      shortLabel: 'Calendário',
      icon: 'calendar_month',
      route: '/calendar',
    },
    {
      label: 'Menu',
      shortLabel: 'Menu',
      icon: 'menu',
      route: '/menu',
    },
  ];

  readonly noXPadding = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.getRouteData('noXPadding')),
    ),
    {
      initialValue: this.getRouteData('noXPadding'),
    },
  );
}

export interface ToolbarItem {
  label: string;
  shortLabel: string;
  route: string;
  icon: string;
}
