import { IS_PUBLIC_KEY } from '../auth/auth.constants';
import { CurrentUserEventSubscriptionsResolver } from '../current-user/events/subscriptions.resolver';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import { PublicEventsResolver } from './events.resolver';

describe('map events GraphQL integration', () => {
  it('publishes a public located-event query and a separately authenticated current-user ID query', async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = module.get(GraphQLSchemaFactory);

    const schema = await factory.create([PublicEventsResolver, CurrentUserEventSubscriptionsResolver]);
    const printed = printSchema(schema);
    const mapEventType = printed.match(/type PublicMapEvent \{[^}]+\}/)?.[0] ?? '';

    expect(printed).toContain('publicMapEvents: [PublicMapEvent!]!');
    expect(printed).toContain('currentUserMapEventIds: [String!]!');
    expect(mapEventType).toContain('latitude: Float!');
    expect(mapEventType).toContain('longitude: Float!');
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, PublicEventsResolver)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, CurrentUserEventSubscriptionsResolver)).not.toBe(true);

    await module.close();
  });
});
