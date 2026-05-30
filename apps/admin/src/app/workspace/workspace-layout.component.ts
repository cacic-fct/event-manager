import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService, CacicLogoComponent } from '@cacic-fct/shared-angular';
import { NovuNotificationBadgeComponent } from '@cacic-fct/shared-notifications-angular';
import { filter, map, startWith } from 'rxjs';

import { WorkspacePermissionsService } from '../shared/services/workspace-permissions.service';
import { WorkspaceShellService } from '../shared/services/workspace-shell.service';
import { workspaceNavItems } from './workspace-nav';
import { isPlatformBrowser } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';

@Component({
  selector: 'app-workspace-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSidenavModule,
    MatTooltipModule,
    MatDividerModule,
    CacicLogoComponent,
    NovuNotificationBadgeComponent,
  ],
  templateUrl: './workspace-layout.component.html',
  styleUrl: './workspace-layout.component.scss',
})
export class WorkspaceLayoutComponent {
  private readonly authService = inject(AuthService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  public readonly router = inject(Router);

  readonly shell = inject(WorkspaceShellService);
  protected readonly permissions = inject(WorkspacePermissionsService);

  protected readonly user = this.authService.user;

  protected readonly navItems = workspaceNavItems;

  private platformId = inject(PLATFORM_ID);
  private isDarkSignal = signal(false);
  fillColor = computed(() => (this.isDarkSignal() ? '#fff' : '#000'));

  protected readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 768px)').pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly activeNavItem = computed(() => {
    const url = this.currentUrl().split('?')[0].split('#')[0];

    return this.navItems.find((item) => url.includes(`/${item.path}`)) ?? this.navItems[0];
  });

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');

      this.isDarkSignal.set(media.matches);

      media.addEventListener('change', (e) => {
        this.isDarkSignal.set(e.matches);
        console.log('Dark mode changed:', e.matches);
      });
    }

    void this.shell.loadInitialData();
  }

  protected activeNavId(): string {
    return this.activeNavItem().id;
  }

  protected closeSidenavIfMobile(sidenav: MatSidenav): void {
    if (this.isMobile()) {
      void sidenav.close();
    }
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
  }
}
