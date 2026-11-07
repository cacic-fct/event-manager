import { buildSchema, graphql, type GraphQLResolveInfo } from 'graphql';
import { graphqlFieldRequested } from './graphql-field-requested';

describe('graphqlFieldRequested', () => {
  const schema = buildSchema(`
    type Query { feed: [Item!]! }
    type Item { id: ID!, selectedEvents: [Event!]!, majorEvent: Event! }
    type Event { id: ID!, paymentInfo: String }
  `);

  async function selections(source: string, variableValues?: Record<string, boolean>) {
    let captured: GraphQLResolveInfo | undefined;
    const result = await graphql({
      schema,
      source,
      variableValues,
      rootValue: {
        feed: (_args: unknown, _context: unknown, info: GraphQLResolveInfo) => {
          captured = info;
          return [];
        },
      },
    });
    expect(result.errors).toBeUndefined();
    expect(captured).toBeDefined();
    return captured;
  }

  it('omits activity and payment reads for the participation list projection', async () => {
    const info = await selections('{ feed { id majorEvent { id } } }');
    expect(graphqlFieldRequested(info, ['selectedEvents'])).toBe(false);
    expect(graphqlFieldRequested(info, ['majorEvent', 'paymentInfo'])).toBe(false);
  });

  it('recognizes schema names through aliases, nested fragments, and merged field selections', async () => {
    const info = await selections(`
      { feed { id } feed { ...Details } }
      fragment Details on Item {
        activities: selectedEvents { id }
        majorEvent { ... on Event { ...Payment } }
      }
      fragment Payment on Event { payment: paymentInfo }
    `);
    expect(graphqlFieldRequested(info, ['selectedEvents'])).toBe(true);
    expect(graphqlFieldRequested(info, ['majorEvent', 'paymentInfo'])).toBe(true);
  });

  it('preserves the full projection for direct callers without GraphQL selection metadata', () => {
    expect(graphqlFieldRequested(undefined, ['selectedEvents'])).toBe(true);
  });

  it.each([false, true])('honors conditional fields and fragment spreads when included=%s', async (included) => {
    const info = await selections(
      `
      query Conditional($included: Boolean!, $skipped: Boolean!) {
        feed {
          id
          ...Activities @include(if: $included)
          ... on Item @skip(if: $skipped) { majorEvent { paymentInfo } }
        }
      }
      fragment Activities on Item { selectedEvents { id } }
    `,
      { included, skipped: !included },
    );
    expect(graphqlFieldRequested(info, ['selectedEvents'])).toBe(included);
    expect(graphqlFieldRequested(info, ['majorEvent', 'paymentInfo'])).toBe(included);
  });
});
