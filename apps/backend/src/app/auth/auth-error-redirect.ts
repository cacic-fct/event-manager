import { HttpException, HttpStatus } from '@nestjs/common';

const AUTH_ERROR_REDIRECT_PATH = '/app/auth/error';
const INTERNAL_SERVER_ERROR_MESSAGE = 'Internal server error';
const LOGIN_EXPIRED_ERROR_TITLE = 'O tempo de login expirou.';
const LOGIN_EXPIRED_ERROR_DESCRIPTION = 'Entre novamente para continuar.';
const LOGIN_EXPIRED_ERROR_MESSAGE = 'O tempo de login expirou. Tente novamente';
const GENERIC_AUTH_ERROR_TITLE = 'Ocorreu um erro.';
const GENERIC_AUTH_ERROR_DESCRIPTION = 'Tente novamente mais tarde';
const GENERIC_AUTH_ERROR_MESSAGE = 'Ocorreu um erro. Tente novamente mais tarde';

export type AuthorizationErrorPayload = { message: string; error?: string; statusCode: number };

export function getAuthorizationErrorRedirectUri(input: AuthorizationErrorPayload): string {
  const url = new URL(AUTH_ERROR_REDIRECT_PATH, 'https://eventos.cacic.local');
  const content = getAuthorizationErrorContent(input);
  url.searchParams.set('reason', content.reason);
  url.searchParams.set('title', content.title);
  url.searchParams.set('description', content.description);
  url.searchParams.set('message', content.message);
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

function getAuthorizationErrorContent(input: Pick<AuthorizationErrorPayload, 'message' | 'statusCode'>) {
  if (input.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
    return { description: GENERIC_AUTH_ERROR_DESCRIPTION, message: GENERIC_AUTH_ERROR_MESSAGE, reason: 'server-error', title: GENERIC_AUTH_ERROR_TITLE };
  }
  return { description: LOGIN_EXPIRED_ERROR_DESCRIPTION, message: LOGIN_EXPIRED_ERROR_MESSAGE, reason: 'login-expired', title: LOGIN_EXPIRED_ERROR_TITLE };
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
