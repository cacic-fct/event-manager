import { Permission } from '@cacic-fct/shared-permissions';
import { SportsApplicationStatus } from '@cacic-fct/shared-data-types';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
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
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsPlayerApplicationRead[]> {
    return this.applications.adminQueue(
      this.getUser(context),
      tournamentId,
      statuses,
    );
  }

  @Query(() => AdminSportsPlayerApplicationRead, {
    name: 'adminSportsPlayerApplication',
  })
  @RequirePermissions(Permission.SportsRegistration.Read)
  adminDetail(
    @Args('applicationId', { type: () => String }) applicationId: string,
    @Context() context: GraphqlContext,
  ): Promise<AdminSportsPlayerApplicationRead> {
    return this.applications.adminDetail(
      this.getUser(context),
      applicationId,
    );
  }

  private getUser(
    context: GraphqlContext,
  ): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
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
    return this.applications.currentUserApplications(
      tournamentId,
      person.id,
    );
  }
}
