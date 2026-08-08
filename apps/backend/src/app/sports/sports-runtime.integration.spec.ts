import { SportsTournamentStatus } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test, TestingModule } from '@nestjs/testing';
import { printSchema } from 'graphql';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserContextService } from '../current-user/context.service';
import { PrismaService } from '../prisma/prisma.service';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import {
  SportsPlayerApplicationAdminReadResolver,
  SportsPlayerApplicationCurrentUserReadResolver,
} from './applications/sports-player-application-read.resolver';
import { SportsPlayerApplicationService } from './applications/sports-player-application.service';
import { SportsBracketService } from './brackets/sports-bracket.service';
import { SportsDuplicationService } from './duplication/sports-duplication.service';
import { SportsMatchOperationService } from './operations/sports-match-operation.service';
import {
  SportsAdminReadResolver,
  SportsCurrentUserReadResolver,
  SportsPublicReadResolver,
} from './read/sports-read.resolver';
import { SportsReadService } from './read/sports-read.service';
import { SportsMutationEventsService } from './realtime/sports-mutation-events.service';
import { SportsMatchRosterService } from './rosters/sports-match-roster.service';
import { SportsAutoroutingResolver } from './routing/sports-autorouting.resolver';
import { SportsAccessService } from './security/sports-access.service';
import { SportsAdminService } from './sports-admin.service';
import {
  SportsDuplicationMutationsResolver,
  SportsLifecycleMutationsResolver,
  SportsMatchAdminMutationsResolver,
  SportsParticipantMutationsResolver,
  SportsReviewMutationsResolver,
  SportsTeamMutationsResolver,
  SportsTournamentMutationsResolver,
} from './sports-mutations.resolver';
import { SportsTeamChangeService } from './teams/sports-team-change.service';

describe('sports runtime integration', () => {
  const actor = { sub: 'admin-1', token: 'token', permissionSet: new Set<string>() };
  const policy = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const currentUser = {
    getAuthenticatedUser: jest.fn().mockReturnValue(actor),
    requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
  };
  const admin = {
    attachTournament: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
  };
  const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
  const sportsRead = {
    publicTournament: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
    currentUserTournament: jest.fn().mockResolvedValue({ id: 'tournament-1' }),
  };
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    moduleRef = await Test.createTestingModule({
      imports: [GraphQLSchemaBuilderModule],
      providers: [
        {
          provide: SportsTournamentMutationsResolver,
          useFactory: () =>
            new SportsTournamentMutationsResolver(
              policy as never,
              {} as never,
              {} as never,
              currentUser as never,
              admin as never,
              {} as never,
              {} as never,
              {} as never,
              {} as never,
              {} as never,
              {} as never,
              {} as never,
              mutationEvents as never,
            ),
        },
        SportsPublicReadResolver,
        SportsCurrentUserReadResolver,
        { provide: AuthorizationPolicyService, useValue: policy },
        { provide: FrozenResourceService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: CurrentUserContextService, useValue: currentUser },
        { provide: SportsAdminService, useValue: admin },
        { provide: SportsAccessService, useValue: {} },
        { provide: SportsTeamChangeService, useValue: {} },
        { provide: SportsPlayerApplicationService, useValue: {} },
        { provide: SportsMatchRosterService, useValue: {} },
        { provide: SportsMatchOperationService, useValue: {} },
        { provide: SportsBracketService, useValue: {} },
        { provide: SportsDuplicationService, useValue: {} },
        { provide: SportsMutationEventsService, useValue: mutationEvents },
        { provide: SportsReadService, useValue: sportsRead },
      ],
    })
      .overrideGuard(RateLimitGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();
  });

  afterEach(async () => moduleRef?.close());

  it('builds the complete application-registered GraphQL surface', async () => {
    const schema = await moduleRef.get(GraphQLSchemaFactory).create([
      SportsAdminReadResolver,
      SportsPublicReadResolver,
      SportsCurrentUserReadResolver,
      SportsAutoroutingResolver,
      SportsPlayerApplicationAdminReadResolver,
      SportsPlayerApplicationCurrentUserReadResolver,
      SportsTournamentMutationsResolver,
      SportsTeamMutationsResolver,
      SportsMatchAdminMutationsResolver,
      SportsLifecycleMutationsResolver,
      SportsReviewMutationsResolver,
      SportsDuplicationMutationsResolver,
      SportsParticipantMutationsResolver,
    ]);
    const printed = printSchema(schema);

    for (const operation of [
      'adminSportsPlayerApplicationQueue',
      'currentUserSportsPlayerApplications',
      'currentUserSportsAutoroute',
      'publicSportsTournamentDetail',
      'currentUserSportsTournamentDetail',
      'createSportsTournament',
      'commitSportsMatchActions',
      'reviewSportsMatchAction',
    ]) {
      expect(printed).toContain(operation);
    }
  });

  it('carries a created tournament through authorization, mutation publication, and public/current-user reads', async () => {
    const mutations = moduleRef.get(SportsTournamentMutationsResolver);
    const publicReads = moduleRef.get(SportsPublicReadResolver);
    const currentUserReads = moduleRef.get(SportsCurrentUserReadResolver);
    const input = {
      majorEventId: 'major-event-1',
      status: SportsTournamentStatus.DRAFT,
      selfSubscriptionEnabled: true,
      selfSubscriptionAllowNoTeam: false,
      selfSubscriptionAllowNoCategory: false,
      allowPlayerMultipleTeams: false,
    };

    await expect(mutations.createTournament(input, { req: { user: actor } })).resolves.toBe('tournament-1');
    expect(policy.assertPermissions).toHaveBeenCalledWith(actor, [Permission.SportsTournament.Create], {
      majorEventId: 'major-event-1',
    });
    expect(admin.attachTournament).toHaveBeenCalledWith(expect.objectContaining(input), actor);
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('TOURNAMENT', 'tournament-1', true);

    await expect(publicReads.publicSportsTournamentDetail('tournament-1')).resolves.toEqual({ id: 'tournament-1' });
    expect(sportsRead.publicTournament).toHaveBeenCalledWith({
      tournamentId: 'tournament-1',
      majorEventId: undefined,
    });

    await expect(
      currentUserReads.currentUserSportsTournamentDetail({ req: { user: actor } }, 'tournament-1'),
    ).resolves.toEqual({ id: 'tournament-1' });
    expect(currentUser.requireCurrentPerson).toHaveBeenCalledWith({ req: { user: actor } });
    expect(sportsRead.currentUserTournament).toHaveBeenCalledWith(
      { tournamentId: 'tournament-1', majorEventId: undefined },
      'person-1',
    );
  });
});
