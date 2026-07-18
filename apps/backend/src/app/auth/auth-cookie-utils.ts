import { Request, Response } from 'express';

const CACIC_TRACKING_COOKIE_NAMES = [
  'cacic-analytics-id',
  'cacic-analytics-consent',
  'cacic-purr',
  'cacic-purr-quick',
] as const;

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

export function readAuthCookie(request: Request, name: string): string | null {
  const parsedCookie = (request as RequestWithCookies).cookies?.[name];
  if (typeof parsedCookie === 'string') {
    return parsedCookie;
  }

  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  for (const cookie of cookieHeader.split(';')) {
    const [cookieName, ...rest] = cookie.trim().split('=');
    if (cookieName === name && rest.length > 0) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch (error) {
        if (error instanceof URIError) {
          continue;
        }
        throw error;
      }
    }
  }

  return null;
}

export function resolveCookieMaxAge(expiresAt: number): number {
  return Math.max(expiresAt - Date.now(), 0);
}

export function isSecureAuthRequest(request: Request): boolean {
  return request.secure;
}

export function clearCacicTrackingCookies(response: Response, request: Request): void {
  const secure = isSecureAuthRequest(request);

  for (const cookieName of CACIC_TRACKING_COOKIE_NAMES) {
    response.clearCookie(cookieName, { domain: '.cacic.com.br', sameSite: 'lax', secure, path: '/' });
    response.clearCookie(cookieName, { sameSite: 'lax', secure, path: '/' });
  }
}
