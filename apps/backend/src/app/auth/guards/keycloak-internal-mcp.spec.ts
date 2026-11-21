import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission } from '@cacic-fct/shared-permissions';
import { adminMcpExecution } from '../../mcp/admin-operations/execution-context';
import { authenticateHttpRequest, type AuthenticatedRequest } from '../authenticated-request';
import { REQUIRED_PERMISSIONS_KEY, REQUIRED_ROLES_KEY } from '../auth.constants';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import type { KeycloakAuthService } from '../keycloak-auth.service';
import { KeycloakScopeGuard } from './keycloak-scope.guard';
const { jest } = import.meta;

function principal(onboarded = true): AuthenticatedUser {
  return {
    realm_access: { roles: [] },
    sub: 'operator',
    token: '',
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: { is_onboarded: onboarded },
    authenticationTransport: 'mcp',
  };
}

function context(request: object, kind: 'graphql' | 'http' = 'graphql'): ExecutionContext {
  const args = [undefined, { id: 'event-1' }, { req: request }, undefined];
  return {
    getType: () => kind,
    getHandler: () => context,
    getClass: () => KeycloakScopeGuard,
    getArgs: () => args,
    getArgByIndex: (index: number) => args[index],
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function fixture() {
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === REQUIRED_PERMISSIONS_KEY) return [Permission.Event.Update];
      if (key === REQUIRED_ROLES_KEY) return ['access'];
      return false;
    }),
  };
  const auth = {
    authenticateAccessToken: jest.fn(async () => principal()),
    authenticateSession: jest.fn(async () => principal()),
    assertClientRoles: jest.fn(),
    assertMachineToMachinePrincipal: jest.fn(),
  };
  const policy = {
    assertPermissions: jest.fn(async () => undefined),
    buildResourceContext: jest.fn(() => ({ eventId: 'event-1' })),
  };
  const guard = new KeycloakScopeGuard(
    reflector as unknown as Reflector,
    auth as unknown as KeycloakAuthService,
    policy as never,
  );
  return { guard, auth, policy };
}

function internal<T>(request: object, user: AuthenticatedUser, work: () => T): T {
  return adminMcpExecution.run(
    { request, user, phase: 'read', delegationId: 'delegation', clientId: 'client', operation: 'event' },
    work,
  );
}

describe('trusted administrative MCP authentication boundary', () => {
  it('rejects forged web request markers and an already populated request.user', async () => {
    const { guard, auth } = fixture();
    const request = { headers: { 'x-mcp-internal': 'true' }, body: { internal: true }, user: principal() };
    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(authenticateHttpRequest(request as unknown as AuthenticatedRequest, auth)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auth.authenticateAccessToken).not.toHaveBeenCalled();
    expect(auth.authenticateSession).not.toHaveBeenCalled();
  });

  it('uses normal OAuth authentication for a web bearer even if request.user claims MCP', async () => {
    const { guard, auth } = fixture();
    const request = { headers: { authorization: 'Bearer actual-oauth-token' }, user: principal() };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(auth.authenticateAccessToken).toHaveBeenCalledWith('actual-oauth-token');
  });

  it('reuses only the exact internal GraphQL request and still checks roles and target permissions', async () => {
    const { guard, auth, policy } = fixture();
    const request = { headers: {} };
    const user = principal();
    await internal(request, user, async () => {
      await expect(guard.canActivate(context(request))).resolves.toBe(true);
      await expect(authenticateHttpRequest(request as unknown as AuthenticatedRequest, auth)).resolves.toBe(user);
      await expect(guard.canActivate(context({ headers: {}, user }))).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(guard.canActivate(context(request, 'http'))).rejects.toBeInstanceOf(UnauthorizedException);
    });
    expect(auth.authenticateAccessToken).not.toHaveBeenCalled();
    expect(auth.authenticateSession).not.toHaveBeenCalled();
    expect(auth.assertClientRoles).toHaveBeenCalledWith(user, ['access']);
    expect(policy.buildResourceContext).toHaveBeenCalledWith({ id: 'event-1' }, [Permission.Event.Update]);
    expect(policy.assertPermissions).toHaveBeenCalledWith(user, [Permission.Event.Update], {
      eventId: 'event-1',
      allowScopedCollection: false,
    });
  });

  it('preserves onboarding denial for the trusted principal', async () => {
    const { guard, auth, policy } = fixture();
    const request = { headers: {} };
    await expect(internal(request, principal(false), () => guard.canActivate(context(request)))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auth.assertClientRoles).not.toHaveBeenCalled();
    expect(policy.assertPermissions).not.toHaveBeenCalled();
  });

  it.each(['roles', 'permissions'])('preserves current %s denial for the trusted principal', async (boundary) => {
    const { guard, auth, policy } = fixture();
    const request = { headers: {} };
    if (boundary === 'roles')
      auth.assertClientRoles.mockImplementation(() => {
        throw new ForbiddenException('role denied');
      });
    else policy.assertPermissions.mockRejectedValue(new ForbiddenException('permission denied'));
    await expect(internal(request, principal(), () => guard.canActivate(context(request)))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    if (boundary === 'roles') expect(policy.assertPermissions).not.toHaveBeenCalled();
  });
});
