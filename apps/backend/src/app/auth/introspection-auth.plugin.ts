import type { ApolloServerPlugin, GraphQLRequestContextDidResolveOperation } from '@apollo/server';
import { GraphQLError, visit } from 'graphql';
import type { Request } from 'express';
import { AUTH_SESSION_COOKIE_NAME } from './auth.constants';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { KeycloakAuthService } from './keycloak-auth.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
  cookies?: Record<string, unknown>;
};

export type GraphqlRequestContext = {
  req?: RequestWithUser;
  request?: RequestWithUser;
};

type IntrospectionAuthPluginOptions = {
  readonly keycloakAuthService: KeycloakAuthService;
  readonly production: boolean;
};

export function createIntrospectionAuthPlugin({
  keycloakAuthService,
  production,
}: IntrospectionAuthPluginOptions): ApolloServerPlugin<GraphqlRequestContext> {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation(requestContext) {
          if (!production || !requestContext.document || !containsIntrospectionField(requestContext.document)) {
            return;
          }

          const request = getRequest(requestContext);
          const accessToken = extractBearerToken(request.headers.authorization);
          if (accessToken) {
            request.user = await keycloakAuthService.authenticateAccessToken(accessToken);
            return;
          }

          const sessionId = extractCookieValue(request, AUTH_SESSION_COOKIE_NAME);
          if (sessionId) {
            request.user = await keycloakAuthService.authenticateSession(sessionId);
            return;
          }

          throw new GraphQLError('GraphQL introspection requires authentication.', {
            extensions: {
              code: 'UNAUTHENTICATED',
            },
          });
        },
      };
    },
  };
}

function containsIntrospectionField(document: GraphQLRequestContextDidResolveOperation<GraphqlRequestContext>['document']) {
  let containsIntrospection = false;

  visit(document, {
    Field(node) {
      if (node.name.value === '__schema' || node.name.value === '__type') {
        containsIntrospection = true;
        return false;
      }

      return undefined;
    },
  });

  return containsIntrospection;
}

function getRequest(requestContext: GraphQLRequestContextDidResolveOperation<GraphqlRequestContext>): RequestWithUser {
  const request = requestContext.contextValue.req ?? requestContext.contextValue.request;
  if (!request) {
    throw new GraphQLError('Missing request context.', {
      extensions: {
        code: 'UNAUTHENTICATED',
      },
    });
  }

  return request;
}

function extractBearerToken(authorizationHeader?: string | string[]): string | null {
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

function extractCookieValue(request: RequestWithUser, key: string): string | null {
  const parsedCookie = request.cookies?.[key];
  if (typeof parsedCookie === 'string') {
    return parsedCookie;
  }

  const header = Array.isArray(request.headers.cookie) ? request.headers.cookie[0] : request.headers.cookie;
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
