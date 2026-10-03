import { IncludePastParticipation } from './past-participation.decorator';
import { Event, EventGroup, MajorEvent, EventAudience, EventAudienceInvitation } from '@cacic-fct/shared-data-types';
import { Context, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIENCE_ADMIN_SELECT } from './audience-input';
import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException } from '@nestjs/common';
import { AuthorizationPolicyService, type AuthorizationResourceContext } from '../authorization/authorization-policy.service';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

type AudienceGraphqlContext = { req?: { user?: AuthenticatedUser }; request?: { user?: AuthenticatedUser } };

async function canManageInvitations(authorization: AuthorizationPolicyService, context: AudienceGraphqlContext, permission: string, target: AuthorizationResourceContext): Promise<boolean> {
  try {
    await authorization.assertPermissions(context.req?.user ?? context.request?.user, [permission], target);
    return true;
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

async function invitationSelect(authorization: AuthorizationPolicyService, context: AudienceGraphqlContext) {
  const user = context.req?.user ?? context.request?.user;
  const permissions = await authorization.evaluateGlobalPermissions(user, [Permission.Person.Read]);
  return permissions.includes(Permission.Person.Read)
    ? AUDIENCE_ADMIN_SELECT
    : { audienceInvitations: { select: { personId: true } } } as const;
}

type AudienceParent = { id: string; audience?: EventAudience; audienceCourseCodes?: string[] };

@Resolver(() => Event)
export class EventAudienceFieldsResolver {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationPolicyService) {}

  @ResolveField(() => EventAudience)
  @IncludePastParticipation()
  async audience(@Parent() parent: AudienceParent) {
    return parent.audience ?? (await this.prisma.event.findUniqueOrThrow({ where: { id: parent.id }, select: { audience: true } })).audience;
  }

  @ResolveField(() => [String])
  @IncludePastParticipation()
  async audienceCourseCodes(@Parent() parent: AudienceParent) {
    return parent.audienceCourseCodes ?? (await this.prisma.event.findUniqueOrThrow({ where: { id: parent.id }, select: { audienceCourseCodes: true } })).audienceCourseCodes;
  }

  @ResolveField(() => [EventAudienceInvitation])
  async audienceInvitations(@Parent() parent: AudienceParent, @Context() context: AudienceGraphqlContext) {
    if (!(await canManageInvitations(this.authorization, context, Permission.Event.Update, { eventId: parent.id }))) return [];
    const select = await invitationSelect(this.authorization, context);
    const record = await this.prisma.event.findUniqueOrThrow({ where: { id: parent.id }, select });
    return record.audienceInvitations.map((invitation) => ({ ...invitation, person: 'person' in invitation ? invitation.person : null }));
  }
}

@Resolver(() => EventGroup)
export class EventGroupAudienceFieldsResolver {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationPolicyService) {}

  @ResolveField(() => EventAudience)
  @IncludePastParticipation()
  async audience(@Parent() parent: AudienceParent) {
    return parent.audience ?? (await this.prisma.eventGroup.findUniqueOrThrow({ where: { id: parent.id }, select: { audience: true } })).audience;
  }

  @ResolveField(() => [String])
  @IncludePastParticipation()
  async audienceCourseCodes(@Parent() parent: AudienceParent) {
    return parent.audienceCourseCodes ?? (await this.prisma.eventGroup.findUniqueOrThrow({ where: { id: parent.id }, select: { audienceCourseCodes: true } })).audienceCourseCodes;
  }

  @ResolveField(() => [EventAudienceInvitation])
  async audienceInvitations(@Parent() parent: AudienceParent, @Context() context: AudienceGraphqlContext) {
    if (!(await canManageInvitations(this.authorization, context, Permission.EventGroup.Update, { eventGroupId: parent.id }))) return [];
    const select = await invitationSelect(this.authorization, context);
    const record = await this.prisma.eventGroup.findUniqueOrThrow({ where: { id: parent.id }, select });
    return record.audienceInvitations.map((invitation) => ({ ...invitation, person: 'person' in invitation ? invitation.person : null }));
  }
}

@Resolver(() => MajorEvent)
export class MajorEventAudienceFieldsResolver {
  constructor(private readonly prisma: PrismaService, private readonly authorization: AuthorizationPolicyService) {}

  @ResolveField(() => EventAudience)
  @IncludePastParticipation()
  async audience(@Parent() parent: AudienceParent) {
    return parent.audience ?? (await this.prisma.majorEvent.findUniqueOrThrow({ where: { id: parent.id }, select: { audience: true } })).audience;
  }

  @ResolveField(() => [String])
  @IncludePastParticipation()
  async audienceCourseCodes(@Parent() parent: AudienceParent) {
    return parent.audienceCourseCodes ?? (await this.prisma.majorEvent.findUniqueOrThrow({ where: { id: parent.id }, select: { audienceCourseCodes: true } })).audienceCourseCodes;
  }

  @ResolveField(() => [EventAudienceInvitation])
  async audienceInvitations(@Parent() parent: AudienceParent, @Context() context: AudienceGraphqlContext) {
    if (!(await canManageInvitations(this.authorization, context, Permission.MajorEvent.Update, { majorEventId: parent.id }))) return [];
    const select = await invitationSelect(this.authorization, context);
    const record = await this.prisma.majorEvent.findUniqueOrThrow({ where: { id: parent.id }, select });
    return record.audienceInvitations.map((invitation) => ({ ...invitation, person: 'person' in invitation ? invitation.person : null }));
  }
}
