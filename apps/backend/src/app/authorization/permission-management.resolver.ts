import { Permission } from '@cacic-fct/shared-permissions';
import { Args, Context, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { EventManagerPermissionScope } from '@prisma/client';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  PermissionGroup,
  PermissionGroupSaveInput,
  PermissionRole,
  PermissionRoleSaveInput,
  PermissionScopeTarget,
} from './permission-management.models';
import { PermissionManagementService } from './permission-management.service';

type GraphqlContext = { req?: { user?: AuthenticatedUser }; request?: { user?: AuthenticatedUser } };

@Resolver()
export class PermissionManagementResolver {
  constructor(private readonly management: PermissionManagementService) {}

  @Query(() => [PermissionRole], { name: 'permissionRoles' })
  @RequirePermissions(Permission.PermissionGrant.Read)
  permissionRoles(@Args('includeArchived', { type: () => Boolean, nullable: true }) includeArchived?: boolean) {
    return this.management.listRoles(includeArchived ?? false);
  }

  @Query(() => [PermissionGroup], { name: 'permissionGroups' })
  @RequirePermissions(Permission.PermissionGrant.Read, Permission.Person.Read)
  permissionGroups(@Args('includeArchived', { type: () => Boolean, nullable: true }) includeArchived?: boolean) {
    return this.management.listGroups(includeArchived ?? false);
  }

  @Query(() => [PermissionScopeTarget], { name: 'permissionScopeTargets' })
  @RequirePermissions(Permission.PermissionGrant.Read)
  permissionScopeTargets(
    @Args('scope', { type: () => EventManagerPermissionScope }) scope: EventManagerPermissionScope,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    return this.management.listScopeTargets(scope, take);
  }

  @Mutation(() => PermissionRole, { name: 'savePermissionRole' })
  @RequirePermissions()
  savePermissionRole(
    @Args('input', { type: () => PermissionRoleSaveInput }) input: PermissionRoleSaveInput,
    @Context() context: GraphqlContext,
  ) {
    return this.management.saveRole(input, this.requireActor(context));
  }

  @Mutation(() => PermissionGroup, { name: 'savePermissionGroup' })
  @RequirePermissions()
  savePermissionGroup(
    @Args('input', { type: () => PermissionGroupSaveInput }) input: PermissionGroupSaveInput,
    @Context() context: GraphqlContext,
  ) {
    return this.management.saveGroup(input, this.requireActor(context));
  }

  @Mutation(() => Boolean, { name: 'archivePermissionRole' })
  @RequirePermissions(Permission.PermissionGrant.Delete)
  archivePermissionRole(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    return this.management.archiveRole(id, this.requireActor(context));
  }

  @Mutation(() => Boolean, { name: 'archivePermissionGroup' })
  @RequirePermissions(Permission.PermissionGrant.Delete)
  archivePermissionGroup(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    return this.management.archiveGroup(id, this.requireActor(context));
  }

  private requireActor(context: GraphqlContext): AuthenticatedUser {
    const actor = context.req?.user ?? context.request?.user;
    if (!actor) throw new Error('Authenticated actor is required.');
    return actor;
  }
}
