import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, PLATFORM_ID, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
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
import { findWorkspaceNavItemForUrl, workspaceNavItems } from './workspace-nav';
import { isPlatformBrowser } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';

export type WorkspaceNavigationMode = 'icons' | 'full' | 'auto';

const workspaceNavModeStorageKey = 'cacic-admin-workspace-nav-mode';
const workspaceNavigationModes = ['icons', 'full', 'auto'] as const satisfies readonly WorkspaceNavigationMode[];

@Component({
  selector: 'app-workspace-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
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

  readonly initialNavMode = input<WorkspaceNavigationMode | null>(null);
  readonly activeUrlOverride = input<string | null>(null);

  protected readonly user = this.authService.user;

  protected readonly navItems = workspaceNavItems;

  private platformId = inject(PLATFORM_ID);
  private isDarkSignal = signal(false);
  fillColor = computed(() => (this.isDarkSignal() ? '#fff' : '#000'));
  protected readonly navMode = signal<WorkspaceNavigationMode>('auto');
  protected readonly navModeLabel = computed(() => {
    switch (this.navMode()) {
      case 'icons':
        return 'Somente ícones';
      case 'full':
        return 'Completa';
      case 'auto':
        return 'Automática';
    }
  });
  protected readonly navModeIcon = computed(() => {
    switch (this.navMode()) {
      case 'icons':
        return 'view_sidebar';
      case 'full':
        return 'keyboard_tab';
      case 'auto':
        return 'width_normal';
    }
  });
  protected readonly navModeTooltip = computed(
    () => `Navegação ${this.navModeLabel().toLowerCase()}. Clique para alternar o modo.`,
  );

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

  protected readonly activeUrl = computed(() => this.activeUrlOverride() ?? this.currentUrl());

  protected readonly activeNavItem = computed(() => {
    return findWorkspaceNavItemForUrl(this.activeUrl());
  });

  protected readonly showPageHeader = computed(() => this.activeUrl() !== '/');

  constructor() {
    effect(() => {
      const initialNavMode = this.initialNavMode();
      if (initialNavMode) {
        this.navMode.set(initialNavMode);
      }
    });

    if (isPlatformBrowser(this.platformId)) {
      const storedMode = window.localStorage.getItem(workspaceNavModeStorageKey);
      if (isWorkspaceNavigationMode(storedMode)) {
        this.navMode.set(storedMode);
      }

      const media = window.matchMedia('(prefers-color-scheme: dark)');

      this.isDarkSignal.set(media.matches);

      media.addEventListener('change', (e) => {
        this.isDarkSignal.set(e.matches);
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

  protected cycleNavMode(): void {
    const currentIndex = workspaceNavigationModes.indexOf(this.navMode());
    const nextMode = workspaceNavigationModes[(currentIndex + 1) % workspaceNavigationModes.length];
    this.navMode.set(nextMode);

    if (isPlatformBrowser(this.platformId)) {
      window.localStorage.setItem(workspaceNavModeStorageKey, nextMode);
    }
  }

  protected async logout(): Promise<void> {
    await this.authService.logout();
  }
}

function isWorkspaceNavigationMode(value: string | null): value is WorkspaceNavigationMode {
  return value === 'icons' || value === 'full' || value === 'auto';
}
