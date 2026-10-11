import { BreakpointObserver } from '@angular/cdk/layout';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { CacicLogoComponent } from '@cacic-fct/shared-angular/cacic-logo';
import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import { NovuNotificationBadgeComponent } from '@cacic-fct/shared-notifications-angular/badge';
import { filter, map, startWith } from 'rxjs';

import { PermissionsService } from '../permissions/permissions.service';
import { ShellService } from './admin-shell.service';
import { findNavigationItemForUrl, globalNavigationItems, navigationItems } from './navigation';
import { isPlatformBrowser } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';
import { EventContextDialogComponent, EventContextDialogData, EventContextDialogResult } from '../shared/event-context-dialog.component';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { ContextOperation, EventWorkspaceContextService, EventWorkspaceRef, EventWorkspaceKind, EventWorkspaceContext, contextOperations, eventContextFromUrl, eventCreationTarget } from '../event-workspace/event-workspace-context.service';
import { RequestActivityService } from '../feedback/request-activity.service';
import { canCreateEventContext } from '../shared/event-context-access';
import { adminEventWorkspaceRoute } from '@cacic-fct/shared-utils';
import { WorkspacePendingChangesService } from './workspace-pending-changes.service';

export type NavigationMode = 'icons' | 'full' | 'auto';

const navigationModeStorageKey = 'cacic-admin-workspace-nav-mode';
const navigationModes = ['icons', 'full', 'auto'] as const satisfies readonly NavigationMode[];

