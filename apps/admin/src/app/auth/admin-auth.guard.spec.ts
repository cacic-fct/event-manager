import { TestBed } from '@angular/core/testing';
import { CanMatchFn, provideRouter, RedirectCommand, Router, UrlTree } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { adminAuthenticationGuard } from './admin-auth.guard';

describe('adminAuthenticationGuard', () => {
  let authService: {
    consumePostLogoutRedirect: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(() => {
    authService = {
      consumePostLogoutRedirect: vi.fn(() => false),
      ensureAuthenticated: vi.fn().mockResolvedValue(false),
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

  it('allows authenticated admin users through without starting login', async () => {
    authService.ensureAuthenticated.mockResolvedValue(true);

    const result = await runGuard();

    expect(result).toBe(true);
    expect(authService.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('starts Keycloak login with the full requested path and query after restoring once', async () => {
    setNavigationTarget('/events?status=draft&page=2#selected-event');

    const result = await runGuard();

    expect(result).toBe(false);
    expect(authService.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(authService.login).toHaveBeenCalledWith({ returnTo: '/events?status=draft&page=2#selected-event' });
  });

  it('returns to the explicit post-logout page without starting SSO again', async () => {
    authService.consumePostLogoutRedirect.mockReturnValue(true);

    const result = await runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('shows the shared 503 page if session restoration fails unexpectedly', async () => {
    authService.ensureAuthenticated.mockRejectedValue(new Error('service unavailable'));

    const result = await runGuard();

    expect(result).toBeInstanceOf(RedirectCommand);
    expect(router.serializeUrl((result as RedirectCommand).redirectTo)).toBe('/error/503');
    expect(authService.login).not.toHaveBeenCalled();
  });

  async function runGuard(): Promise<boolean | UrlTree | RedirectCommand> {
    const guard = adminAuthenticationGuard as CanMatchFn;
    return TestBed.runInInjectionContext(() => guard({} as never, [], {} as never)) as Promise<
      boolean | UrlTree | RedirectCommand
    >;
  }

  function setNavigationTarget(url: string): void {
    const target = router.parseUrl(url);
    vi.spyOn(router, 'currentNavigation').mockReturnValue({
      extractedUrl: target,
      initialUrl: target,
    } as never);
  }
});
