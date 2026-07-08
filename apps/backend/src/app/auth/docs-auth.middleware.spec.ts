import { NextFunction, Request, Response } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from './auth.constants';
import { createDocsAuthGate } from './docs-auth.middleware';
import { KeycloakAuthService } from './keycloak-auth.service';

type MockRequest = Partial<Request> & {
  cookies?: Record<string, unknown>;
};

describe('createDocsAuthGate', () => {
  let keycloakAuthService: {
    authenticateSession: jest.Mock<Promise<void>, [string]>;
  };
  let response: Partial<Response> & {
    redirect: jest.Mock<void, [string]>;
  };
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    keycloakAuthService = {
      authenticateSession: jest.fn().mockResolvedValue(undefined),
    };
    response = {
      redirect: jest.fn(),
    };
    next = jest.fn();
  });

  it.each(['/api/docs-json', '/api/docs-json/', '/api/docs-yaml', '/api/docs-yaml/'])(
    'gates unauthenticated Swagger spec requests for %s',
    async (path) => {
      await runGate({
        path,
        method: 'GET',
      });

      expect(response.redirect).toHaveBeenCalledWith(
        `/api/auth/login/redirect?returnTo=${encodeURIComponent(path)}`,
      );
      expect(next).not.toHaveBeenCalled();
      expect(keycloakAuthService.authenticateSession).not.toHaveBeenCalled();
    },
  );

  it.each(['/api/graphql', '/api/graphql/'])('gates unauthenticated GraphQL landing page requests for %s', async (path) => {
    await runGate({
      path,
      method: 'GET',
      accepts: jest.fn().mockReturnValue('html'),
    });

    expect(response.redirect).toHaveBeenCalledWith(
      `/api/auth/login/redirect?returnTo=${encodeURIComponent(path)}`,
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('allows authenticated trailing-slash Swagger spec requests', async () => {
    await runGate({
      path: '/api/docs-json/',
      method: 'GET',
      cookies: {
        [AUTH_SESSION_COOKIE_NAME]: 'session-1',
      },
    });

    expect(keycloakAuthService.authenticateSession).toHaveBeenCalledWith('session-1');
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('allows authenticated docs requests when the session id comes from the raw cookie header', async () => {
    await runGate({
      path: '/api/docs',
      method: 'GET',
      headers: {
        cookie: `other=value; ${AUTH_SESSION_COOKIE_NAME}=session%3Dwith%3Dequals`,
      },
    });

    expect(keycloakAuthService.authenticateSession).toHaveBeenCalledWith('session=with=equals');
    expect(next).toHaveBeenCalledTimes(1);
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('ignores malformed and unrelated cookie header entries', async () => {
    await runGate({
      path: '/api/docs',
      method: 'GET',
      headers: {
        cookie: `other=value; ${AUTH_SESSION_COOKIE_NAME}; another=value`,
      },
    });

    expect(keycloakAuthService.authenticateSession).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith('/api/auth/login/redirect?returnTo=%2Fapi%2Fdocs');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not gate non-docs root requests', async () => {
    await runGate({
      path: '/',
      method: 'GET',
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.redirect).not.toHaveBeenCalled();
    expect(keycloakAuthService.authenticateSession).not.toHaveBeenCalled();
  });

  it('uses request url when originalUrl is empty while redirecting', async () => {
    await runGate({
      path: '/api/docs',
      method: 'GET',
      originalUrl: '',
      url: '/api/docs?source=url',
    });

    expect(response.redirect).toHaveBeenCalledWith('/api/auth/login/redirect?returnTo=%2Fapi%2Fdocs%3Fsource%3Durl');
    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to the docs path when no original URL or request URL is available', async () => {
    await runGate({
      path: '/api/docs',
      method: 'GET',
      originalUrl: '',
      url: '',
    });

    expect(response.redirect).toHaveBeenCalledWith('/api/auth/login/redirect?returnTo=%2Fapi%2Fdocs');
    expect(next).not.toHaveBeenCalled();
  });

  it('redirects authenticated docs requests when the session can no longer be authenticated', async () => {
    keycloakAuthService.authenticateSession.mockRejectedValueOnce(new Error('expired session'));

    await runGate({
      path: '/api/docs',
      method: 'GET',
      cookies: {
        [AUTH_SESSION_COOKIE_NAME]: 'expired-session',
      },
    });

    expect(keycloakAuthService.authenticateSession).toHaveBeenCalledWith('expired-session');
    expect(response.redirect).toHaveBeenCalledWith('/api/auth/login/redirect?returnTo=%2Fapi%2Fdocs');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not gate GraphQL API posts', async () => {
    await runGate({
      path: '/api/graphql/',
      method: 'POST',
      accepts: jest.fn().mockReturnValue('json'),
    });

    expect(next).toHaveBeenCalledTimes(1);
    expect(response.redirect).not.toHaveBeenCalled();
    expect(keycloakAuthService.authenticateSession).not.toHaveBeenCalled();
  });

  async function runGate(request: MockRequest): Promise<void> {
    const gate = createDocsAuthGate({
      keycloakAuthService: keycloakAuthService as unknown as KeycloakAuthService,
      production: true,
    });

    await gate(
      {
        originalUrl: request.path,
        url: request.path,
        headers: {},
        accepts: jest.fn().mockReturnValue(false),
        ...request,
      } as Request,
      response as Response,
      next,
    );
  }
});
