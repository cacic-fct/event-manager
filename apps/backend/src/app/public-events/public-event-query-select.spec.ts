import { buildSchema, graphql, type GraphQLResolveInfo } from 'graphql';
import { PUBLIC_EVENT_SELECT } from './models';
import { publicEventQuerySelect } from './public-event-query-select';
import { PublicEventsResolver } from './events.resolver';
const { jest } = import.meta;

describe('public event query projections', () => {
  const schema = buildSchema(`
    type Query { event: Event! }
    type Event {
      id: ID!, name: String!, description: String, shortDescription: String,
      majorEvent: Related, eventGroup: Related, sportsMatch: Related
    }
    type Related { id: ID! }
  `);

  async function query(source: string) {
    const findFirst = jest.fn().mockResolvedValue({ id: 'event-1', name: 'Evento' });
    const resolver = new PublicEventsResolver({ event: { findFirst } } as never, {} as never);
    const result = await graphql({
      schema,
      source,
      rootValue: {
        event: (_args: unknown, _context: unknown, info: GraphQLResolveInfo) => resolver.publicEvent('event-1', info),
      },
    });
    expect(result.errors).toBeUndefined();
    return findFirst.mock.calls[0][0];
  }

  it('omits content and nested hydration for a small card query while keeping resolver dependencies', async () => {
    const { select } = await query('{ event { id name } }');
    expect(select).toEqual(
      expect.objectContaining({
        id: true,
        displayLecturerProfile: true,
        locationName: true,
        locationDescription: true,
        description: false,
        shortDescription: false,
        majorEvent: false,
        eventGroup: false,
        sportsMatch: false,
      }),
    );
  });

  it('preserves requested content and relations through aliases and fragments', async () => {
    const { select } = await query(`
      { event { id text: description ...Details } }
      fragment Details on Event { shortDescription parent: majorEvent { id } eventGroup { id } sportsMatch { id } }
    `);
    expect(select).toEqual(PUBLIC_EVENT_SELECT);
  });

  it('preserves the complete projection for internal callers', () => {
    expect(publicEventQuerySelect()).toEqual(PUBLIC_EVENT_SELECT);
  });
});
