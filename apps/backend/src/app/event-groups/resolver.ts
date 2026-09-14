import {
  DeletionResult,
  EventGroup,
  EventGroupCloneInput,
  EventGroupCreateInput,
  EventGroupUpdateInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { Args, Context, Int, Mutation, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { AuditLogEntityType, AuditLogOperation, CertificateScope, Prisma } from '@prisma/client';
import { AllowScopedCollectionPermissions } from '../auth/decorators/allow-scoped-collection-permissions.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../audit-log/audit-log.service';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { SportsBackingResourceLifecycleService } from '../sports/sports-backing-resource-lifecycle.service';
import { SportsMutationEventsService } from '../sports/realtime/sports-mutation-events.service';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { AttendanceCategoryService } from '../events/attendance-category.service';
import { CurrentUserOnlineAttendanceRealtimeService } from '../current-user/events/attendance-realtime.service';
import { AudienceInvitationService } from '../audiences/audience-invitation.service';
import { applyAudienceSettings, assertAudienceCloneAllowed, withAudienceAudit, withoutAudienceInput, type AudienceChange } from '../audiences/audience-input';
import { audienceContext } from '../audiences/audience-context';

type GraphqlContext = {
  req?: { user?: AuthenticatedUser };
  request?: { user?: AuthenticatedUser };
};

const DEFAULT_DRAFT_EVENT_GROUP_NAME = 'Grupo sem título';

const EVENT_GROUP_CLONE_SOURCE_SELECT = {
  audience: true,
  audienceCourseCodes: true,
  id: true,
  name: true,
  emoji: true,
  requiresImageLicenseAgreement: true,
  interestEnabled: true,
  shouldIssueCertificate: true,
  shouldIssueCertificateForNonPayingAttendees: true,
  shouldIssueCertificateForNonSubscribedAttendees: true,
  attendanceEligibility: true,
  shouldIssueCertificateForEachEvent: true,
  shouldIssuePartialCertificate: true,
  certificateConfigs: {
    where: {
      deletedAt: null,
    },
    select: {
      name: true,
      certificateTemplateId: true,
      certificateText: true,
      shouldAutofillSecondPage: true,
      secondPageText: true,
      isActive: true,
      issuedTo: true,
      certificateTypeLabel: true,
      certificateFields: true,
      attendeeEligibility: true,
    },
  },
} satisfies Prisma.EventGroupSelect;

@Resolver(() => EventGroup)
export class EventGroupsResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly typesenseSearch: TypesenseSearchService,
    private readonly frozenResources: FrozenResourceService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly auditLog: AuditLogService = {
      record: async () => undefined,
    } as unknown as AuditLogService,
    private readonly postCommitEffects: EventPostCommitEffectsService = {
      upsertEventGroup: (eventGroup) => typesenseSearch.upsertEventGroup(eventGroup),
      deleteEventGroup: (eventGroupId) => typesenseSearch.deleteEventGroup(eventGroupId),
    } as EventPostCommitEffectsService,
    private readonly sportsBackingLifecycle: SportsBackingResourceLifecycleService = {
      synchronizeEventGroupUpdate: async () => undefined,
      assertEventGroupDeleteAllowed: async () => undefined,
    } as unknown as SportsBackingResourceLifecycleService,
    private readonly sportsMutationEvents: SportsMutationEventsService = {
      publishForBackingEventGroup: async () => undefined,
    } as unknown as SportsMutationEventsService,
    private readonly attendanceCategories: AttendanceCategoryService = {
      refreshForEvent: async () => undefined,
    } as unknown as AttendanceCategoryService,
    private readonly attendanceRealtime: CurrentUserOnlineAttendanceRealtimeService = {
      notifyAllConnectedPeople: async () => undefined,
    } as unknown as CurrentUserOnlineAttendanceRealtimeService,
    private readonly audienceInvitations: AudienceInvitationService = new AudienceInvitationService(prisma),
  ) {}

  @ResolveField(() => Boolean)
  async isSportsCategory(@Parent() group: { id: string }): Promise<boolean> {
    return Boolean(
      await this.prisma.sportsCategory.findFirst({
        where: { eventGroupId: group.id, deletedAt: null },
        select: { id: true },
      }),
    );
  }

  @Query(() => [EventGroup], { name: 'eventGroups' })
  @AllowScopedCollectionPermissions()
  @RequirePermissions(Permission.EventGroup.Read)
  async eventGroups(
    @Context() context: GraphqlContext,
    @Args('query', { type: () => String, nullable: true }) query?: string,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
    @Args('take', { type: () => Int, nullable: true }) take?: number,
  ) {
    const pagination = resolvePagination(skip, take);
    const where: Prisma.EventGroupWhereInput = { deletedAt: null };
    const accessibleEventGroupIds = await this.authorizationPolicy.accessibleEventGroupIds(
      this.getUser(context),
      Permission.EventGroup.Read,
    );
    if (accessibleEventGroupIds && accessibleEventGroupIds.size === 0) {
      return [];
    }
    if (accessibleEventGroupIds) {
      where.id = {
        in: [...accessibleEventGroupIds],
      };
    }
    const normalizedQuery = query?.trim();
    let prioritizedIds: string[] = [];

    if (normalizedQuery) {
      if (this.typesenseSearch.isEnabled() && this.canUseAudienceUnscopedSearch()) {
        const searchResult = await this.typesenseSearch.searchEventGroups(
          normalizedQuery,
          pagination.skip + pagination.take,
        );
        if (searchResult.available) {
          prioritizedIds = searchResult.ids;
        } else {
          where.name = { contains: normalizedQuery, mode: 'insensitive' };
        }
        if (searchResult.available && accessibleEventGroupIds) {
          prioritizedIds = prioritizedIds.filter((id) => accessibleEventGroupIds.has(id));
        }
        if (searchResult.available && prioritizedIds.length === 0) {
          return [];
        }
        if (searchResult.available) {
          where.id = { in: prioritizedIds };
        }
      } else {
        where.name = { contains: normalizedQuery, mode: 'insensitive' };
      }
    }

    const groups = await this.prisma.eventGroup.findMany({
      where,
      orderBy: {
        name: 'asc',
      },
      skip: prioritizedIds.length > 0 ? 0 : pagination.skip,
      take: prioritizedIds.length > 0 ? prioritizedIds.length : pagination.take,
    });

    if (prioritizedIds.length === 0) {
      return groups;
    }

    const rank = new Map(prioritizedIds.map((id, index) => [id, index]));
    return [...groups]
      .sort(
        (left, right) =>
          (rank.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.id) ?? Number.MAX_SAFE_INTEGER),
      )
      .slice(pagination.skip, pagination.skip + pagination.take);
  }

  @Query(() => EventGroup, { name: 'eventGroup' })
  @RequirePermissions(Permission.EventGroup.Read)
  async eventGroup(@Args('id', { type: () => String }) id: string) {
    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (!eventGroup) {
      throw new NotFoundException(`Event group ${id} was not found.`);
    }

    return eventGroup;
  }

  @Mutation(() => EventGroup, { name: 'createEventGroup' })
  @RequirePermissions(Permission.EventGroup.Create)
  async createEventGroup(
    @Args('input', { type: () => EventGroupCreateInput })
    input: EventGroupCreateInput,
    @Context() context: GraphqlContext,
  ) {
    const normalizedInput = this.normalizeEventGroupCertificateInput({
      ...withoutAudienceInput(input),
      name: input.name?.trim() || DEFAULT_DRAFT_EVENT_GROUP_NAME,
    });
    let audienceChange: AudienceChange | undefined;
    const eventGroup = await this.prisma.$transaction(async (tx) => {
      let created = await tx.eventGroup.create({ data: normalizedInput });
      audienceChange = await applyAudienceSettings(tx, this.audienceInvitations, { targetType: 'EVENT_GROUP', targetId: created.id }, input, undefined, this.getUser(context)?.sub);
      if (audienceChange) created = await tx.eventGroup.findUniqueOrThrow({ where: { id: created.id } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_GROUP,
          entityId: created.id,
          entityLabel: created.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: withAudienceAudit(created, audienceChange),
          scope: { permission: Permission.EventGroup.Create, eventGroupId: created.id },
          summary: 'Grupo de eventos criado.',
        },
        tx,
      );
      return created;
    });
    await this.postCommitEffects.upsertEventGroup({
      id: eventGroup.id,
      name: eventGroup.name,
    });
    if (audienceChange) await this.audienceInvitations.notifyInvited({ type: 'EVENT_GROUP', id: eventGroup.id, name: eventGroup.name }, audienceChange.personIds);
    return eventGroup;
  }

  @Mutation(() => EventGroup, { name: 'updateEventGroup' })
  @RequirePermissions(Permission.EventGroup.Update)
  async updateEventGroup(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventGroupUpdateInput })
    input: EventGroupUpdateInput,
    @Context() context: GraphqlContext,
  ) {
    await this.frozenResources.assertEventGroupMutable(id, this.getUser(context), 'edit');
    const normalizedInput = this.normalizeEventGroupCertificateInput(withoutAudienceInput(input));
    let audienceChange: AudienceChange | undefined;
    const eventGroup = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.eventGroup.findFirst({ where: { id, deletedAt: null } });
      if (!previous) throw new NotFoundException(`Event group ${id} was not found.`);
      audienceChange = await applyAudienceSettings(tx, this.audienceInvitations, { targetType: 'EVENT_GROUP', targetId: id }, input, previous, this.getUser(context)?.sub);
      await this.sportsBackingLifecycle.synchronizeEventGroupUpdate(tx, id, normalizedInput);
      await tx.eventGroup.update({ where: { id, deletedAt: null }, data: normalizedInput });

      if (normalizedInput.attendanceEligibility !== undefined) {
        const events = await tx.event.findMany({
          where: { eventGroupId: id, deletedAt: null },
          select: { id: true },
        });
        for (const event of events) {
          await this.attendanceCategories.refreshForEvent(event.id, tx);
        }
      }

      if (normalizedInput.shouldIssueCertificate === false) {
        await tx.event.updateMany({
          where: { eventGroupId: id, deletedAt: null },
          data: {
            shouldIssueCertificate: false,
            shouldIssueCertificateForNonPayingAttendees: false,
            shouldIssueCertificateForNonSubscribedAttendees: false,
          },
        });
      } else if (
        normalizedInput.shouldIssueCertificateForNonPayingAttendees === false ||
        normalizedInput.shouldIssueCertificateForNonSubscribedAttendees === false
      ) {
        await tx.event.updateMany({
          where: { eventGroupId: id, deletedAt: null },
          data: {
            ...(normalizedInput.shouldIssueCertificateForNonPayingAttendees === false
              ? { shouldIssueCertificateForNonPayingAttendees: false }
              : {}),
            ...(normalizedInput.shouldIssueCertificateForNonSubscribedAttendees === false
              ? { shouldIssueCertificateForNonSubscribedAttendees: false }
              : {}),
          },
        });
      }

      const updated = await tx.eventGroup.findUniqueOrThrow({ where: { id, deletedAt: null } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_GROUP,
          entityId: updated.id,
          entityLabel: updated.name,
          operation: AuditLogOperation.UPDATE,
          actor: this.getUser(context),
          before: withAudienceAudit(previous, audienceChange, true),
          after: withAudienceAudit(updated, audienceChange),
          scope: { permission: Permission.EventGroup.Update, eventGroupId: updated.id },
          summary: 'Grupo de eventos atualizado.',
        },
        tx,
      );
      return updated;
    });
    if (eventGroup) {
      if (audienceChange) await this.audienceInvitations.notifyInvited({ type: 'EVENT_GROUP', id: eventGroup.id, name: eventGroup.name }, audienceChange.personIds);
      await this.postCommitEffects.upsertEventGroup({
        id: eventGroup.id,
        name: eventGroup.name,
      });
      await this.sportsMutationEvents.publishForBackingEventGroup(eventGroup.id);
      if (normalizedInput.attendanceEligibility !== undefined) {
        await this.attendanceRealtime.notifyAllConnectedPeople();
      }
    }
    return eventGroup;
  }

  @Mutation(() => EventGroup, { name: 'cloneEventGroup' })
  @RequirePermissions(Permission.EventGroup.Read)
  async cloneEventGroup(
    @Args('id', { type: () => String }) id: string,
    @Args('input', { type: () => EventGroupCloneInput, nullable: true }) input: EventGroupCloneInput | null,
    @Context() context: GraphqlContext,
  ) {
    const source = await this.prisma.eventGroup.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      select: EVENT_GROUP_CLONE_SOURCE_SELECT,
    });

    if (!source) {
      throw new NotFoundException(`Event group ${id} was not found.`);
    }
    assertAudienceCloneAllowed(source.audience);

    await this.authorizationPolicy.assertPermissions(this.getUser(context), [Permission.EventGroup.Create]);
    const shouldCopyCertificateConfig = Boolean(input?.parts?.certificateConfig);
    if (shouldCopyCertificateConfig) {
      await this.authorizationPolicy.assertPermissions(this.getUser(context), [Permission.CertificateConfig.Read], {
        eventGroupId: source.id,
      });
      await this.authorizationPolicy.assertPermissions(this.getUser(context), [Permission.CertificateConfig.Create]);
    }

    const normalizedInput = this.normalizeEventGroupCertificateInput({
      name: this.buildCloneName(input?.name, source.name),
      audience: source.audience,
      audienceCourseCodes: source.audienceCourseCodes,
      emoji: source.emoji,
      requiresImageLicenseAgreement: source.requiresImageLicenseAgreement,
      attendanceEligibility: source.attendanceEligibility,
      ...(shouldCopyCertificateConfig
        ? {
            shouldIssueCertificate: source.shouldIssueCertificate,
            shouldIssueCertificateForNonPayingAttendees: source.shouldIssueCertificateForNonPayingAttendees,
            shouldIssueCertificateForNonSubscribedAttendees: source.shouldIssueCertificateForNonSubscribedAttendees,
            shouldIssueCertificateForEachEvent: source.shouldIssueCertificateForEachEvent,
            shouldIssuePartialCertificate: source.shouldIssuePartialCertificate,
          }
        : {}),
    });

    const eventGroup = await this.prisma.$transaction(async (tx) => {
      const created = await tx.eventGroup.create({ data: normalizedInput });
      if (shouldCopyCertificateConfig) {
        await this.cloneCertificateConfigsForEventGroup(tx, source.certificateConfigs, created.id);
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_GROUP,
          entityId: created.id,
          entityLabel: created.name,
          operation: AuditLogOperation.CREATE,
          actor: this.getUser(context),
          after: created,
          scope: { permission: Permission.EventGroup.Create, eventGroupId: created.id },
          summary: `Grupo de eventos criado como cópia de ${source.name}.`,
        },
        tx,
      );
      return created;
    });
    await this.postCommitEffects.upsertEventGroup({
      id: eventGroup.id,
      name: eventGroup.name,
    });
    return eventGroup;
  }

  @Mutation(() => DeletionResult, { name: 'deleteEventGroup' })
  @RequirePermissions(Permission.EventGroup.Delete)
  async deleteEventGroup(@Args('id', { type: () => String }) id: string, @Context() context: GraphqlContext) {
    await this.frozenResources.assertEventGroupMutable(id, this.getUser(context), 'delete');
    const deletedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const eventGroup = await tx.eventGroup.findFirst({ where: { id, deletedAt: null } });
      if (!eventGroup) throw new NotFoundException(`Event group ${id} was not found.`);
      await this.sportsBackingLifecycle.assertEventGroupDeleteAllowed(tx, id);
      await tx.eventGroup.update({ where: { id, deletedAt: null }, data: { deletedAt } });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.EVENT_GROUP,
          entityId: id,
          entityLabel: eventGroup.name,
          operation: AuditLogOperation.DELETE,
          actor: this.getUser(context),
          before: eventGroup,
          after: { ...eventGroup, deletedAt },
          scope: { permission: Permission.EventGroup.Delete, eventGroupId: id },
          summary: 'Grupo de eventos excluído.',
          force: true,
        },
        tx,
      );
    });
    await this.postCommitEffects.deleteEventGroup(id);
    return {
      deleted: true,
      id,
    };
  }

  private normalizeEventGroupCertificateInput<T extends EventGroupCreateInput | EventGroupUpdateInput>(input: T): T {
    if (input.shouldIssueCertificate === false) {
      return {
        ...input,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        shouldIssueCertificateForEachEvent: false,
        shouldIssuePartialCertificate: false,
      };
    }

    return input;
  }

  private async cloneCertificateConfigsForEventGroup(
    tx: Prisma.TransactionClient,
    configs: Array<{
      name: string;
      certificateTemplateId: string;
      certificateText: string | null;
      shouldAutofillSecondPage: boolean;
      secondPageText: string | null;
      isActive: boolean;
      issuedTo: Prisma.CertificateConfigCreateInput['issuedTo'];
      certificateTypeLabel: string | null;
      certificateFields: Prisma.JsonValue;
      attendeeEligibility: Prisma.CertificateConfigCreateInput['attendeeEligibility'];
    }>,
    eventGroupId: string,
  ): Promise<void> {
    for (const config of configs) {
      await tx.certificateConfig.create({
        data: {
          name: config.name,
          scope: CertificateScope.EVENT_GROUP,
          eventGroupId,
          certificateTemplateId: config.certificateTemplateId,
          certificateText: config.certificateText,
          shouldAutofillSecondPage: config.shouldAutofillSecondPage,
          secondPageText: config.secondPageText,
          isActive: config.isActive,
          issuedTo: config.issuedTo,
          certificateTypeLabel: config.certificateTypeLabel,
          attendeeEligibility: config.attendeeEligibility,
          certificateFields:
            config.certificateFields === null ? Prisma.DbNull : (config.certificateFields as Prisma.InputJsonValue),
        },
      });
    }
  }

  private buildCloneName(inputName: string | null | undefined, sourceName: string): string {
    const name = inputName?.trim();
    return name || `${sourceName} (cópia)`;
  }

  private getUser(context: GraphqlContext): AuthenticatedUser | undefined {
    return context.req?.user ?? context.request?.user;
  }

  private canUseAudienceUnscopedSearch(): boolean {
    const principal = audienceContext.getStore();
    return principal === undefined || principal.bypass;
  }
}
