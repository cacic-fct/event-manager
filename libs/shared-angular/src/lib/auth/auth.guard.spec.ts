import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import { ActivatedRouteSnapshot, RedirectCommand, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import type { Permission } from '@cacic-fct/shared-permissions';
import { of, throwError } from 'rxjs';
import { RouteErrorService } from '../errors/route-error.service';
import { AuthService } from './auth.service';
import { authGuard, requiredPermissionsGuard } from './auth.guard';

describe('authentication route guards', () => {
  const rootEnvironmentInjector = null as unknown as EnvironmentInjector;
  const state = { url: '/events/private?access_token=do-not-copy' } as RouterStateSnapshot;
  const route = { data: {} } as ActivatedRouteSnapshot;
  const errorTree = { toString: () => '/error/503' } as UrlTree;
  const errorRedirect = new RedirectCommand(errorTree, { browserUrl: state.url, replaceUrl: true });
  let injector: EnvironmentInjector;
  let auth: {
    isAuthenticated: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    consumePostLogoutRedirect: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    clearSession: ReturnType<typeof vi.fn>;
    evaluatePermissions: ReturnType<typeof vi.fn>;
  };
  let router: { parseUrl: ReturnType<typeof vi.fn> };
  let errors: { guardRedirect: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    auth = {
      isAuthenticated: vi.fn().mockReturnValue(false),
      ensureAuthenticated: vi.fn().mockResolvedValue(false),
      consumePostLogoutRedirect: vi.fn().mockReturnValue(false),
      login: vi.fn().mockResolvedValue(undefined),
      clearSession: vi.fn(),
      evaluatePermissions: vi.fn().mockReturnValue(of([])),
    };
    router = { parseUrl: vi.fn().mockReturnValue(errorTree) };
    errors = { guardRedirect: vi.fn().mockReturnValue(errorRedirect) };
    injector = createEnvironmentInjector(
      [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
        { provide: RouteErrorService, useValue: errors },
      ],
      rootEnvironmentInjector,
    );
  });

  afterEach(() => injector.destroy());

  it('allows an authenticated user without starting another recovery attempt', async () => {
    auth.isAuthenticated.mockReturnValue(true);

    await expect(runGuard(authGuard)).resolves.toBe(true);

    expect(auth.ensureAuthenticated).not.toHaveBeenCalled();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('allows access when silent restoration authenticates the user', async () => {
    auth.ensureAuthenticated.mockResolvedValue(true);

    await expect(runGuard(authGuard)).resolves.toBe(true);

    expect(auth.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('starts login with the requested URL after restoration is denied', async () => {
    await expect(runGuard(authGuard)).resolves.toBe(false);

    expect(auth.login).toHaveBeenCalledWith({ returnTo: state.url });
    expect(errors.guardRedirect).not.toHaveBeenCalled();
  });

  it('returns a service-unavailable error page when restoration fails unexpectedly', async () => {
    auth.ensureAuthenticated.mockRejectedValue(new Error('identity provider unavailable'));

    await expect(runGuard(authGuard)).resolves.toBe(errorRedirect);

    expect(errors.guardRedirect).toHaveBeenCalledWith(503);
    expect(auth.login).not.toHaveBeenCalled();
  });

  it('returns to the home page after an intentional logout', async () => {
    auth.consumePostLogoutRedirect.mockReturnValue(true);

    await expect(runGuard(authGuard)).resolves.toBe(errorTree);

    expect(router.parseUrl).toHaveBeenCalledWith('/');
    expect(auth.ensureAuthenticated).not.toHaveBeenCalled();
  });

  it('allows a user when any requested permission is granted', async () => {
    auth.ensureAuthenticated.mockResolvedValue(true);
    auth.evaluatePermissions.mockReturnValue(of(['event#read']));
    const guard = requiredPermissionsGuard(['event#read' as Permission, 'event#update' as Permission]);

    await expect(runGuard(guard)).resolves.toBe(true);

    expect(auth.evaluatePermissions).toHaveBeenCalledWith(['event#read', 'event#update']);
    expect(errors.guardRedirect).not.toHaveBeenCalled();
  });

  it('redirects permission denial to 403 without copying request parameters into diagnostics', async () => {
    auth.ensureAuthenticated.mockResolvedValue(true);
    auth.evaluatePermissions.mockReturnValue(of([]));
    const guard = requiredPermissionsGuard(['event#read' as Permission]);

    await expect(runGuard(guard)).resolves.toBe(errorRedirect);

    expect(errors.guardRedirect).toHaveBeenCalledWith(403, {});
    expect(JSON.stringify(errors.guardRedirect.mock.calls)).not.toContain('do-not-copy');
  });

  it('uses a private route’s configured 404 copy without adding diagnostics', async () => {
    auth.ensureAuthenticated.mockResolvedValue(true);
    auth.evaluatePermissions.mockReturnValue(of([]));
    const accessDenied = {
      status: 404 as const,
      title: 'Conteúdo não encontrado.',
      description: 'Este conteúdo não está disponível.',
      actionLabel: 'Voltar',
      actionUrl: '/events',
    };
    const privateRoute = { data: { accessDenied } } as ActivatedRouteSnapshot;
    const guard = requiredPermissionsGuard(['event#read' as Permission]);

    await expect(runGuard(guard, privateRoute)).resolves.toBe(errorRedirect);

    expect(errors.guardRedirect).toHaveBeenCalledWith(404, accessDenied);
    expect(errors.guardRedirect.mock.calls[0]?.[1]).not.toHaveProperty('technicalDetails');
    expect(JSON.stringify(errors.guardRedirect.mock.calls)).not.toContain('do-not-copy');
  });

  it('maps permission service outages to 503', async () => {
    auth.ensureAuthenticated.mockResolvedValue(true);
    auth.evaluatePermissions.mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 503, url: '/api/auth/permissions/evaluate' })),
    );
    const guard = requiredPermissionsGuard(['event#read' as Permission]);

    await expect(runGuard(guard)).resolves.toBe(errorRedirect);

    expect(errors.guardRedirect).toHaveBeenCalledWith(503);
  });

  it('sends an unauthenticated user to login before evaluating permissions', async () => {
    const guard = requiredPermissionsGuard(['event#read' as Permission]);

    await expect(runGuard(guard)).resolves.toBe(false);

    expect(auth.login).toHaveBeenCalledWith({ returnTo: state.url });
    expect(auth.evaluatePermissions).not.toHaveBeenCalled();
  });

  function runGuard(
    guard: typeof authGuard | ReturnType<typeof requiredPermissionsGuard>,
    activeRoute: ActivatedRouteSnapshot = route,
  ): Promise<unknown> {
    return runInInjectionContext(injector, () => Promise.resolve(guard(activeRoute, state)));
  }
});
