import { Context, Query, Resolver } from '@nestjs/graphql';
import { CurrentUserContextService } from '../context.service';
import { CurrentUserEventMapperService } from '../mapper.service';
import { CurrentUserProfileContext } from '../models';
import { GraphqlContext } from '../selects';

@Resolver()
export class CurrentUserProfileResolver {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly mapper: CurrentUserEventMapperService,
  ) {}

  @Query(() => CurrentUserProfileContext, { name: 'currentUserProfileContext' })
  async currentUserProfileContext(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserProfileContext> {
    const authenticatedUser =
      this.currentUserContext.getAuthenticatedUser(context);
    const { user, person } =
      await this.currentUserContext.resolveCurrentUserContext(
        authenticatedUser,
        true,
      );

    return {
      sub: authenticatedUser.sub,
      email: authenticatedUser.email,
      preferredUsername: authenticatedUser.preferredUsername,
      authenticatedUser,
      user: user ? this.mapper.mapUser(user) : undefined,
      person: person ? this.mapper.mapPerson(person) : undefined,
    };
  }
}
