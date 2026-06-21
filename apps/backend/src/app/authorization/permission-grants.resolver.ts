import { Permission } from '@cacic-fct/shared-permissions';
import { DeletionResult } from '@cacic-fct/shared-data-types';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { EventManagerPermissionGrantScope } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantCreateInput,
  EventManagerPermissionGrantTarget,
  EventManagerPermissionGrantUpdateInput,
} from './permission-grants.models';
import { PermissionGrantsService } from './permission-grants.service';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

@Resolver(() => EventManagerPermissionGrant)
export class PermissionGrantsResolver {
  constructor(private readonly permissionGrants: PermissionGrantsService) {}

  @Query(() => [EventManagerPermissionGrant], {
    name: 'eventManagerPermissionGrants',
  })
  @RequirePermissions(Permission.PermissionGrant.Read)
  eventManagerPermissionGrants(@Args('userId', { type: () => String }) userId: string) {
    return this.permissionGrants.listUserGrants(userId);
  }

  @Query(() => [EventManagerPermissionGrantTarget], {
    name: 'eventManagerPermissionGrantTargets',
  })
  @RequirePermissions(Permission.PermissionGrant.Read)
  eventManagerPermissionGrantTargets(
    @Args('scope', { type: () => EventManagerPermissionGrantScope }) scope: EventManagerPermissionGrantScope,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.permissionGrants.listGrantTargets(scope, take);
  }

  @Mutation(() => EventManagerPermissionGrant, {
    name: 'createEventManagerPermissionGrant',
  })
  @RequirePermissions(Permission.PermissionGrant.Create)
  createEventManagerPermissionGrant(
    @Args('input', { type: () => EventManagerPermissionGrantCreateInput })
    input: EventManagerPermissionGrantCreateInput,
    @Context() context: GraphqlContext,
  ) {
    return this.permissionGrants.createGrant(input, this.getActorId(context));
  }

  @Mutation(() => EventManagerPermissionGrant, {
    name: 'updateEventManagerPermissionGrant',
  })
  @RequirePermissions(Permission.PermissionGrant.Update)
  updateEventManagerPermissionGrant(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventManagerPermissionGrantUpdateInput })
    input: EventManagerPermissionGrantUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    return this.permissionGrants.updateGrant(id, input, this.getActorId(context));
  }

  @Mutation(() => DeletionResult, {
    name: 'deleteEventManagerPermissionGrant',
  })
  @RequirePermissions(Permission.PermissionGrant.Delete)
  async deleteEventManagerPermissionGrant(
    @Args('id', { type: () => String }) id: string,
    @Context() context: GraphqlContext,
  ) {
    await this.permissionGrants.deleteGrant(id, this.getActorId(context));
    return {
      deleted: true,
      id,
    };
  }

  private getActorId(context: GraphqlContext): string | undefined {
    const user = context.req?.user ?? context.request?.user;
    return user?.sub ?? user?.email ?? user?.preferredUsername;
  }
}
