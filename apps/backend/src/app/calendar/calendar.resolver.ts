import { EventManagerKeycloakRole } from '@cacic-fct/shared-permissions';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CurrentUserContextService } from '../current-user/context.service';
import { GraphqlContext, UserRecord } from '../current-user/selects';
import {
  CurrentUserAdminCalendarFeedSettings,
  CurrentUserCalendarFeedSettings,
  SuperAdminCalendarFeedSettings,
} from './calendar.models';
import { CalendarService } from './calendar.service';

@Resolver()
export class CalendarResolver {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly calendars: CalendarService,
  ) {}

  @Query(() => CurrentUserCalendarFeedSettings, {
    name: 'currentUserCalendarFeedSettings',
    description: 'Read private calendar feed settings for the current authenticated user.',
  })
  async currentUserCalendarFeedSettings(@Context() context: GraphqlContext): Promise<CurrentUserCalendarFeedSettings> {
    const user = await this.resolveCurrentUser(context);
    return this.calendars.getCurrentUserCalendarFeedSettings(user.id);
  }

  @Mutation(() => CurrentUserCalendarFeedSettings, {
    name: 'setCurrentUserCalendarFeedEnabled',
    description: 'Enable or disable the current user private calendar feed. Enabling issues a new private key.',
  })
  async setCurrentUserCalendarFeedEnabled(
    @Args('enabled', {
      type: () => Boolean,
      description: 'Whether the private calendar feed should be enabled.',
    })
    enabled: boolean,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserCalendarFeedSettings> {
    const user = await this.resolveCurrentUser(context);
    return this.calendars.setCurrentUserCalendarFeedEnabled(user.id, enabled);
  }

  @Mutation(() => CurrentUserCalendarFeedSettings, {
    name: 'rotateCurrentUserCalendarFeedKey',
    description: 'Rotate the private calendar feed key for the current authenticated user.',
  })
  async rotateCurrentUserCalendarFeedKey(@Context() context: GraphqlContext): Promise<CurrentUserCalendarFeedSettings> {
    const user = await this.resolveCurrentUser(context);
    return this.calendars.rotateCurrentUserCalendarFeedKey(user.id);
  }

  @Query(() => CurrentUserAdminCalendarFeedSettings, {
    name: 'currentUserAdminCalendarFeedSettings',
    description: 'Read private administrative calendar feed settings for the current authenticated admin user.',
  })
  async currentUserAdminCalendarFeedSettings(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserAdminCalendarFeedSettings> {
    const { authenticatedUser, user } = await this.resolveCurrentAdminUser(context);
    this.assertNotSuperAdmin(authenticatedUser);
    return this.calendars.getCurrentUserAdminCalendarFeedSettings(user.id);
  }

  @Mutation(() => CurrentUserAdminCalendarFeedSettings, {
    name: 'setCurrentUserAdminCalendarFeedEnabled',
    description:
      'Enable or disable the current admin private calendar feed. Enabling issues a new private key.',
  })
  async setCurrentUserAdminCalendarFeedEnabled(
    @Args('enabled', {
      type: () => Boolean,
      description: 'Whether the private administrative calendar feed should be enabled.',
    })
    enabled: boolean,
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserAdminCalendarFeedSettings> {
    const { authenticatedUser, user } = await this.resolveCurrentAdminUser(context);
    this.assertNotSuperAdmin(authenticatedUser);
    return this.calendars.setCurrentUserAdminCalendarFeedEnabled(user.id, enabled);
  }

  @Mutation(() => CurrentUserAdminCalendarFeedSettings, {
    name: 'rotateCurrentUserAdminCalendarFeedKey',
    description: 'Rotate the private administrative calendar feed key for the current authenticated admin user.',
  })
  async rotateCurrentUserAdminCalendarFeedKey(
    @Context() context: GraphqlContext,
  ): Promise<CurrentUserAdminCalendarFeedSettings> {
    const { authenticatedUser, user } = await this.resolveCurrentAdminUser(context);
    this.assertNotSuperAdmin(authenticatedUser);
    return this.calendars.rotateCurrentUserAdminCalendarFeedKey(user.id);
  }

  @RequireRoles(EventManagerKeycloakRole.SuperAdmin)
  @Query(() => SuperAdminCalendarFeedSettings, {
    name: 'superAdminCalendarFeedSettings',
    description: 'Read the shared super-admin administrative calendar feed settings.',
  })
  async superAdminCalendarFeedSettings(): Promise<SuperAdminCalendarFeedSettings> {
    return this.calendars.getSuperAdminCalendarFeedSettings();
  }

  @RequireRoles(EventManagerKeycloakRole.SuperAdmin)
  @Mutation(() => SuperAdminCalendarFeedSettings, {
    name: 'rotateSuperAdminCalendarFeedKey',
    description: 'Rotate the shared super-admin calendar feed key, invalidating it for every super-admin user.',
  })
  async rotateSuperAdminCalendarFeedKey(): Promise<SuperAdminCalendarFeedSettings> {
    return this.calendars.rotateSuperAdminCalendarFeedKey();
  }

  private async resolveCurrentUser(context: GraphqlContext): Promise<UserRecord> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    const { user } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser, true);
    if (!user) {
      throw new BadRequestException('Could not resolve the current user.');
    }

    return user;
  }

  private async resolveCurrentAdminUser(
    context: GraphqlContext,
  ): Promise<{ authenticatedUser: AuthenticatedUser; user: UserRecord }> {
    const authenticatedUser = this.currentUserContext.getAuthenticatedUser(context);
    if (!this.authorizationPolicy.hasEventManagerAccess(authenticatedUser)) {
      throw new ForbiddenException('Event Manager access is required to manage administrative calendar feeds.');
    }

    const { user } = await this.currentUserContext.resolveCurrentUserContext(authenticatedUser, true);
    if (!user) {
      throw new BadRequestException('Could not resolve the current user.');
    }

    return { authenticatedUser, user };
  }

  private assertNotSuperAdmin(authenticatedUser: AuthenticatedUser): void {
    if (this.authorizationPolicy.isSuperAdmin(authenticatedUser)) {
      throw new BadRequestException('Super-admin users must use the shared administrative calendar feed.');
    }
  }
}
