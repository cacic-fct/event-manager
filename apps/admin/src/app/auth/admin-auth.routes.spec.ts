import { TestBed } from '@angular/core/testing';
import { CanActivateFn, provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { appRoutes } from '../app.routes';

describe('admin auth route wiring', () => {
  let authService: {
    consumePostLogoutRedirect: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(() => {
    authService = {
      consumePostLogoutRedirect: vi.fn(() => false),
      isAuthenticated: vi.fn(() => false),
      login: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    });

    router = TestBed.inject(Router);
  });

  it('declares the local admin login route', () => {
    expect(appRoutes.some((route) => route.path === 'login')).toBe(true);
  });

  it('wires the workspace entry route to the admin local-login guard behavior', () => {
    const workspaceRoute = appRoutes.find((route) => route.path === '');
    const guard = workspaceRoute?.canActivate?.[0] as CanActivateFn | undefined;

    expect(guard).toBeDefined();

    const result = TestBed.runInInjectionContext(() => guard?.({} as never, { url: '/' } as never)) as UrlTree;

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result)).toBe('/login?returnTo=%2F');
    expect(authService.login).not.toHaveBeenCalled();
  });
});
