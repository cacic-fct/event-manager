import { parse } from 'graphql';
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
  });
});
