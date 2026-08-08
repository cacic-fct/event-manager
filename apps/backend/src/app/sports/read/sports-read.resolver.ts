import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { Public } from '../../auth/decorators/public.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../../current-user/context.service';
import { GraphqlContext } from '../../current-user/selects';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import {
  AdminSportsCategoryRead,
  AdminSportsMatchReviewRead,
  AdminSportsRegistrationRead,
  AdminSportsTeamRead,
  AdminSportsTournamentRead,
  AdminSportsTournamentListItem,
  CurrentUserSportsLineupRead,
  CurrentUserSportsMatchOperationsRead,
  CurrentUserSportsTournamentDetail,
  PublicSportsMatch,
  PublicSportsTournamentDetail,
  RepresentativeSportsTeamWorkspace,
} from './sports-read.models';
import { SportsReadService } from './sports-read.service';
import { SportsAccessService } from '../security/sports-access.service';

@Resolver()
export class SportsAdminReadResolver {
  constructor(private readonly sportsRead: SportsReadService) {}

  @Query(() => [AdminSportsTournamentListItem], {
    name: 'adminSportsTournamentList',
    description:
      'Permission-scoped sports tournament summaries used by the admin workspace. Scoped grants only reveal their containing tournament.',
  })
  adminSportsTournamentList(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ): Promise<AdminSportsTournamentListItem[]> {
    return this.sportsRead.adminTournamentList(this.getUser(context), {
      query,
      skip,
      take,
    });
  }

  @Query(() => AdminSportsTournamentRead, { name: 'adminSportsTournamentRead' })
  adminSportsTournamentRead(
    @Args('tournamentId', { type: () => String }) tournamentId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsTournamentRead> {
    return this.sportsRead.adminTournament(this.getUser(context), tournamentId);
  }

  @Query(() => AdminSportsCategoryRead, { name: 'adminSportsCategoryRead' })
  adminSportsCategoryRead(
    @Args('categoryId', { type: () => String }) categoryId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsCategoryRead> {
    return this.sportsRead.adminCategory(this.getUser(context), categoryId);
  }

  @Query(() => AdminSportsTeamRead, { name: 'adminSportsTeamRead' })
  adminSportsTeamRead(
    @Args('teamId', { type: () => String }) teamId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsTeamRead> {
    return this.sportsRead.adminTeam(this.getUser(context), teamId);
  }

  @Query(() => AdminSportsRegistrationRead, { name: 'adminSportsRegistrationRead' })
  adminSportsRegistrationRead(
    @Args('registrationId', { type: () => String }) registrationId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsRegistrationRead> {
    return this.sportsRead.adminRegistration(this.getUser(context), registrationId);
  }

  @Query(() => AdminSportsMatchReviewRead, { name: 'adminSportsMatchReviewRead' })
  adminSportsMatchReviewRead(
    @Args('matchId', { type: () => String }) matchId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsMatchReviewRead> {
    return this.sportsRead.adminMatchReview(this.getUser(context), matchId);
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }
}

@Public()
@Resolver()
export class SportsPublicReadResolver {
  constructor(private readonly sportsRead: SportsReadService) {}

  @Query(() => PublicSportsTournamentDetail, { name: 'publicSportsTournamentDetail' })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  publicSportsTournamentDetail(
    @Args('tournamentId', { type: () => String, nullable: true }) tournamentId?: string,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ): Promise<PublicSportsTournamentDetail> {
    return this.sportsRead.publicTournament({ tournamentId, majorEventId });
  }

  @Query(() => PublicSportsMatch, { name: 'publicSportsMatchDetail' })
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.publicEvents)
  publicSportsMatchDetail(@Args('matchId', { type: () => String }) matchId: string): Promise<PublicSportsMatch> {
    return this.sportsRead.publicMatch(matchId);
  }
}

@Resolver()
export class SportsCurrentUserReadResolver {
  constructor(
    private readonly sportsRead: SportsReadService,
    private readonly currentUser: CurrentUserContextService,
    private readonly access: SportsAccessService,
  ) {}

  @Query(() => CurrentUserSportsTournamentDetail, {
    name: 'currentUserSportsTournamentDetail',
  })
  async currentUserSportsTournamentDetail(
    @Context() context: GraphqlContext,
    @Args('tournamentId', { type: () => String, nullable: true }) tournamentId?: string,
    @Args('majorEventId', { type: () => String, nullable: true }) majorEventId?: string,
  ): Promise<CurrentUserSportsTournamentDetail> {
    const person = await this.currentUser.requireCurrentPerson(context);
    return this.sportsRead.currentUserTournament({ tournamentId, majorEventId }, person.id);
  }

  @Query(() => RepresentativeSportsTeamWorkspace, {
    name: 'currentUserSportsTeamWorkspace',
  })
  async currentUserSportsTeamWorkspace(
    @Context() context: GraphqlContext,
    @Args('teamId', { type: () => String }) teamId: string,
  ): Promise<RepresentativeSportsTeamWorkspace> {
    const { actor } = await this.access.requireTeamRepresentative(context, teamId);
    return this.sportsRead.representativeTeamWorkspace(teamId, actor.id);
  }

  @Query(() => CurrentUserSportsMatchOperationsRead, {
    name: 'currentUserSportsMatchOperations',
    description:
      'Official-scoped operational match snapshot with approved roster entry identifiers and privacy-limited names.',
  })
  async currentUserSportsMatchOperations(
    @Context() context: GraphqlContext,
    @Args('matchId', { type: () => String }) matchId: string,
  ): Promise<CurrentUserSportsMatchOperationsRead> {
    await this.access.requireMatchOfficial(context, matchId);
    return this.sportsRead.currentUserMatchOperations(matchId);
  }

  @Query(() => CurrentUserSportsLineupRead, {
    name: 'currentUserSportsLineup',
    description: 'Participant-scoped eligible members and current per-match lineup snapshot.',
  })
  async currentUserSportsLineup(
    @Context() context: GraphqlContext,
    @Args('matchId', { type: () => String }) matchId: string,
    @Args('registrationId', { type: () => String }) registrationId: string,
  ): Promise<CurrentUserSportsLineupRead> {
    await this.access.requireLineupReader(context, registrationId);
    return this.sportsRead.currentUserLineup(matchId, registrationId);
  }
}
