import { AuthenticatedUser } from '@cacic-fct/shared-data-types';
import { Context, Query, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { AuthenticatedUser as AuthenticatedUserPayload } from './interfaces/authenticated-user.interface';
import { PublicAuthenticatedUser, toPublicAuthenticatedUser } from './public-authenticated-user';

type RequestWithUser = Request & {
  user?: AuthenticatedUserPayload;
};

type GraphqlContext = {
  req?: RequestWithUser;
  request?: RequestWithUser;
};

@Resolver()
export class AuthResolver {
  @Query(() => AuthenticatedUser, { name: 'me', nullable: true })
  me(@Context() context: GraphqlContext): PublicAuthenticatedUser | null {
    const user = context.req?.user ?? context.request?.user;
    return user ? toPublicAuthenticatedUser(user) : null;
  }
}
