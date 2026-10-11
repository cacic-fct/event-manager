import { TestBed } from '@angular/core/testing';
import { provideRouter, RedirectCommand, Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { PublicFeatureFlagService } from '../feature-flags/public-feature-flag.service';
import { myDayFeatureGuard } from './my-day.guard';

describe('myDayFeatureGuard', () => {
  let auth: {
    consumePostLogoutRedirect: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    isAuthenticated: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
  };
  let flags: { booleanValue: ReturnType<typeof vi.fn> };
  let errors: { guardRedirect: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    auth = {
      consumePostLogoutRedirect: vi.fn(() => false),
      ensureAuthenticated: vi.fn().mockResolvedValue(true),
      isAuthenticated: vi.fn(() => false),
      login: vi.fn().mockResolvedValue(undefined),
    };
    flags = { booleanValue: vi.fn(() => true) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: PublicFeatureFlagService, useValue: flags },
        {
          provide: RouteErrorService,
          useValue: {
            guardRedirect: vi.fn((status: number) => new RedirectCommand(router.parseUrl(`/error/${status}`))),
          },
        },
      ],
    });
    router = TestBed.inject(Router);
    errors = TestBed.inject(RouteErrorService) as unknown as typeof errors;
  });

  it('authenticates before checking whether the feature is enabled', async () => {
    flags.booleanValue.mockReturnValue(false);
    const result = await runGuard('/my-day?date=tomorrow');

    expect(result).toBeInstanceOf(RedirectCommand);
    expect((result as RedirectCommand).redirectTo.toString()).toBe('/error/404');
    expect(auth.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(flags.booleanValue).toHaveBeenCalledWith('myDayTabEnabled');
    expect(errors.guardRedirect).toHaveBeenCalledWith(404);
  });

  it('preserves the requested target while starting login for an unauthenticated user', async () => {
    auth.ensureAuthenticated.mockResolvedValue(false);
    const result = await runGuard('/my-day?date=tomorrow');

    expect(result).toBe(false);
    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/my-day?date=tomorrow' });
    expect(flags.booleanValue).not.toHaveBeenCalled();
  });

  function runGuard(url: string): Promise<unknown> {
    return TestBed.runInInjectionContext(() =>
      myDayFeatureGuard({} as never, { url } as never),
    ) as Promise<unknown>;
  }
});
