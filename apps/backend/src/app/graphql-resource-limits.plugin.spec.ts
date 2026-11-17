import { ApolloServer } from '@apollo/server';
import { jest } from '@jest/globals';
import { getIntrospectionQuery, parse } from 'graphql';
import { AUTH_SESSION_COOKIE_NAME } from './auth/auth.constants';
import { createIntrospectionAuthPlugin, type GraphqlRequestContext } from './auth/introspection-auth.plugin';
import type { AuthenticatedUser } from './auth/interfaces/authenticated-user.interface';
import { createGraphqlResourceLimitsPlugin } from './graphql-resource-limits.plugin';

describe('GraphQL resource limits plugin', () => {
  async function resolve(query: string) {
    const plugin = createGraphqlResourceLimitsPlugin();
    const listener = await plugin.requestDidStart({ request: { query } } as never);
    return listener?.didResolveOperation?.({ document: parse(query) } as never);
  }

  it('rejects oversized queries before operation execution', async () => {
    await expect(resolve(`query { ${'x'.repeat(110_000)} }`)).rejects.toThrow('GraphQL query is too large.');
  });

  it('rejects multiple operations and excessive aliases', async () => {
    await expect(resolve('query First { __typename } query Second { __typename }')).rejects.toThrow(
      'Only one GraphQL operation',
    );

    const aliases = Array.from({ length: 51 }, (_, index) => `field${index}: __typename`).join('\n');
    await expect(resolve(`query { ${aliases} }`)).rejects.toThrow('too many aliases');
  });

  it('rejects deeply nested selections and preserves fragment traversal limits', async () => {
    let nested = '__typename';
    for (let index = 0; index < 13; index += 1) {
      nested = `viewer { ${nested} }`;
    }
    await expect(resolve(`query { ${nested} }`)).rejects.toThrow('too deeply nested');
    await expect(
      resolve(
        `query { ...SchemaInfo ${nested} } fragment SchemaInfo on Query { schema: __schema { queryType { name } } }`,
      ),
    ).rejects.toThrow('too deeply nested');
  });

  it('preserves a separate depth bound for introspection fields', async () => {
    let nested = 'name';
    for (let index = 0; index < 16; index += 1) {
      nested = `ofType { ${nested} }`;
    }
    await expect(resolve(`{ __type(name: "Query") { ${nested} } }`)).rejects.toThrow('too deeply nested');
  });
});

describe('production GraphQL introspection', () => {
  const user = {} as AuthenticatedUser;
  const authenticateSession = jest.fn(async (sessionId: string) => {
    if (sessionId !== 'valid-session') {
      throw new Error('Invalid session');
    }
    return user;
  });
  const authenticateAccessToken = jest.fn(async (token: string) => {
    if (token !== 'valid-token') {
      throw new Error('Invalid access token');
    }
    return user;
  });
  const server = new ApolloServer<GraphqlRequestContext>({
    typeDefs: 'type Query { health: String }',
    introspection: true,
    plugins: [
      createGraphqlResourceLimitsPlugin(),
      createIntrospectionAuthPlugin({
        keycloakAuthService: { authenticateSession, authenticateAccessToken },
        production: true,
      }),
    ],
  });
  const query = getIntrospectionQuery();

  afterAll(() => server.stop());

  async function execute(query: string, headers: { cookie?: string; authorization?: string } = {}) {
    const req = { headers } as GraphqlRequestContext['req'];
    const { body } = await server.executeOperation({ query }, { contextValue: { req } });
    if (body.kind !== 'single') {
      throw new Error('Expected a single GraphQL response');
    }
    return body.singleResult;
  }

  it('returns the full schema for a valid session', async () => {
    const result = await execute(query, { cookie: `${AUTH_SESSION_COOKIE_NAME}=valid-session` });
    expect(result.errors).toBeUndefined();
    expect(result.data?.['__schema']).toMatchObject({ queryType: { name: 'Query' } });
  });

  it('allows schema introspection with a valid bearer token', async () => {
    const result = await execute('{ __type(name: "Query") { name } }', { authorization: 'Bearer valid-token' });
    expect(result).toMatchObject({ data: { __type: { name: 'Query' } } });
  });

  it.each([undefined, `${AUTH_SESSION_COOKIE_NAME}=expired-session`])(
    'rejects introspection without a valid session (%s)',
    async (cookie) => {
      const result = await execute(query, { cookie });
      expect(result.errors?.[0]?.extensions?.['code']).toBe('UNAUTHENTICATED');
      expect(result.data).toBeUndefined();
    },
  );

  it('allows public queries without a session', async () => {
    expect(await execute('{ __typename }')).toMatchObject({ data: { __typename: 'Query' } });
  });
});
