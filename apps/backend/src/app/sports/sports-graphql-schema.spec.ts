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
    const credentialType = printed.match(/type SportsOfflineCollectorCredential \{[^}]+\}/)?.[0] ?? '';
    const eligibleLineupMemberType =
      printed.match(/type CurrentUserSportsEligibleLineupMemberRead \{[^}]+\}/)?.[0] ?? '';
    const rosterCheckInInput = printed.match(/input SportsRosterCheckInInput \{[^}]+\}/)?.[0] ?? '';
    const officialCheckInInput = printed.match(/input SportsOfficialCheckInInput \{[^}]+\}/)?.[0] ?? '';
    const scannerCheckInInput = printed.match(/input SportsRosterScannerCheckInInput \{[^}]+\}/)?.[0] ?? '';
    const athleteProfileInput = printed.match(/input SportsRegistrationMemberProfileUpdateInput \{[^}]+\}/)?.[0] ?? '';

    expect(printed).toContain('publicSportsTournamentDetail');
    expect(printed).toContain('currentUserSportsTeamWorkspace');
    expect(printed).toContain('adminSportsMatchActionReviewQueue');
    expect(printed).toContain('commitSportsMatchActions');
    expect(printed).toContain('createSportsOfflineCollectorCredential');
    expect(printed).toContain('collectorPersonId: String');
    expect(printed).toContain('collectorCredential: String');
    expect(credentialType).toContain('credential: String!');
    expect(credentialType).toContain('collectorPersonId: String!');
    expect(credentialType).toContain('issuedAt: DateTime!');
    expect(eligibleLineupMemberType).toContain('shirtNumber: String');
    expect(rosterCheckInInput).toContain('collectorPersonId: String');
    expect(rosterCheckInInput).toContain('collectorCredential: String');
    expect(officialCheckInInput).toContain('officialAssignmentId: String!');
    expect(officialCheckInInput).toContain('collectorCredential: String');
    expect(scannerCheckInInput).toContain('collectorPersonId: String');
    expect(scannerCheckInInput).toContain('collectorCredential: String');
    expect(printed).toContain('updateSportsRegistrationMemberProfile');
    expect(athleteProfileInput).toContain('shirtNumber: String');
    expect(athleteProfileInput).toContain('gameNickname: String');
    expect(athleteProfileInput).toContain('gameAccountName: String');
    expect(athleteProfileInput).toContain('gameAccountUrl: String');
    expect(printed).toContain('reviewSportsTeamChange');
    expect(printed).toContain('generateSportsBracket');
    expect(printed).toContain('publishSportsMatch');
    expect(printed).toContain('unpublishSportsMatch');
    expect(printed).toContain('input SportsMatchPublicationInput');
    expect(printed).toContain('checkInSportsOfficial');
  });
});
