import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService, authGuard } from '@cacic-fct/shared-angular';

describe('public authGuard', () => {
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

  it('allows already authenticated users through without starting a new login', () => {
    authService.isAuthenticated.mockReturnValue(true);

    const result = runGuard('/preferences');

    expect(result).toBe(true);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('starts the backend login flow for protected public routes without returning a local /login URL', () => {
    const result = runGuard('/preferences');

    expect(result).toBe(false);
    expect(authService.login).toHaveBeenCalledWith({ returnTo: '/preferences' });
  });

  it('keeps post-logout redirects on the public app root instead of the admin-only login route', () => {
    authService.consumePostLogoutRedirect.mockReturnValue(true);

    const result = runGuard('/preferences');

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
    expect(authService.login).not.toHaveBeenCalled();
  });

  function runGuard(url: string): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => authGuard({} as never, { url } as never)) as boolean | UrlTree;
  }
});
