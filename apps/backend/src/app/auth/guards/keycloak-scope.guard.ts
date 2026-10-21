import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { type Request } from 'express';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import {
  ALLOW_NON_ONBOARDED_KEY,
  ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY,
  AUTH_SESSION_COOKIE_NAME,
  EMPTY_SCOPED_PERMISSION_CONTEXT_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_ROLES_KEY,
} from '../auth.constants';
import { readAuthCookie } from '../auth-cookie-utils';
import { type AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../keycloak-auth.service';
import { assertUserOnboarded } from '../onboarding';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
  cookies?: Record<string, unknown>;
};

@Injectable()
export class KeycloakScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = this.getRequest(context);
    const roles =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_ROLES_KEY, [context.getHandler(), context.getClass()]) ?? [];
    const permissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const accessToken = this.extractBearerToken(request.headers.authorization);
    if (accessToken) {
      request.user = await this.keycloakAuthService.authenticateAccessToken(accessToken);
      this.assertOnboardingAllowed(context, request.user);
      this.assertRequiredRoles(request.user, roles);
      await this.authorizationPolicy.assertPermissions(
        request.user,
        permissions,
        this.getAuthorizationResourceContext(context, permissions),
      );
      return true;
    }

    const sessionId = this.extractCookieValue(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) {
      throw new UnauthorizedException('Missing authentication credentials.');
    }

    request.user = await this.keycloakAuthService.authenticateSession(sessionId);
    this.assertOnboardingAllowed(context, request.user);
    this.assertRequiredRoles(request.user, roles);
    await this.authorizationPolicy.assertPermissions(
      request.user,
      permissions,
      this.getAuthorizationResourceContext(context, permissions),
    );

    return true;
  }

  private assertRequiredRoles(user: AuthenticatedUser, roles: readonly string[]): void {
    if (roles.length === 0) {
      return;
    }

    if (this.isServiceAccountPrincipal(user)) {
      this.keycloakAuthService.assertMachineToMachinePrincipal(user, {
        requiredRoles: [...roles],
      });
      return;
    }

    this.keycloakAuthService.assertClientRoles(user, roles);
  }

  private getAuthorizationResourceContext(context: ExecutionContext, permissions: readonly string[]) {
    const emptyScopedPermissionContext = this.reflector.getAllAndOverride<boolean>(
      EMPTY_SCOPED_PERMISSION_CONTEXT_KEY,
      [context.getHandler(), context.getClass()],
    );
    const allowScopedCollection = this.reflector.getAllAndOverride<boolean>(ALLOW_SCOPED_COLLECTION_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (emptyScopedPermissionContext) {
      return { allowScopedCollection };
    }
    const contextType = context.getType<'http' | 'graphql'>();
    if (contextType === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context);
      return {
        ...this.authorizationPolicy.buildResourceContext(gqlContext.getArgs(), permissions),
        allowScopedCollection,
      };
    }

    if (contextType === 'http') {
      const request = context.switchToHttp().getRequest<RequestWithUser>();
      return {
        ...this.authorizationPolicy.buildResourceContext(
          {
            params: request.params,
            query: request.query,
            body: request.body,
          },
          permissions,
        ),
        allowScopedCollection,
      };
    }

    return {};
  }

  private assertOnboardingAllowed(context: ExecutionContext, user: AuthenticatedUser): void {
    const allowNonOnboarded = this.reflector.getAllAndOverride<boolean>(ALLOW_NON_ONBOARDED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowNonOnboarded) {
      return;
    }

    assertUserOnboarded(user);
  }

  private isServiceAccountPrincipal(user: AuthenticatedUser): boolean {
    const clientId = user.claims['azp'] ?? user.claims['client_id'];
    return typeof clientId === 'string' && user.preferredUsername === `service-account-${clientId}`;
  }

  private getRequest(context: ExecutionContext): RequestWithUser {
    const contextType = context.getType<'http' | 'graphql'>();
    if (contextType === 'http') {
      return context.switchToHttp().getRequest<RequestWithUser>();
    }

    if (contextType === 'graphql') {
      const gqlContext = GqlExecutionContext.create(context).getContext<{
        req?: RequestWithUser;
        request?: RequestWithUser;
      }>();
      const request = gqlContext.req ?? gqlContext.request;

      if (!request) {
        throw new UnauthorizedException('Missing request context.');
      }

      return request;
    }

    throw new UnauthorizedException('Unsupported execution context.');
  }

  private extractBearerToken(authorizationHeader?: string | string[]): string | null {
    const header = Array.isArray(authorizationHeader) ? authorizationHeader[0] : authorizationHeader;

    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }

  private extractCookieValue(request: RequestWithUser, key: string): string | null {
    return readAuthCookie(request, key);
  }
}
