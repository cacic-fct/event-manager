import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { printSchema } from 'graphql';
import {
  SportsAdminReadResolver,
  SportsCurrentUserReadResolver,
  SportsPublicReadResolver,
} from './read/sports-read.resolver';
import { SportsAutoroutingResolver } from './routing/sports-autorouting.resolver';
import {
  SportsDuplicationMutationsResolver,
  SportsLifecycleMutationsResolver,
  SportsMatchAdminMutationsResolver,
  SportsParticipantMutationsResolver,
  SportsReviewMutationsResolver,
  SportsTeamMutationsResolver,
  SportsTournamentMutationsResolver,
} from './sports-mutations.resolver';

describe('sports GraphQL schema', () => {
  it('builds the complete sports query and mutation surface', async () => {
    const module = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
    }).compile();
    const factory = module.get(GraphQLSchemaFactory);

    const schema = await factory.create([
      SportsAdminReadResolver,
      SportsPublicReadResolver,
      SportsCurrentUserReadResolver,
      SportsAutoroutingResolver,
      SportsTournamentMutationsResolver,
      SportsTeamMutationsResolver,
      SportsMatchAdminMutationsResolver,
      SportsLifecycleMutationsResolver,
      SportsReviewMutationsResolver,
      SportsDuplicationMutationsResolver,
      SportsParticipantMutationsResolver,
    ]);
    const printed = printSchema(schema);

    expect(printed).toContain('publicSportsTournamentDetail');
    expect(printed).toContain('currentUserSportsTeamWorkspace');
    expect(printed).toContain('commitSportsMatchActions');
    expect(printed).toContain('reviewSportsTeamChange');
    expect(printed).toContain('generateSportsBracket');
  });
});
