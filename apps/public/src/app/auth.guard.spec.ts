import { TestBed } from '@angular/core/testing';
import { provideRouter, RedirectCommand, Router, UrlTree } from '@angular/router';
import { AuthService, authGuard } from '@cacic-fct/shared-angular';

describe('public authGuard', () => {
  let authService: {
    consumePostLogoutRedirect: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(() => {
    authService = {
      consumePostLogoutRedirect: vi.fn(() => false),
      ensureAuthenticated: vi.fn().mockResolvedValue(false),
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

  it('allows already authenticated users through without restoring or starting a new login', async () => {
    authService.isAuthenticated.mockReturnValue(true);

    const result = await runGuard('/preferences');

    expect(result).toBe(true);
    expect(authService.ensureAuthenticated).not.toHaveBeenCalled();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('restores the current session once before allowing the requested route', async () => {
    authService.ensureAuthenticated.mockResolvedValue(true);

    const result = await runGuard('/preferences');

    expect(result).toBe(true);
    expect(authService.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('starts Keycloak login for protected public routes with the requested target', async () => {
    const result = await runGuard('/profile/wallet/tickets/ticket-1');

    expect(result).toBe(false);
    expect(authService.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(authService.login).toHaveBeenCalledWith({ returnTo: '/profile/wallet/tickets/ticket-1' });
  });

  it('keeps post-logout redirects on the public app root instead of starting another login', async () => {
    authService.consumePostLogoutRedirect.mockReturnValue(true);

    const result = await runGuard('/preferences');

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
    expect(authService.ensureAuthenticated).not.toHaveBeenCalled();
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('shows the shared unavailable page when session restoration fails', async () => {
    authService.ensureAuthenticated.mockRejectedValue(new Error('Auth service unavailable'));

    const result = await runGuard('/preferences');

    expect(result).toBeInstanceOf(RedirectCommand);
    expect(router.serializeUrl((result as RedirectCommand).redirectTo)).toBe('/error/503');
    expect((result as RedirectCommand).navigationBehaviorOptions).toBeDefined();
    expect(authService.login).not.toHaveBeenCalled();
  });

  function runGuard(url: string): Promise<boolean | UrlTree | RedirectCommand> {
    return TestBed.runInInjectionContext(() => authGuard({} as never, { url } as never)) as Promise<
      boolean | UrlTree | RedirectCommand
    >;
  }
});
