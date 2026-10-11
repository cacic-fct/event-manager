import { HttpErrorResponse } from '@angular/common/http';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RedirectCommand, Router, UrlTree } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { canReadFeatureGuard } from './access.guard';
import { PermissionsService } from '../permissions/permissions.service';

describe('admin feature route access', () => {
  const targetUrl = {} as UrlTree;
  const errorRedirect = {} as RedirectCommand;
  let auth: {
    clearSession: ReturnType<typeof vi.fn>;
    consumePostLogoutRedirect: ReturnType<typeof vi.fn>;
    ensureAuthenticated: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    roles: ReturnType<typeof vi.fn>;
  };
  let permissions: {
    canReadTab: ReturnType<typeof vi.fn>;
    evaluateWorkspacePermissions: ReturnType<typeof vi.fn>;
  };
  let routeErrors: { guardRedirect: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    auth = {
      clearSession: vi.fn(),
      consumePostLogoutRedirect: vi.fn(() => false),
      ensureAuthenticated: vi.fn().mockResolvedValue(true),
      login: vi.fn().mockResolvedValue(undefined),
      roles: vi.fn(() => []),
    };
    permissions = {
      canReadTab: vi.fn(() => false),
      evaluateWorkspacePermissions: vi.fn().mockResolvedValue(undefined),
    };
    routeErrors = { guardRedirect: vi.fn(() => errorRedirect) };
    router = {
      currentNavigation: vi.fn(() => ({ extractedUrl: targetUrl })),
      serializeUrl: vi.fn(() => '/events?filter=private#target'),
      url: '/previous',
    } as unknown as Router;

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PermissionsService, useValue: permissions },
        { provide: RouteErrorService, useValue: routeErrors },
        { provide: Router, useValue: router },
        { provide: PLATFORM_ID, useValue: 'browser' },
      ],
    });
  });

  it('redirects missing feature permission to shared 403 while retaining the requested route', async () => {
    const result = await runGuard();

    expect(auth.ensureAuthenticated).toHaveBeenCalledOnce();
    expect(permissions.evaluateWorkspacePermissions).toHaveBeenCalledOnce();
    expect(routeErrors.guardRedirect).toHaveBeenCalledWith(403);
    expect(result).toBe(errorRedirect);
  });

  it('routes a permission service outage to shared 503', async () => {
    permissions.evaluateWorkspacePermissions.mockRejectedValue(new Error('offline'));

    const result = await runGuard();

    expect(routeErrors.guardRedirect).toHaveBeenCalledWith(503);
    expect(result).toBe(errorRedirect);
  });

  it('starts Keycloak login with the current full URL when permission evaluation returns 401', async () => {
    permissions.evaluateWorkspacePermissions.mockRejectedValue(new HttpErrorResponse({ status: 401 }));

    const result = await runGuard();

    expect(auth.clearSession).toHaveBeenCalledOnce();
    expect(auth.login).toHaveBeenCalledWith({ returnTo: '/events?filter=private#target' });
    expect(result).toBe(false);
  });

  async function runGuard(): Promise<boolean | RedirectCommand | UrlTree> {
    return TestBed.runInInjectionContext(() => canReadFeatureGuard(
      { data: { id: 'events' } } as never,
      [],
      {} as never,
    )) as Promise<boolean | RedirectCommand | UrlTree>;
  }
});
