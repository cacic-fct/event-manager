import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

type WarningLogger = Pick<Console, 'warn'>;

export function createAllowedCallbackRedirectOrigins(environment: NodeJS.ProcessEnv, logger: WarningLogger): Set<string> {
  const origins = new Set<string>([
    'http://localhost:3000',
    'https://eventos.cacic.com.br',
    'https://secompp.cacic.com.br',
  ]);
  addAllowedOrigin(origins, environment.KEYCLOAK_REDIRECT_URI, 'allowed callback redirect origin', logger);
  for (const rawOrigin of (environment.KEYCLOAK_ALLOWED_CALLBACK_REDIRECT_ORIGINS ?? '').split(',')) {
    addAllowedOrigin(origins, rawOrigin.trim(), 'allowed callback redirect origin', logger);
  }
  return origins;
}

export function createAllowedPostLogoutRedirectOrigins(environment: NodeJS.ProcessEnv, logger: WarningLogger): Set<string> {
  const origins = new Set<string>([
    'http://localhost:4200',
    'https://eventos.cacic.com.br',
    'https://secompp.cacic.com.br',
  ]);
  addAllowedOrigin(origins, environment.KEYCLOAK_POST_LOGOUT_REDIRECT_URI, 'allowed post-logout redirect origin', logger);
  addAllowedOrigin(origins, environment.KEYCLOAK_POST_LOGIN_REDIRECT_URI, 'allowed post-logout redirect origin', logger);
  for (const rawOrigin of (environment.KEYCLOAK_ALLOWED_POST_LOGOUT_REDIRECT_ORIGINS ?? '').split(',')) {
    addAllowedOrigin(origins, rawOrigin.trim(), 'allowed post-logout redirect origin', logger);
  }
  for (const rawOrigin of (environment.KEYCLOAK_ALLOWED_POST_LOGIN_REDIRECT_ORIGINS ?? '').split(',')) {
    addAllowedOrigin(origins, rawOrigin.trim(), 'allowed post-logout redirect origin', logger);
  }
  return origins;
}

export function resolveCallbackRedirectUri(
  request: Request,
  requestedRedirectUri: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): string {
  const redirectUri = requestedRedirectUri?.trim() || getCallbackRedirectUri(request);
  const url = parseHttpUrl(
    redirectUri,
    'Invalid callback redirect URI.',
    'Callback redirect URI must use HTTP or HTTPS.',
  );
  if (url.pathname !== '/api/auth/callback') {
    throw new BadRequestException('Callback redirect URI path is not allowed.');
  }
  if (!allowedOrigins.has(url.origin)) {
    throw new BadRequestException('Callback redirect URI origin is not allowed.');
  }
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function resolvePostLogoutRedirectUri(
  requestedRedirectUri: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): string | undefined {
  const redirectUri = requestedRedirectUri?.trim();
  if (!redirectUri) {
    return undefined;
  }
  const url = parseHttpUrl(
    redirectUri,
    'Invalid post-logout redirect URI.',
    'Post-logout redirect URI must use HTTP or HTTPS.',
  );
  if (!allowedOrigins.has(url.origin)) {
    throw new BadRequestException('Post-logout redirect URI origin is not allowed.');
  }
  url.username = '';
  url.password = '';
  url.hash = '';
  return url.toString();
}

export function withQueryParam(uri: string, key: string, value: string): string {
  try {
    const isRelativePath = uri.startsWith('/') && !uri.startsWith('//');
    const url = new URL(uri, 'https://eventos.cacic.local');
    url.searchParams.set(key, value);
    return isRelativePath ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch {
    return uri;
  }
}

function getCallbackRedirectUri(request: Request): string {
  const protocol = readForwardedHeader(request, 'x-forwarded-proto')?.split(',')[0]?.trim();
  const host = readForwardedHeader(request, 'x-forwarded-host')?.split(',')[0]?.trim();
  return new URL('/api/auth/callback', `${protocol || request.protocol}://${host || request.get('host')}`).toString();
}

function parseHttpUrl(value: string, invalidMessage: string, invalidProtocolMessage: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException(invalidMessage);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException(invalidProtocolMessage);
  }
  return url;
}

function addAllowedOrigin(origins: Set<string>, rawUrl: string | undefined, description: string, logger: WarningLogger): void {
  if (!rawUrl) {
    return;
  }
  try {
    origins.add(new URL(rawUrl).origin);
  } catch {
    logger.warn(`Ignoring invalid ${description}: ${rawUrl}`);
  }
}

function readForwardedHeader(request: Request, headerName: string): string | undefined {
  const value = request.headers[headerName];
  return Array.isArray(value) ? value[0] : value;
}
