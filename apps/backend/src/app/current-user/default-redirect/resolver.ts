import { Context, Query, Resolver } from '@nestjs/graphql';
import { CurrentUserContextService } from '../context.service';
import { DefaultRedirectRoute } from '../models';
import { GraphqlContext } from '../selects';
import { CurrentUserDefaultRedirectService } from './service';

@Resolver()
export class CurrentUserDefaultRedirectResolver {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly defaultRedirect: CurrentUserDefaultRedirectService,
  ) {}

  @Query(() => DefaultRedirectRoute, {
    name: 'currentUserDefaultRedirect',
    description: 'Returns only the highest-priority default route for the authenticated user.',
  })
  async currentUserDefaultRedirect(@Context() context: GraphqlContext): Promise<DefaultRedirectRoute> {
    const person = await this.currentUserContext.requireCurrentPerson(context);
    return this.defaultRedirect.resolve(person.id);
  }
}
