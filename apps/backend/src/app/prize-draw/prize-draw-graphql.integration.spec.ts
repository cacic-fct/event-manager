import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import { PrizeDrawResolver } from './prize-draw.resolver';

describe('prize draw GraphQL integration', () => {
  it('publishes complete admin, operator, public, and availability contracts in the generated schema', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    const factory = module.get(GraphQLSchemaFactory);

    const schema = await factory.create([PrizeDrawResolver]);
    const printed = printSchema(schema);

    expect(printed).toContain('prizeDraws: [PrizeDraw!]!');
    expect(printed).toContain('prizeDraw(drawId: String!): PrizeDraw!');
    expect(printed).toContain('prizeDrawEligibleEntries(drawId: String!): [PrizeDrawEligibleEntry!]!');
    expect(printed).toContain(
      'publicPrizeDraws(eventId: String, majorEventId: String, eventGroupId: String): [PrizeDraw!]!',
    );
    expect(printed).toContain(
      'publicPrizeDrawAvailability(eventIds: [String!], majorEventIds: [String!], eventGroupIds: [String!]): [PrizeDrawAvailability!]!',
    );
    expect(printed).toContain('savePrizeDraw(input: SavePrizeDrawInput!): PrizeDraw!');
    expect(printed).toContain('freezePrizeDrawEligibility(drawId: String!): PrizeDraw!');
    expect(printed).toContain('unfreezePrizeDrawEligibility(drawId: String!): PrizeDraw!');
    expect(printed).toContain('spinPrizeDraw(input: SpinPrizeDrawInput!): PrizeDrawSpinResult!');
    expect(printed).toContain('undoLastPrizeDrawSpin(drawId: String!): PrizeDraw!');
    expect(printed).toContain('prizeDrawWinnerContact(spinId: String!): PrizeDrawWinnerContact!');

    await module.close();
  });
});
