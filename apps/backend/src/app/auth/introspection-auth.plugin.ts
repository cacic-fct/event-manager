import type { ApolloServerPlugin, GraphQLRequestContextDidResolveOperation } from '@apollo/server';
import { GraphQLError, visit } from 'graphql';
import { authenticateHttpRequest, type AuthenticatedRequest } from './authenticated-request';

export type GraphqlRequestContext = {
  req?: AuthenticatedRequest;
  request?: AuthenticatedRequest;
};

type IntrospectionAuthPluginOptions = {
  readonly keycloakAuthService: Parameters<typeof authenticateHttpRequest>[1];
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

          try {
            await authenticateHttpRequest(request, keycloakAuthService);
          } catch {
            throwUnauthenticatedIntrospectionError();
          }
        },
      };
    },
  };
}

function containsIntrospectionField(
  document: GraphQLRequestContextDidResolveOperation<GraphqlRequestContext>['document'],
) {
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

function getRequest(
  requestContext: GraphQLRequestContextDidResolveOperation<GraphqlRequestContext>,
): AuthenticatedRequest {
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

function throwUnauthenticatedIntrospectionError(): never {
  throw new GraphQLError('GraphQL introspection requires authentication.', {
    extensions: {
      code: 'UNAUTHENTICATED',
    },
  });
}
