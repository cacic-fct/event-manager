import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from './auth.constants';
import { KeycloakAuthService } from './keycloak-auth.service';

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

type DocsAuthGateOptions = {
  readonly keycloakAuthService: KeycloakAuthService;
  readonly production: boolean;
};

export function createDocsAuthGate({ keycloakAuthService, production }: DocsAuthGateOptions): RequestHandler {
  return async (request: RequestWithCookies, response: Response, next: NextFunction) => {
    if (!production || !shouldGateRequest(request)) {
      next();
      return;
    }

    const sessionId = readCookie(request, AUTH_SESSION_COOKIE_NAME);
    if (!sessionId) {
      redirectToLogin(request, response);
      return;
    }

    try {
      await keycloakAuthService.authenticateSession(sessionId);
      next();
    } catch {
      redirectToLogin(request, response);
    }
  };
}

function shouldGateRequest(request: Request): boolean {
  const path = stripTrailingSlashes(request.path);

  if (path === '/api/graphql') {
    return request.method === 'GET' && request.accepts('html') === 'html';
  }

  return (
    path === '/api/docs' ||
    path.startsWith('/api/docs/') ||
    path === '/api/docs-json' ||
    path === '/api/docs-yaml'
  );
}

function stripTrailingSlashes(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function redirectToLogin(request: Request, response: Response): void {
  const returnTo = encodeURIComponent(getOriginalUrl(request));
  response.redirect(`/api/auth/login/redirect?returnTo=${returnTo}`);
}

function getOriginalUrl(request: Request): string {
  return request.originalUrl || request.url || '/api/docs';
}

function readCookie(request: RequestWithCookies, name: string): string | null {
  const parsedCookie = request.cookies?.[name];
  if (typeof parsedCookie === 'string') {
    return parsedCookie;
  }

  const header = request.headers.cookie;
  if (!header) {
    return null;
  }

  const cookies = header.split(';');
  for (const cookie of cookies) {
    const [cookieName, ...value] = cookie.trim().split('=');
    if (cookieName !== name || value.length === 0) {
      continue;
    }

    return decodeURIComponent(value.join('='));
  }

  return null;
}
