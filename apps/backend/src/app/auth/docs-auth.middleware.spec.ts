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
