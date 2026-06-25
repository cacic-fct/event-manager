import { Injectable } from '@nestjs/common';
import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma } from '@prisma/client';
import {
  AccessibleEventGrantTargets,
  AuthorizationPolicyService,
} from '../authorization/authorization-policy.service';
import { resolvePagination } from '../common/pagination';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import {
  assertPublicationTargetPermission,
  getPublicationUser,
} from './publishing-auth';
import { buildPublicationConsistencyWarnings } from './publishing-consistency';
import { PublicationJobsService } from './publishing-jobs.service';
import {
  PublicContentPreviewInput,
  PublicContentPreviewPayload,
  PublicContentPreviewResult,
  PublicContentWorkspace,
  PublicContentNode,
  PublicationActionResult,
  PublicationBulkInput,
  PublicationStateInput,
} from './publishing.models';
import { PublicationPreviewService } from './publishing-preview.service';
import { PublicationTransitionService } from './publishing-transition.service';
import { publicationStateLabel } from './publishing-labels';

const PUBLICATION_WORKSPACE_MAX_TAKE = 100;

type PublicationWorkspaceInput = {
  query?: string | null;
  skip?: number;
  take?: number;
  focusTargetType?: PublicationTargetType | null;
  focusTargetId?: string | null;
};

const PUBLICATION_WORKSPACE_MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  publicationState: true,
  scheduledPublishAt: true,
  publishedAt: true,
  unpublishedAt: true,
  _count: {
    select: {
      events: {
        where: {
          deletedAt: null,
        },
      },
    },
  },
} satisfies Prisma.MajorEventSelect;

const PUBLICATION_WORKSPACE_EVENT_GROUP_SELECT = {
  id: true,
  name: true,
  _count: {
    select: {
      events: {
        where: {
          deletedAt: null,
        },
      },
    },
  },
} satisfies Prisma.EventGroupSelect;