@Component({
  selector: 'app-workspace-shell',
  providers: [{ provide: ADMIN_SHELL_CONTEXT, useValue: true }],
  imports: [
    RouterLink,
    MatDialogModule,
    TwemojiComponent,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSidenavModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatDividerModule,
    CacicLogoComponent,
    NovuNotificationBadgeComponent,
  ],
  templateUrl: './admin-shell.component.html',
  styleUrls: [
    './admin-shell.component.scss',
    './admin-shell.navigation.component.scss',
    './admin-shell.navigation-items.component.scss',
    './admin-shell.permissions.component.scss',
    './admin-shell.responsive.component.scss',
  ],
})
export class AdminShellComponent {
  private readonly authService = inject(AuthService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly breakpointObserver = inject(BreakpointObserver);
  public readonly router = inject(Router);

  readonly shell = inject(ShellService);
  protected readonly Permission = Permission;
  protected readonly canCreateContext = canCreateEventContext;
  protected readonly eventWorkspace = inject(EventWorkspaceContextService);
  private readonly contextDialog = inject(MatDialog);
  protected readonly showGlobalNavigation = signal(false);
  protected readonly contextSelectorLabel = computed(() => {
    if (!this.routeContext()) return 'Escolher evento';
    return `Trocar contexto: ${this.eventWorkspace.context()?.name ?? 'evento selecionado'}`;
  });
  private readonly destroyRef = inject(DestroyRef);
  protected readonly requestActivity = inject(RequestActivityService);
  protected readonly permissions = inject(PermissionsService);
  private readonly pendingChanges = inject(WorkspacePendingChangesService);

  readonly initialNavMode = input<NavigationMode | null>(null);
  readonly activeUrlOverride = input<string | null>(null);

  protected readonly user = this.authService.user;
  protected readonly canChooseContext = computed(() => (['events', 'groups', 'major-events'] as const).some((tab) => this.permissions.canReadTab(tab)));

  protected readonly navItems = computed(() => {
    const items = globalNavigationItems.filter((item) => this.canShowNavItem(item));
    return items.filter((item, index) => item.kind !== 'divider' || items[index + 1]?.kind === 'link');
  });

  private platformId = inject(PLATFORM_ID);
  protected readonly isDarkSignal = signal(false);
  fillColor = computed(() => (this.isDarkSignal() ? '#fff' : '#000'));
  protected readonly navMode = signal<NavigationMode>('full');
  private readonly mainContent = viewChild<ElementRef<HTMLElement>>('mainContent');
  private readonly sidenavRef = viewChild(MatSidenav);
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
    return findNavigationItemForUrl(this.activeUrl());
  });

  protected readonly showPageHeader = computed(() => this.activeUrl() !== '/' && (!this.activeUrl().includes('/event-workspace') || !!eventContextFromUrl(this.activeUrl())));
  protected readonly routeContext = computed(() => eventContextFromUrl(this.activeUrl()));
  protected readonly pageTitle = computed(() => {
    if (this.activeUrl().split(/[?#]/)[0].endsWith('/validate-receipts')) return 'Validação de comprovantes';
    const creationKind = this.activeUrl().split(/[?#]/)[0].match(/^\/event-workspace\/new\/(event|group|major-event)$/)?.[1];
    if (this.currentOperationId() === 'certificates' && this.routeContext()) return 'Certificados';
    if (creationKind) return ({ event: 'Novo evento', group: 'Novo grupo de eventos', 'major-event': 'Novo grande evento' } as Record<string, string>)[creationKind];
    const context = this.eventWorkspace.context();
    if (this.currentOperationId() === 'overview' && context) return context.name;
    return this.eventWorkspace.operations().find((operation) => operation.id === this.currentOperationId())?.label ?? this.activeNavItem().label;
  });

  constructor() {
    effect(() => { const context = this.routeContext(); this.showGlobalNavigation.set(false); untracked(() => { void this.eventWorkspace.load(context); }); });
    this.destroyRef.onDestroy(() => { void this.eventWorkspace.load(null); });
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.focusContent());
    effect(() => {
      const initialNavMode = this.initialNavMode();
      if (initialNavMode) {
        this.navMode.set(initialNavMode);
      }
    });

    if (isPlatformBrowser(this.platformId)) {
      const storedMode = window.localStorage.getItem(navigationModeStorageKey);
      if (isNavigationMode(storedMode)) {
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

  protected navigationPath(item: (typeof navigationItems)[number]): string {
    return item.kind === 'link' ? item.id === 'events' ? '/event-workspace' : item.path : '';
  }

  protected currentOperationId(): ContextOperation['id'] | undefined {
    const segments = this.activeUrl().split(/[?#]/)[0].split('/').filter(Boolean);
    if (segments[0] === 'admin') segments.shift();
    const path = `/${segments.join('/')}`;
    const section = segments[0];
    if (path.startsWith('/event-workspace/new/')) return undefined;
    if (path.endsWith('/settings')) return 'settings';
    if (section === 'event-workspace' && this.routeContext()?.kind === 'event') return 'settings';
    if (path.endsWith('/interests')) return 'interests';
    return ({ 'event-workspace': 'overview', events: 'overview', groups: 'overview',
      'major-events': 'overview', tickets: 'tickets', subscriptions: 'subscriptions', attendances: 'attendances',
      forms: 'forms', draws: 'draws', sports: 'sports', certificates: 'certificates', publication: 'publication',
    } as Record<string, ContextOperation['id']>)[section];
  }

  protected openContextSelector(childKind?: 'event' | 'group'): void {
    if (this.eventWorkspace.scopeSwitchBlocked()) return;
    const parentContext = childKind ? this.eventWorkspace.context() : null;
    if (childKind && !parentContext) return;
    this.contextDialog.open<EventContextDialogComponent, EventContextDialogData, EventContextDialogResult>(EventContextDialogComponent, {
      data: { context: this.routeContext(), allowGroups: true, ...(parentContext ? { parentContext, childKind } : {}) },
      width: '640px', maxWidth: 'calc(100vw - 2rem)', autoFocus: 'input[type="search"]',
    }).afterClosed().subscribe((context) => {
      if (!context) return;
      if ('create' in context) this.createResource(context.create, parentContext ?? undefined);
      else {
        if (parentContext) this.eventWorkspace.rememberNavigationParent(context, parentContext);
        this.switchContext(context);
      }
      const sidenav = this.sidenavRef();
      if (sidenav) this.closeSidenavIfMobile(sidenav);
    });
  }

  protected async createResource(kind: EventWorkspaceKind, parent?: EventWorkspaceContext): Promise<void> {
    if (this.eventWorkspace.scopeSwitchBlocked() || !this.canCreateContext(this.permissions, kind)) return;
    const target = eventCreationTarget(kind, parent);
    if (!(await this.pendingChanges.navigate(() => this.router.navigate(target.commands, { queryParams: target.queryParams })))) return;
    const sidenav = this.sidenavRef();
    if (sidenav) this.closeSidenavIfMobile(sidenav);
  }

  protected async switchContext(ref: EventWorkspaceRef, operationId: ContextOperation['id'] = 'settings'): Promise<void> {
    if (this.eventWorkspace.scopeSwitchBlocked()) return;
    this.showGlobalNavigation.set(false);
    const operation = contextOperations(ref).find((candidate) => candidate.id === operationId);
    if (!(await this.pendingChanges.navigate(() => this.router.navigate(
      operation?.path ?? adminEventWorkspaceRoute({ ...ref, section: 'settings' }),
      { queryParams: operation?.queryParams },
    )))) return;
    const sidenav = this.sidenavRef();
    if (sidenav) this.closeSidenavIfMobile(sidenav);
  }

  protected focusContent(): void {
    this.mainContent()?.nativeElement.focus();
  }

  protected closeSidenavIfMobile(sidenav: MatSidenav): void {
    if (this.isMobile()) {
      void sidenav.close();
    }
  }

  protected cycleNavMode(): void {
    const currentIndex = navigationModes.indexOf(this.navMode());
    const nextMode = navigationModes[(currentIndex + 1) % navigationModes.length];
    this.navMode.set(nextMode);

    if (isPlatformBrowser(this.platformId)) {
      window.localStorage.setItem(navigationModeStorageKey, nextMode);
    }
  }

  protected async logout(): Promise<void> {
    try {
      await this.authService.logout();
    } catch {
      this.snackBar.open('Não foi possível sair da conta. Tente novamente.', 'Fechar', { duration: 5000 });
    }
  }

  private canShowNavItem(item: (typeof navigationItems)[number]): boolean {
    if (item.kind === 'divider') {
      return true;
    }

    if ('visibleFor' in item && item.visibleFor === 'super-admin') {
      return this.authService.roles().includes(EventManagerKeycloakRole.SuperAdmin);
    }

    return true;
  }
}

function isNavigationMode(value: string | null): value is NavigationMode {
  return value === 'icons' || value === 'full' || value === 'auto';
}
