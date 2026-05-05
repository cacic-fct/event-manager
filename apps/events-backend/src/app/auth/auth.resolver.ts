import { AuthenticatedUser } from '@cacic-eventos/shared-data-types';
import { Context, Query, Resolver } from '@nestjs/graphql';
import { Request } from 'express';
import { AuthenticatedUser as AuthenticatedUserPayload } from './interfaces/authenticated-user.interface';

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
  me(@Context() context: GraphqlContext): AuthenticatedUserPayload | null {
    return context.req?.user ?? context.request?.user ?? null;
  }
}
