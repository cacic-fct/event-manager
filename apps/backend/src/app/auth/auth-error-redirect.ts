import { HttpException, HttpStatus } from '@nestjs/common';

const AUTH_ERROR_REDIRECT_PATH = '/app/auth/error';
const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';

export type AuthorizationErrorPayload = { message: string; error?: string; statusCode: number };

export function getAuthorizationErrorRedirectUri(input: AuthorizationErrorPayload): string {
  const url = new URL(AUTH_ERROR_REDIRECT_PATH, 'https://eventos.cacic.local');
  url.searchParams.set('reason', getAuthorizationErrorReason(input));
  return `${url.pathname}${url.search}`;
}

export function getAuthorizationErrorPayload(error: unknown): AuthorizationErrorPayload {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const statusCode = error.getStatus();
    if (typeof response === 'string') {
      return { message: response, statusCode };
    }
    if (response && typeof response === 'object') {
      const payload = response as { error?: unknown; message?: unknown; statusCode?: unknown };
      return {
        message: readExceptionMessage(payload.message) ?? error.message,
        error: typeof payload.error === 'string' ? payload.error : undefined,
        statusCode: typeof payload.statusCode === 'number' ? payload.statusCode : statusCode,
      };
    }
    return { message: error.message, statusCode };
  }
  return { message: INTERNAL_SERVER_ERROR_MESSAGE, statusCode: HttpStatus.INTERNAL_SERVER_ERROR };
}

function getAuthorizationErrorReason(input: Pick<AuthorizationErrorPayload, 'statusCode'>) {
  return input.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR ? 'server-error' : 'login-expired';
}

function readExceptionMessage(message: unknown): string | null {
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.filter((entry): entry is string => typeof entry === 'string').join(', ') || null;
  }
  return null;
}
