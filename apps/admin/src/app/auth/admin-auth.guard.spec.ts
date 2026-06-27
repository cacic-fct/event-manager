import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { AuthService, authGuardWithLocalLogin } from '@cacic-fct/shared-angular';

describe('admin authGuardWithLocalLogin', () => {
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

  it('allows authenticated admin users through without redirecting', () => {
    authService.isAuthenticated.mockReturnValue(true);

    const result = runGuard('/');

    expect(result).toBe(true);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('sends unauthenticated admin users to the local dev login route with the requested return path', () => {
    const result = runGuard('/');

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnTo=%2F');
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('keeps post-logout admin redirects on the local login route without immediately starting SSO again', () => {
    authService.consumePostLogoutRedirect.mockReturnValue(true);

    const result = runGuard('/');

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
    expect(authService.login).not.toHaveBeenCalled();
  });

  function runGuard(url: string): boolean | UrlTree {
    const guard = authGuardWithLocalLogin();
    return TestBed.runInInjectionContext(() => guard({} as never, { url } as never)) as boolean | UrlTree;
  }
});
