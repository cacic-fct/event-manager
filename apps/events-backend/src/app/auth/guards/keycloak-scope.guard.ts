import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Request } from 'express';
import {
  AUTH_SESSION_COOKIE_NAME,
  IS_PUBLIC_KEY,
  REQUIRED_ROLES_KEY,
} from '../auth.constants';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../keycloak-auth.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class KeycloakScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly keycloakAuthService: KeycloakAuthService,
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
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    const roles = requiredRoles ?? [];

    const accessToken = this.extractBearerToken(request.headers.authorization);
    if (accessToken) {
      request.user = await this.keycloakAuthService.authenticateAccessToken(
        accessToken,
        roles,
      );
      return true;
    }

    const sessionId = this.extractCookieValue(
      request.headers.cookie,
      AUTH_SESSION_COOKIE_NAME,
    );
    if (!sessionId) {
      throw new UnauthorizedException('Missing authentication credentials.');
    }

    request.user = await this.keycloakAuthService.authenticateSession(
      sessionId,
      roles,
    );

    return true;
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

  private extractBearerToken(
    authorizationHeader?: string | string[],
  ): string | null {
    const header = Array.isArray(authorizationHeader)
      ? authorizationHeader[0]
      : authorizationHeader;

    if (!header) {
      return null;
    }

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    return token;
  }

  private extractCookieValue(
    cookieHeader: string | string[] | undefined,
    key: string,
  ): string | null {
    const header = Array.isArray(cookieHeader) ? cookieHeader[0] : cookieHeader;
    if (!header) {
      return null;
    }

    const cookies = header.split(';');
    for (const cookie of cookies) {
      const [name, ...value] = cookie.trim().split('=');
      if (name !== key || value.length === 0) {
        continue;
      }

      return decodeURIComponent(value.join('='));
    }

    return null;
  }
}
