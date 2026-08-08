import { Permission } from '@cacic-fct/shared-permissions';
import { SportsApplicationStatus } from '@cacic-fct/shared-data-types';
import { Args, Context, Int, Query, Resolver } from '@nestjs/graphql';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { CurrentUserContextService } from '../../current-user/context.service';
import { GraphqlContext } from '../../current-user/selects';
import {
  AdminSportsPlayerApplicationRead,
  CurrentUserSportsPlayerApplicationRead,
} from './sports-player-application-read.models';
import { SportsPlayerApplicationReadService } from './sports-player-application-read.service';

@Resolver()
export class SportsPlayerApplicationAdminReadResolver {
  constructor(
    private readonly applications: SportsPlayerApplicationReadService,
    private readonly currentUser: CurrentUserContextService,
  ) {}

  @Query(() => [AdminSportsPlayerApplicationRead], {
    name: 'adminSportsPlayerApplicationQueue',
  })
  @RequirePermissions(Permission.SportsRegistration.Read)
  adminQueue(
    @Args('tournamentId', { type: () => String }) tournamentId: string,
    @Args('statuses', {
      type: () => [SportsApplicationStatus],
      nullable: true,
    })
    statuses: SportsApplicationStatus[] | undefined,
    @Args('cursor', { type: () => String, nullable: true })
    cursor: string | undefined,
    @Args('limit', { type: () => Int, nullable: true })
    limit: number | undefined,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsPlayerApplicationRead[]> {
    return this.applications.adminQueue(this.currentUser.getAuthenticatedUser(context), tournamentId, statuses, {
      cursor,
      limit,
    });
  }

  @Query(() => AdminSportsPlayerApplicationRead, {
    name: 'adminSportsPlayerApplication',
  })
  @RequirePermissions(Permission.SportsRegistration.Read)
  adminDetail(
    @Args('applicationId', { type: () => String }) applicationId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsPlayerApplicationRead> {
    return this.applications.adminDetail(this.currentUser.getAuthenticatedUser(context), applicationId);
  }
}

@Resolver()
export class SportsPlayerApplicationCurrentUserReadResolver {
  constructor(
    private readonly applications: SportsPlayerApplicationReadService,
    private readonly currentUser: CurrentUserContextService,
  ) {}

  @Query(() => [CurrentUserSportsPlayerApplicationRead], {
    name: 'currentUserSportsPlayerApplications',
  })
  async currentUserApplications(
    @Args('tournamentId', { type: () => String }) tournamentId: string,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserSportsPlayerApplicationRead[]> {
    const person = await this.currentUser.requireCurrentPerson(context);
    return this.applications.currentUserApplications(tournamentId, person.id);
  }
}
