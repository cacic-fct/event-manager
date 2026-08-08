import { Field, ObjectType, Query, Resolver, Context } from '@nestjs/graphql';
import { CurrentUserContextService } from '../../current-user/context.service';
import { GraphqlContext } from '../../current-user/selects';
import { SportsAutoroute, SportsAutoroutingService } from './sports-autorouting.service';

@ObjectType()
export class CurrentUserSportsAutoroute {
  @Field(() => String, { nullable: true })
  matchId?: string;

  @Field(() => String, { nullable: true })
  teamId?: string;

  @Field(() => String, {
    description:
      'CHECK_IN, OPERATE, FINALIZE, MATCH_DETAIL, WALLET, or TEAM. The client maps this stable mode to a route.',
  })
  mode!: string;
}

@Resolver()
export class SportsAutoroutingResolver {
  constructor(
    private readonly currentUser: CurrentUserContextService,
    private readonly autorouting: SportsAutoroutingService,
  ) {}

  @Query(() => CurrentUserSportsAutoroute, {
    name: 'currentUserSportsAutoroute',
    nullable: true,
  })
  async currentUserSportsAutoroute(@Context() context: GraphqlContext): Promise<SportsAutoroute | null> {
    const person = await this.currentUser.requireCurrentPerson(context);
    return this.autorouting.resolveCurrentUserRoute(person.id);
  }
}
