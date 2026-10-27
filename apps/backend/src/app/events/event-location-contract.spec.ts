import { Test } from '@nestjs/testing';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { parse, validate } from 'graphql';
import { PUBLIC_EVENT_PAGE_FIELDS, PUBLIC_MAP_EVENT_FIELDS } from '@cacic-fct/event-manager-public-contracts/graphql';
import { PublicEventsResolver, PublicMapEventLocationResolver } from '../public-events/events.resolver';
import { EventsResolver } from './resolver';
import { PlacePresetsResolver } from '../places/resolver';
import { EventSubscriberInformationResolver } from './event-subscriber-information.resolver';

describe('structured location GraphQL contract', () => {
  it('builds the schema and validates public labels, separate fields, and subscriber-only queries', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module
        .get(GraphQLSchemaFactory)
        .create([
          PublicEventsResolver,
          PublicMapEventLocationResolver,
          EventsResolver,
          PlacePresetsResolver,
          EventSubscriberInformationResolver,
        ]);
      const errors = validate(
        schema,
        parse(`query Locations($eventId: String!, $eventIds: [String!]!) {
        publicEvent(id: $eventId) { ${PUBLIC_EVENT_PAGE_FIELDS} }
        publicMapEvents { ${PUBLIC_MAP_EVENT_FIELDS} }
        currentUserEventSubscriberInformation(eventId: $eventId) { content updatedAt }
        currentUserEventSubscriberInformationList(eventIds: $eventIds) { eventId content }
      }`),
      );
      expect(errors.map((error) => error.message)).toEqual([]);
      const publicType = schema.getType('PublicEvent');
      expect(publicType && 'getFields' in publicType && publicType.getFields()).not.toHaveProperty(
        'locationInternalNotes',
      );
      expect(publicType && 'getFields' in publicType && publicType.getFields()).not.toHaveProperty(
        'subscriberInformation',
      );
    } finally {
      await module.close();
    }
  });
});