const PUBLICATION_WORKSPACE_EVENT_SELECT = {
  id: true,
  name: true,
  publiclyVisible: true,
  publicationState: true,
  scheduledPublishAt: true,
  publishedAt: true,
  unpublishedAt: true,
  majorEventId: true,
  eventGroupId: true,
  majorEvent: {
    select: {
      id: true,
      name: true,
    },
  },
  eventGroup: {
    select: {
      id: true,
      name: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.EventSelect;

const PUBLICATION_WARNING_EVENT_SELECT = {
  id: true,
  name: true,
  publiclyVisible: true,
  publicationState: true,
  scheduledPublishAt: true,
  majorEventId: true,
  majorEvent: {
    select: {
      id: true,
      name: true,
      publicationState: true,
    },
  },
} satisfies Prisma.EventSelect;

const PUBLICATION_WARNING_MAJOR_EVENT_SELECT = {
  id: true,
  name: true,
  publicationState: true,
  scheduledPublishAt: true,
  events: {
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      publiclyVisible: true,
      publicationState: true,
    },
  },
} satisfies Prisma.MajorEventSelect;

type PublicationWorkspaceMajorEventRecord = Prisma.MajorEventGetPayload<{
  select: typeof PUBLICATION_WORKSPACE_MAJOR_EVENT_SELECT;
}>;
type PublicationWorkspaceEventGroupRecord = Prisma.EventGroupGetPayload<{
  select: typeof PUBLICATION_WORKSPACE_EVENT_GROUP_SELECT;
}>;
type PublicationWorkspaceEventRecord = Prisma.EventGetPayload<{
  select: typeof PUBLICATION_WORKSPACE_EVENT_SELECT;
}>;

type SectionWindow = {
  skip: number;
  take: number;
};

@Injectable()
export class PublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService,
    private readonly transitions: PublicationTransitionService,
    private readonly previews: PublicationPreviewService,
    private readonly jobs: PublicationJobsService,
  ) {}

  async getWorkspace(
    context: GraphqlContext,
    input: PublicationWorkspaceInput = {},
  ): Promise<PublicContentWorkspace> {
    const user = getPublicationUser(context);
    await this.authorizationPolicy.assertPermissions(
      user,
      [Permission.Event.Read, Permission.EventGroup.Read, Permission.MajorEvent.Read],
      { allowScopedCollection: true },
    );

    const now = new Date();
    const pagination = this.resolveWorkspacePagination(input.skip, input.take);
    const normalizedQuery = input.query?.trim() || null;
    const [eventTargets, majorEventIds, eventGroupIds] = await Promise.all([
      this.authorizationPolicy.accessibleEventTargets(user, Permission.Event.Read),
      this.authorizationPolicy.accessibleMajorEventIds(user, Permission.MajorEvent.Read),
      this.authorizationPolicy.accessibleEventGroupIds(user, Permission.EventGroup.Read),
    ]);
    const eventAccessWhere = this.buildAccessibleEventWhere(eventTargets);
    const majorEventAccessWhere = this.buildAccessibleIdWhere<Prisma.MajorEventWhereInput>(majorEventIds);
    const eventGroupAccessWhere = this.buildAccessibleIdWhere<Prisma.EventGroupWhereInput>(eventGroupIds);
    const activeEventWhere = this.andWhere<Prisma.EventWhereInput>({ deletedAt: null }, eventAccessWhere);
    const accessibleTreeEventWhere = this.andWhere<Prisma.EventWhereInput>(
      activeEventWhere,
      this.buildAccessibleEventParentWhere(majorEventIds, eventGroupIds),
    );
    const eventWhere = this.andWhere<Prisma.EventWhereInput>(
      accessibleTreeEventWhere,
      this.buildEventSearchWhere(normalizedQuery),
    );
    const majorEventBaseWhere = this.andWhere<Prisma.MajorEventWhereInput>(
      { deletedAt: null },
      majorEventAccessWhere,
    );
    const majorEventWhere = this.andWhere<Prisma.MajorEventWhereInput>(
      majorEventBaseWhere,
      this.buildNameSearchWhere<Prisma.MajorEventWhereInput>(normalizedQuery),
    );
    const eventGroupWhere = this.andWhere<Prisma.EventGroupWhereInput>(
      {
        deletedAt: null,
        events: {
          some: accessibleTreeEventWhere,
        },
      },
      eventGroupAccessWhere,
      this.buildNameSearchWhere<Prisma.EventGroupWhereInput>(normalizedQuery),
    );

    const [majorEventCount, eventGroupCount, eventCount] = await Promise.all([
      this.prisma.majorEvent.count({ where: majorEventWhere }),
      this.prisma.eventGroup.count({ where: eventGroupWhere }),
      this.prisma.event.count({ where: eventWhere }),
    ]);
    const totalCount = majorEventCount + eventGroupCount + eventCount;
    const windows = this.buildSectionWindows(pagination.skip, pagination.take, [
      majorEventCount,
      eventGroupCount,
      eventCount,
    ]);

    const [majorEvents, eventGroups, events, allEvents, publicationMajorEvents] = await Promise.all([
      this.listMajorEvents(majorEventWhere, windows[0]),
      this.listEventGroups(eventGroupWhere, windows[1]),
      this.listEvents(eventWhere, windows[2]),
      this.listWarningEvents(accessibleTreeEventWhere, windows[2]),
      this.listWarningMajorEvents(majorEventBaseWhere, activeEventWhere, windows[0]),
    ]);
    const treeEvents = await this.listTreeEvents(accessibleTreeEventWhere, majorEvents, eventGroups);

    const pageItems = [
      ...majorEvents.map((majorEvent) => this.mapMajorEventNode(majorEvent)),
      ...eventGroups.map((eventGroup) => this.mapEventGroupNode(eventGroup)),
      ...events.map((event) => this.mapEventNode(event)),
    ];
    const focusedNode = await this.findFocusedNode(input, {
      eventWhere: accessibleTreeEventWhere,
      eventGroupWhere,
      majorEventWhere: majorEventBaseWhere,
    });
    const items =
      focusedNode &&
      !pageItems.some((node) => node.targetType === focusedNode.targetType && node.id === focusedNode.id)
        ? [focusedNode, ...pageItems]
        : pageItems;

    return {
      generatedAt: now,
      tree: this.buildTree(majorEvents, eventGroups, events, treeEvents),
      items,
      totalCount,
      skip: pagination.skip,
      take: pagination.take,
      hasMore: pagination.skip + pagination.take < totalCount,
      query: normalizedQuery,
      warnings: buildPublicationConsistencyWarnings({
        now,
        events: allEvents,
        majorEvents: publicationMajorEvents,
      }),
    };
  }

  async setPublicationState(input: PublicationStateInput, context: GraphqlContext): Promise<PublicationActionResult> {
    const user = getPublicationUser(context);
    await assertPublicationTargetPermission(
      this.authorizationPolicy,
      user,
      input.targetType,
      input.targetId,
      this.updatePermission(input.targetType),
    );

    const outcome = await this.transitions.setPublicationState(input, user);
    await this.jobs.enqueueScheduledJobs(outcome.scheduledState, outcome.scheduledPublishAt, outcome.sync);
    return outcome.result;
  }

  async runBulkOperation(input: PublicationBulkInput, context: GraphqlContext): Promise<PublicationActionResult> {
    const user = getPublicationUser(context);
    await assertPublicationTargetPermission(
      this.authorizationPolicy,
      user,
      input.targetType,
      input.targetId,
      this.updatePermission(input.targetType),
    );

    const outcome = await this.transitions.runBulkOperation(input, user);
    await this.jobs.enqueueScheduledJobs(outcome.scheduledState, outcome.scheduledPublishAt, outcome.sync);
    return outcome.result;
  }

  createPreview(
    input: PublicContentPreviewInput,
    context: GraphqlContext,
  ): Promise<PublicContentPreviewResult> {
    return this.previews.createPreview(input, context);
  }

  getPreviewPayload(previewToken: string, context: GraphqlContext): Promise<PublicContentPreviewPayload> {
    return this.previews.getPreviewPayload(previewToken, context);
  }

  private resolveWorkspacePagination(skip?: number, take?: number): { skip: number; take: number } {
    const pagination = resolvePagination(skip, take);
    return {
      skip: pagination.skip,
      take: Math.min(pagination.take, PUBLICATION_WORKSPACE_MAX_TAKE),
    };
  }

  private buildSectionWindows(skip: number, take: number, counts: number[]): SectionWindow[] {
    let remainingSkip = skip;
    let remainingTake = take;
    return counts.map((count) => {
      const sectionSkip = Math.min(remainingSkip, count);
      const available = Math.max(0, count - sectionSkip);
      const sectionTake = Math.min(remainingTake, available);
      remainingSkip = Math.max(0, remainingSkip - count);
      remainingTake = Math.max(0, remainingTake - sectionTake);
      return { skip: sectionSkip, take: sectionTake };
    });
  }

  private listMajorEvents(where: Prisma.MajorEventWhereInput, window: SectionWindow) {
    if (window.take === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.majorEvent.findMany({
      where,
      select: PUBLICATION_WORKSPACE_MAJOR_EVENT_SELECT,
      orderBy: { startDate: 'desc' },
      skip: window.skip,
      take: window.take,
    });
  }

  private listEventGroups(where: Prisma.EventGroupWhereInput, window: SectionWindow) {
    if (window.take === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.eventGroup.findMany({
      where,
      select: PUBLICATION_WORKSPACE_EVENT_GROUP_SELECT,
      orderBy: { updatedAt: 'desc' },
      skip: window.skip,
      take: window.take,
    });
  }

  private listEvents(where: Prisma.EventWhereInput, window: SectionWindow) {
    if (window.take === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.event.findMany({
      where,
      select: PUBLICATION_WORKSPACE_EVENT_SELECT,
      orderBy: { startDate: 'desc' },
      skip: window.skip,
      take: window.take,
    });
  }

  private listWarningEvents(where: Prisma.EventWhereInput, window: SectionWindow) {
    if (window.take === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.event.findMany({
      where,
      select: PUBLICATION_WARNING_EVENT_SELECT,
      orderBy: { startDate: 'desc' },
      skip: window.skip,
      take: window.take,
    });
  }

  private listWarningMajorEvents(
    majorEventWhere: Prisma.MajorEventWhereInput,
    eventWhere: Prisma.EventWhereInput,
    window: SectionWindow,
  ) {
    if (window.take === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.majorEvent.findMany({
      where: majorEventWhere,
      select: this.buildWarningMajorEventSelect(eventWhere),
      orderBy: { startDate: 'desc' },
      skip: window.skip,
      take: window.take,
    });
  }

  private listTreeEvents(
    accessibleTreeEventWhere: Prisma.EventWhereInput,
    majorEvents: PublicationWorkspaceMajorEventRecord[],
    eventGroups: PublicationWorkspaceEventGroupRecord[],
  ): Promise<PublicationWorkspaceEventRecord[]> {
    const majorEventIds = majorEvents.map((majorEvent) => majorEvent.id);
    const eventGroupIds = eventGroups.map((eventGroup) => eventGroup.id);
    if (majorEventIds.length === 0 && eventGroupIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.prisma.event.findMany({
      where: this.andWhere<Prisma.EventWhereInput>(accessibleTreeEventWhere, {
        OR: [
          ...(majorEventIds.length > 0 ? [{ majorEventId: { in: majorEventIds } }] : []),
          ...(eventGroupIds.length > 0 ? [{ majorEventId: null, eventGroupId: { in: eventGroupIds } }] : []),
        ],
      }),
      select: PUBLICATION_WORKSPACE_EVENT_SELECT,
      orderBy: { startDate: 'asc' },
    });
  }

  private buildNameSearchWhere<TWhere>(query: string | null): TWhere | null {
    if (!query) {
      return null;
    }

    return { name: { contains: query, mode: 'insensitive' } } as TWhere;
  }

  private buildEventSearchWhere(query: string | null): Prisma.EventWhereInput | null {
    if (!query) {
      return null;
    }

    return {
      OR: [
        { name: { contains: query, mode: 'insensitive' } },
        { majorEvent: { name: { contains: query, mode: 'insensitive' } } },
        { eventGroup: { name: { contains: query, mode: 'insensitive' } } },
      ],
    };
  }

  private buildWarningMajorEventSelect(eventWhere: Prisma.EventWhereInput) {
    return {
      ...PUBLICATION_WARNING_MAJOR_EVENT_SELECT,
      events: {
        ...PUBLICATION_WARNING_MAJOR_EVENT_SELECT.events,
        where: eventWhere,
      },
    } satisfies Prisma.MajorEventSelect;
  }

  private async findFocusedNode(
    input: PublicationWorkspaceInput,
    wheres: {
      eventWhere: Prisma.EventWhereInput;
      eventGroupWhere: Prisma.EventGroupWhereInput;
      majorEventWhere: Prisma.MajorEventWhereInput;
    },
  ): Promise<PublicContentNode | null> {
    if (!input.focusTargetType || !input.focusTargetId) {
      return null;
    }

    if (input.focusTargetType === PublicationTargetType.MAJOR_EVENT) {
      const majorEvent = await this.prisma.majorEvent.findFirst({
        where: this.andWhere(wheres.majorEventWhere, { id: input.focusTargetId }),
        select: PUBLICATION_WORKSPACE_MAJOR_EVENT_SELECT,
      });
      return majorEvent ? this.mapMajorEventNode(majorEvent) : null;
    }

    if (input.focusTargetType === PublicationTargetType.EVENT_GROUP) {
      const eventGroup = await this.prisma.eventGroup.findFirst({
        where: this.andWhere(wheres.eventGroupWhere, { id: input.focusTargetId }),
        select: PUBLICATION_WORKSPACE_EVENT_GROUP_SELECT,
      });
      return eventGroup ? this.mapEventGroupNode(eventGroup) : null;
    }

    const event = await this.prisma.event.findFirst({
      where: this.andWhere(wheres.eventWhere, { id: input.focusTargetId }),
      select: PUBLICATION_WORKSPACE_EVENT_SELECT,
    });
    return event ? this.mapEventNode(event) : null;
  }

  private buildTree(
    majorEvents: PublicationWorkspaceMajorEventRecord[],
    eventGroups: PublicationWorkspaceEventGroupRecord[],
    events: PublicationWorkspaceEventRecord[],
    treeEvents: PublicationWorkspaceEventRecord[],
  ): PublicContentNode[] {
    const majorEventChildren = new Map<string, PublicationWorkspaceEventRecord[]>();
    const standaloneGroupChildren = new Map<string, PublicationWorkspaceEventRecord[]>();
    for (const event of treeEvents) {
      if (event.majorEventId) {
        const children = majorEventChildren.get(event.majorEventId) ?? [];
        children.push(event);
        majorEventChildren.set(event.majorEventId, children);
      } else if (event.eventGroupId) {
        const children = standaloneGroupChildren.get(event.eventGroupId) ?? [];
        children.push(event);
        standaloneGroupChildren.set(event.eventGroupId, children);
      }
    }

    return [
      ...majorEvents.map((majorEvent) =>
        this.mapMajorEventNode(majorEvent, majorEventChildren.get(majorEvent.id) ?? []),
      ),
      ...eventGroups.map((eventGroup) =>
        this.mapEventGroupNode(eventGroup, standaloneGroupChildren.get(eventGroup.id) ?? []),
      ),
      ...events.map((event) => this.mapEventNode(event)),
    ];
  }

  private mapMajorEventNode(
    majorEvent: PublicationWorkspaceMajorEventRecord,
    children: PublicationWorkspaceEventRecord[] = [],
  ): PublicContentNode {
    const directEvents = children.filter((event) => !event.eventGroupId);
    const groupedEvents = new Map<string, PublicationWorkspaceEventRecord[]>();
    for (const event of children) {
      if (!event.eventGroupId || !event.eventGroup || event.eventGroup.deletedAt) {
        continue;
      }
      const events = groupedEvents.get(event.eventGroupId) ?? [];
      events.push(event);
      groupedEvents.set(event.eventGroupId, events);
    }
    const childNodes = [
      ...[...groupedEvents.values()].map((events) => this.mapNestedEventGroupNode(events, majorEvent.name)),
      ...directEvents.map((event) => this.mapEventNode(event, majorEvent.name)),
    ];

    return {
      targetType: PublicationTargetType.MAJOR_EVENT,
      id: majorEvent.id,
      label: majorEvent.name,
      publicationState: majorEvent.publicationState,
      statusLabel: publicationStateLabel(majorEvent.publicationState, majorEvent.scheduledPublishAt),
      scheduledPublishAt: majorEvent.scheduledPublishAt,
      publishedAt: majorEvent.publishedAt,
      unpublishedAt: majorEvent.unpublishedAt,
      publiclyVisible: null,
      parentLabel: null,
      childCount: childNodes.length || majorEvent._count.events,
      children: childNodes,
    };
  }

  private mapEventGroupNode(
    eventGroup: PublicationWorkspaceEventGroupRecord,
    children: PublicationWorkspaceEventRecord[] = [],
  ): PublicContentNode {
    const publicationState = children.length > 0 ? this.deriveGroupState(children) : 'DRAFT';
    const scheduledPublishAt = this.deriveGroupSchedule(children);

    return {
      targetType: PublicationTargetType.EVENT_GROUP,
      id: eventGroup.id,
      label: eventGroup.name,
      publicationState,
      statusLabel:
        children.length > 0 ? publicationStateLabel(publicationState, scheduledPublishAt) : 'Controla eventos vinculados',
      scheduledPublishAt,
      publishedAt: null,
      unpublishedAt: null,
      publiclyVisible: null,
      parentLabel: null,
      childCount: eventGroup._count.events,
      children: children.map((event) => this.mapEventNode(event, eventGroup.name)),
    };
  }

  private mapNestedEventGroupNode(
    events: PublicationWorkspaceEventRecord[],
    parentLabel: string,
  ): PublicContentNode {
    const firstEvent = events[0];
    const publicationState = this.deriveGroupState(events);
    const scheduledPublishAt = this.deriveGroupSchedule(events);
    const label = firstEvent?.eventGroup?.name ?? 'Grupo de eventos';

    return {
      targetType: PublicationTargetType.EVENT_GROUP,
      id: firstEvent?.eventGroupId ?? '',
      label,
      publicationState,
      statusLabel: publicationStateLabel(publicationState, scheduledPublishAt),
      scheduledPublishAt,
      publishedAt: null,
      unpublishedAt: null,
      publiclyVisible: null,
      parentLabel,
      childCount: events.length,
      children: events.map((event) => this.mapEventNode(event, label)),
    };
  }

  private mapEventNode(
    event: PublicationWorkspaceEventRecord,
    parentLabel = this.eventParentLabel(event),
  ): PublicContentNode {
    return {
      targetType: PublicationTargetType.EVENT,
      id: event.id,
      label: event.name,
      publicationState: event.publicationState,
      statusLabel: publicationStateLabel(event.publicationState, event.scheduledPublishAt),
      scheduledPublishAt: event.scheduledPublishAt,
      publishedAt: event.publishedAt,
      unpublishedAt: event.unpublishedAt,
      publiclyVisible: event.publiclyVisible,
      parentLabel,
      childCount: 0,
      children: [],
    };
  }

  private deriveGroupState(events: PublicationWorkspaceEventRecord[]): PublicContentNode['publicationState'] {
    if (events.some((event) => event.publicationState === 'PUBLISHED')) {
      return 'PUBLISHED';
    }
    if (events.some((event) => event.publicationState === 'SCHEDULED')) {
      return 'SCHEDULED';
    }
    if (events.length > 0 && events.every((event) => event.publicationState === 'UNPUBLISHED')) {
      return 'UNPUBLISHED';
    }
    return 'DRAFT';
  }

  private deriveGroupSchedule(events: PublicationWorkspaceEventRecord[]): Date | null {
    const scheduledDates = events
      .map((event) => event.scheduledPublishAt)
      .filter((date): date is Date => date != null)
      .sort((left, right) => left.getTime() - right.getTime());
    return scheduledDates[0] ?? null;
  }

  private eventParentLabel(event: PublicationWorkspaceEventRecord): string | null {
    return [event.majorEvent?.name, event.eventGroup?.name].filter(Boolean).join(' · ') || null;
  }

  private buildAccessibleEventWhere(targets: AccessibleEventGrantTargets | null): Prisma.EventWhereInput | null {
    if (!targets) {
      return null;
    }

    const OR: Prisma.EventWhereInput[] = [];
    if (targets.eventIds.size > 0) {
      OR.push({ id: { in: [...targets.eventIds] } });
    }
    if (targets.majorEventIds.size > 0) {
      OR.push({ majorEventId: { in: [...targets.majorEventIds] } });
    }
    if (targets.eventGroupIds.size > 0) {
      OR.push({ eventGroupId: { in: [...targets.eventGroupIds] } });
    }

    return OR.length > 0 ? { OR } : { id: { in: [] } };
  }

  private buildAccessibleIdWhere<TWhere>(ids: Set<string> | null): TWhere | null {
    if (ids === null) {
      return null;
    }

    return { id: { in: [...ids] } } as TWhere;
  }

  private buildAccessibleEventParentWhere(
    majorEventIds: Set<string> | null,
    eventGroupIds: Set<string> | null,
  ): Prisma.EventWhereInput | null {
    if (majorEventIds === null && eventGroupIds === null) {
      return null;
    }

    const OR: Prisma.EventWhereInput[] = [
      {
        majorEventId: null,
        eventGroupId: null,
      },
    ];

    if (majorEventIds === null) {
      OR.push({ majorEventId: { not: null } });
    } else if (majorEventIds.size > 0) {
      OR.push({ majorEventId: { in: [...majorEventIds] } });
    }

    if (eventGroupIds === null) {
      OR.push({
        majorEventId: null,
        eventGroupId: { not: null },
      });
    } else if (eventGroupIds.size > 0) {
      OR.push({
        majorEventId: null,
        eventGroupId: { in: [...eventGroupIds] },
      });
    }

    return { OR };
  }

  private andWhere<TWhere extends { AND?: TWhere | TWhere[] }>(
    ...parts: (TWhere | null | undefined)[]
  ): TWhere {
    const filteredParts = parts.filter((part): part is TWhere => Boolean(part));
    if (filteredParts.length === 1) {
      return filteredParts[0];
    }

    return { AND: filteredParts } as TWhere;
  }

  private updatePermission(targetType: PublicationTargetType): Permission {
    if (targetType === PublicationTargetType.MAJOR_EVENT) {
      return Permission.MajorEvent.Update;
    }
    if (targetType === PublicationTargetType.EVENT_GROUP) {
      return Permission.EventGroup.Update;
    }
    return Permission.Event.Update;
  }
}
