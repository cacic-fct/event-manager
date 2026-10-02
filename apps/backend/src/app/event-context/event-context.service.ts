import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { Prisma } from '@prisma/client';
import { audienceContext, eventAudienceWhere, groupAudienceWhere, majorEventAudienceWhere } from '../audiences/audience-context';
import { AccessibleEventGrantTargets, AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { GraphqlContext } from '../current-user/selects';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import type { TypesenseRankedSearchHit, TypesenseRankedSearchResult } from '../search/typesense-search.types';
import { eventGroupBelongsToMajorEventWhere } from '../event-groups/major-event-membership';
import {
  AdminEventContextAncestor,
  AdminEventContextKind,
  AdminEventContextNode,
  AdminEventContextPage,
} from './event-context.models';

const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;
const MAX_QUERY_TERMS = 6;
const TYPESENSE_RESULT_WINDOW = 10_000;
const READ_PERMISSIONS = [Permission.Event.Read, Permission.EventGroup.Read, Permission.MajorEvent.Read] as const;
const KIND_ORDER: Record<AdminEventContextKind, number> = {
  [AdminEventContextKind.MAJOR_EVENT]: 0,
  [AdminEventContextKind.EVENT_GROUP]: 1,
  [AdminEventContextKind.EVENT]: 2,
};

type PageInput = {
  parentKind?: AdminEventContextKind;
  parentId?: string;
  childKind?: AdminEventContextKind;
  query?: string;
  cursor?: string;
  take?: number;
  startDateFrom?: Date;
  startDateUntil?: Date;
  isInGroup?: boolean;
  isInMajorEvent?: boolean;
};

type CursorState = {
  v: 1;
  signature: string;
  source: 'sql' | 'typesense' | null;
  offsets: Record<AdminEventContextKind, number>;
};

type Access = {
  events: AccessibleEventGrantTargets | null;
  groups: Set<string> | null;
  majors: Set<string> | null;
  allowed: Set<AdminEventContextKind>;
};

type InternalNode = {
  kind: AdminEventContextKind;
  id: string;
  name: string;
  emoji: string;
  startDate: Date | null;
  endDate: Date | null;
  eventType: string | null;
  locationDescription: string | null;
  publicationState: string | null;
  majorEventId: string | null;
  eventGroupId: string | null;
  sortDate: Date;
  score?: string;
  sourceAdvance?: number;
};

type StreamPage = { kind: AdminEventContextKind; nodes: InternalNode[]; hasMore: boolean; scanned: number };

const EVENT_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  type: true,
  locationDescription: true,
  publicationState: true,
  majorEventId: true,
  eventGroupId: true,
} satisfies Prisma.EventSelect;

const GROUP_SELECT = {
  id: true,
  name: true,
  emoji: true,
  majorEventId: true,
  updatedAt: true,
} satisfies Prisma.EventGroupSelect;

const MAJOR_SELECT = {
  id: true,
  name: true,
  emoji: true,
  startDate: true,
  endDate: true,
  publicationState: true,
} satisfies Prisma.MajorEventSelect;

@Injectable()
export class EventContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: AuthorizationPolicyService,
    private readonly typesense: TypesenseSearchService,
  ) {}

  async getPage(context: GraphqlContext, input: PageInput = {}): Promise<AdminEventContextPage> {
    this.validateInput(input);
    const user = context.req?.user ?? context.request?.user;
    const access = await this.resolveAccess(user);
    const query = input.query?.trim() ?? '';
    const take = Math.min(MAX_TAKE, Math.max(1, Math.floor(input.take ?? DEFAULT_TAKE)));
    const signature = JSON.stringify({
      parentKind: input.parentKind ?? null,
      parentId: input.parentId?.trim() || null,
      childKind: input.childKind ?? null,
      query,
      take,
      startDateFrom: input.startDateFrom ?? null,
      startDateUntil: input.startDateUntil ?? null,
      isInGroup: input.isInGroup ?? null,
      isInMajorEvent: input.isInMajorEvent ?? null,
    });
    const cursor = this.decodeCursor(input.cursor, signature);
    const requestedKinds = this.requestedKinds(input, access);
    if (input.parentKind && input.parentId) {
      await this.assertReadableParent(input.parentKind, input.parentId, access);
    }

    const canUseTypesenseNow =
      Boolean(query) &&
      !input.parentKind &&
      !this.hasEventFilters(input) &&
      this.typesense.isEnabled() &&
      access.events === null &&
      access.groups === null &&
      access.majors === null &&
      (audienceContext.getStore() === undefined || audienceContext.getStore()?.bypass === true);
    const useTypesense = cursor.source ? cursor.source === 'typesense' : canUseTypesenseNow;
    let typesenseStreams: StreamPage[] | null = null;
    if (useTypesense && canUseTypesenseNow) {
      try {
        typesenseStreams = await this.searchTypesense(query, requestedKinds, access, cursor.offsets, take);
      } catch {
        typesenseStreams = null;
      }
    }
    let streams = typesenseStreams;
    if (!streams) {
      if (cursor.source === 'typesense') {
        throw new ServiceUnavailableException('Context search changed source. Restart the search from the first page.');
      }
      streams = await this.searchSql(input, query, requestedKinds, access, cursor.offsets, take);
    }

    const source = typesenseStreams ? 'typesense' : 'sql';
    const ranked = Boolean(query) && source === 'typesense';
    const merged = streams.flatMap((stream) => stream.nodes).sort((left, right) => this.compareNodes(left, right, ranked));
    const selected = merged.slice(0, take);
    const offsets = { ...cursor.offsets };
    for (const stream of streams) {
      if (stream.nodes.length === 0 && stream.scanned > 0) offsets[stream.kind] += stream.scanned;
    }
    for (const node of selected) {
      offsets[node.kind] = node.sourceAdvance
        ? Math.max(offsets[node.kind], cursor.offsets[node.kind] + node.sourceAdvance)
        : offsets[node.kind] + 1;
    }
    const hasMore = merged.length > selected.length || streams.some((stream) => stream.hasMore);
    const nodes = await this.toOutputNodes(selected, access);

    return {
      nodes,
      nextCursor: hasMore ? this.encodeCursor({ v: 1, signature, source, offsets }) : null,
      take,
    };
  }

  private async resolveAccess(user: AuthenticatedUser | undefined): Promise<Access> {
    const granted = new Set(await this.authorization.evaluatePermissions(user, READ_PERMISSIONS));
    if (granted.size === 0) throw new ForbiddenException('No readable event contexts are available.');
    const allowed = new Set<AdminEventContextKind>();
    if (granted.has(Permission.Event.Read)) allowed.add(AdminEventContextKind.EVENT);
    if (granted.has(Permission.EventGroup.Read)) allowed.add(AdminEventContextKind.EVENT_GROUP);
    if (granted.has(Permission.MajorEvent.Read)) allowed.add(AdminEventContextKind.MAJOR_EVENT);
    const [events, groups, majors] = await Promise.all([
      allowed.has(AdminEventContextKind.EVENT)
        ? this.authorization.accessibleEventTargets(user, Permission.Event.Read)
        : Promise.resolve(this.emptyEventTargets()),
      allowed.has(AdminEventContextKind.EVENT_GROUP)
        ? this.authorization.accessibleEventGroupIds(user, Permission.EventGroup.Read)
        : Promise.resolve(new Set<string>()),
      allowed.has(AdminEventContextKind.MAJOR_EVENT)
        ? this.authorization.accessibleMajorEventIds(user, Permission.MajorEvent.Read)
        : Promise.resolve(new Set<string>()),
    ]);
    return { events, groups, majors, allowed };
  }

  private requestedKinds(input: PageInput, access: Access): AdminEventContextKind[] {
    const allowed = [...access.allowed];
    if (this.hasEventFilters(input)) {
      return (!input.childKind || input.childKind === AdminEventContextKind.EVENT) && access.allowed.has(AdminEventContextKind.EVENT)
        ? [AdminEventContextKind.EVENT] : [];
    }
    if (input.childKind) return allowed.includes(input.childKind) ? [input.childKind] : [];
    if (input.parentKind === AdminEventContextKind.EVENT_GROUP) {
      return allowed.filter((kind) => kind === AdminEventContextKind.EVENT);
    }
    if (input.parentKind === AdminEventContextKind.MAJOR_EVENT) {
      return allowed.filter((kind) => kind === AdminEventContextKind.EVENT || kind === AdminEventContextKind.EVENT_GROUP);
    }
    return allowed;
  }

  private async searchSql(
    input: PageInput,
    query: string,
    kinds: AdminEventContextKind[],
    access: Access,
    offsets: Record<AdminEventContextKind, number>,
    take: number,
  ): Promise<StreamPage[]> {
    return Promise.all(
      kinds.map(async (kind) => {
        const nodes = await this.listKind(kind, input, query, access, offsets[kind], take + 1);
        return { kind, nodes: nodes.slice(0, take), hasMore: nodes.length > take, scanned: 0 };
      }),
    );
  }

  private async searchTypesense(
    query: string,
    kinds: AdminEventContextKind[],
    access: Access,
    offsets: Record<AdminEventContextKind, number>,
    take: number,
  ): Promise<StreamPage[] | null> {
    const pages = await Promise.all(kinds.map((kind) => this.searchTypesenseKind(query, kind, access, offsets[kind], take)));
    return pages.some((page) => page === null) ? null : pages.filter((page): page is StreamPage => page !== null);
  }

  private async searchTypesenseKind(
    query: string,
    kind: AdminEventContextKind,
    access: Access,
    offset: number,
    take: number,
  ): Promise<StreamPage | null> {
    const nodes: InternalNode[] = [];
    const maximumScanned = Math.max(100, take * 5);
    let scanned = 0;
    let found = 0;
    while (nodes.length < take + 1 && scanned < maximumScanned) {
      const options = { offset: offset + scanned, limit: Math.min(take + 1, maximumScanned - scanned) };
      const result = await this.rankedSearch(kind, query, options);
      if (!result.available) return null;
      if (result.found >= TYPESENSE_RESULT_WINDOW) return null;
      found = result.found;
      if (result.hits.length === 0) break;
      const hydrated = await this.hydrateRanked(kind, result.hits, access);
      nodes.push(...hydrated.map((node) => ({ ...node, sourceAdvance: (node.sourceAdvance ?? 0) + scanned })));
      scanned += result.hits.length;
      if (offset + scanned >= found) break;
    }
    return { kind, nodes: nodes.slice(0, take), hasMore: offset + scanned < found || nodes.length > take, scanned };
  }

  private rankedSearch(
    kind: AdminEventContextKind,
    query: string,
    options: { offset: number; limit: number },
  ): Promise<TypesenseRankedSearchResult> {
    if (kind === AdminEventContextKind.EVENT) return this.typesense.searchEventsRanked(query, options);
    if (kind === AdminEventContextKind.EVENT_GROUP) return this.typesense.searchEventGroupsRanked(query, options);
    return this.typesense.searchMajorEventsRanked(query, options);
  }

  private async hydrateRanked(
    kind: AdminEventContextKind,
    hits: TypesenseRankedSearchHit[],
    access: Access,
  ): Promise<InternalNode[]> {
    if (hits.length === 0) return [];
    const ids = hits.map((hit) => hit.id);
    const score = new Map(hits.map((hit) => [hit.id, hit.score]));
    const sourceAdvance = new Map(hits.map((hit, index) => [hit.id, index + 1]));
    const nodes = await this.listKindByIds(kind, ids, access);
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return ids.flatMap((id) => {
      const node = byId.get(id);
      return node ? [{ ...node, score: score.get(id), sourceAdvance: sourceAdvance.get(id) }] : [];
    });
  }

  private listKind(
    kind: AdminEventContextKind,
    input: PageInput,
    query: string,
    access: Access,
    skip: number,
    take: number,
  ): Promise<InternalNode[]> {
    if (kind === AdminEventContextKind.EVENT) return this.listEvents(input, query, access, skip, take);
    if (kind === AdminEventContextKind.EVENT_GROUP) return this.listGroups(input, query, access, skip, take);
    return this.listMajorEvents(input, query, access, skip, take);
  }

  private async listEvents(input: PageInput, query: string, access: Access, skip: number, take: number) {
    const where = this.andEventWhere(
      { deletedAt: null },
      this.eventAccessWhere(access.events),
      this.eventAudienceFilter(),
      this.eventHierarchyWhere(input, access),
      this.eventSearchWhere(query, access),
      this.eventFilterWhere(input),
    );
    const records = await this.prisma.event.findMany({
      where,
      select: EVENT_SELECT,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip,
      take,
    });
    return records.map((event) => ({
      kind: AdminEventContextKind.EVENT,
      id: event.id,
      name: event.name,
      emoji: event.emoji,
      startDate: event.startDate,
      endDate: event.endDate,
      eventType: event.type,
      locationDescription: event.locationDescription,
      publicationState: event.publicationState,
      majorEventId: event.majorEventId,
      eventGroupId: event.eventGroupId,
      sortDate: event.startDate,
    }));
  }

  private async listGroups(input: PageInput, query: string, access: Access, skip: number, take: number) {
    const where = this.andGroupWhere(
      { deletedAt: null },
      this.idAccessWhere<Prisma.EventGroupWhereInput>(access.groups),
      this.groupAudienceFilter(),
      this.groupHierarchyWhere(input, access),
      this.groupSearchWhere(query, access),
    );
    const records = await this.prisma.eventGroup.findMany({
      where,
      select: GROUP_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip,
      take,
    });
    return records.map((group) => ({
      kind: AdminEventContextKind.EVENT_GROUP,
      id: group.id,
      name: group.name,
      emoji: group.emoji,
      startDate: null,
      endDate: null,
      eventType: null,
      locationDescription: null,
      publicationState: null,
      majorEventId: group.majorEventId,
      eventGroupId: null,
      sortDate: group.updatedAt,
    }));
  }

  private async listMajorEvents(input: PageInput, query: string, access: Access, skip: number, take: number) {
    if (input.parentKind) return [];
    const where = this.andMajorWhere(
      { deletedAt: null },
      this.idAccessWhere<Prisma.MajorEventWhereInput>(access.majors),
      this.majorAudienceFilter(),
      this.majorSearchWhere(query),
    );
    const records = await this.prisma.majorEvent.findMany({
      where,
      select: MAJOR_SELECT,
      orderBy: [{ startDate: 'desc' }, { id: 'asc' }],
      skip,
      take,
    });
    return records.map((major) => ({
      kind: AdminEventContextKind.MAJOR_EVENT,
      id: major.id,
      name: major.name,
      emoji: major.emoji,
      startDate: major.startDate,
      endDate: major.endDate,
      eventType: null,
      locationDescription: null,
      publicationState: major.publicationState,
      majorEventId: null,
      eventGroupId: null,
      sortDate: major.startDate,
    }));
  }

  private async listKindByIds(
    kind: AdminEventContextKind,
    ids: string[],
    access: Access,
  ): Promise<InternalNode[]> {
    if (kind === AdminEventContextKind.EVENT) {
      const records = await this.prisma.event.findMany({
        where: this.andEventWhere(
          { id: { in: ids }, deletedAt: null },
          this.eventAccessWhere(access.events),
          this.eventAudienceFilter(),
        ),
        select: EVENT_SELECT,
      });
      return records.map((event) => ({ kind, id: event.id, name: event.name, emoji: event.emoji,
        startDate: event.startDate, endDate: event.endDate, eventType: event.type,
        locationDescription: event.locationDescription, publicationState: event.publicationState,
        majorEventId: event.majorEventId, eventGroupId: event.eventGroupId, sortDate: event.startDate }));
    }
    if (kind === AdminEventContextKind.EVENT_GROUP) {
      const records = await this.prisma.eventGroup.findMany({
        where: this.andGroupWhere(
          { id: { in: ids }, deletedAt: null },
          this.idAccessWhere(access.groups),
          this.groupAudienceFilter(),
        ),
        select: GROUP_SELECT,
      });
      return records.map((group) => ({ kind, id: group.id, name: group.name, emoji: group.emoji,
        startDate: null, endDate: null, eventType: null, locationDescription: null, publicationState: null,
        majorEventId: group.majorEventId, eventGroupId: null, sortDate: group.updatedAt }));
    }
    const records = await this.prisma.majorEvent.findMany({
      where: this.andMajorWhere(
        { id: { in: ids }, deletedAt: null },
        this.idAccessWhere(access.majors),
        this.majorAudienceFilter(),
      ),
      select: MAJOR_SELECT,
    });
    return records.map((major) => ({ kind, id: major.id, name: major.name, emoji: major.emoji,
      startDate: major.startDate, endDate: major.endDate, eventType: null, locationDescription: null,
      publicationState: major.publicationState, majorEventId: null, eventGroupId: null,
      sortDate: major.startDate }));
  }

  private eventHierarchyWhere(input: PageInput, access: Access): Prisma.EventWhereInput | null {
    if (input.parentKind === AdminEventContextKind.EVENT_GROUP && input.parentId) return { eventGroupId: input.parentId };
    if (input.parentKind === AdminEventContextKind.MAJOR_EVENT && input.parentId) {
      return { majorEventId: input.parentId, ...(!input.query?.trim() && !this.hasEventFilters(input) ? { eventGroupId: null } : {}) };
    }
    if (input.parentKind) return { id: { in: [] } };
    if (input.query?.trim() || this.hasEventFilters(input)) return null;
    return {
      OR: [
        { majorEventId: null, eventGroupId: null },
        { eventGroupId: { not: null }, eventGroup: { is: this.inaccessibleGroupWhere(access) } },
        { eventGroupId: null, majorEventId: { not: null }, majorEvent: { is: this.inaccessibleMajorWhere(access) } },
      ],
    };
  }

  private groupHierarchyWhere(input: PageInput, access: Access): Prisma.EventGroupWhereInput | null {
    if (input.parentKind === AdminEventContextKind.MAJOR_EVENT && input.parentId) {
      return eventGroupBelongsToMajorEventWhere(input.parentId);
    }
    if (input.parentKind) return { id: { in: [] } };
    if (input.query?.trim()) return null;
    return {
      OR: [
        { majorEventId: null },
        { majorEventId: { not: null }, majorEvent: { is: this.inaccessibleMajorWhere(access) } },
      ],
    };
  }

  private hasEventFilters(input: PageInput): boolean {
    return Boolean(input.startDateFrom || input.startDateUntil) ||
      typeof input.isInGroup === 'boolean' || typeof input.isInMajorEvent === 'boolean';
  }

  private eventFilterWhere(input: PageInput): Prisma.EventWhereInput | null {
    if (!this.hasEventFilters(input)) return null;
    return {
      ...(input.startDateFrom || input.startDateUntil ? { startDate: {
        ...(input.startDateFrom ? { gte: input.startDateFrom } : {}),
        ...(input.startDateUntil ? { lte: input.startDateUntil } : {}),
      } } : {}),
      ...(typeof input.isInGroup === 'boolean' ? { eventGroupId: input.isInGroup ? { not: null } : null } : {}),
      ...(typeof input.isInMajorEvent === 'boolean' ? { majorEventId: input.isInMajorEvent ? { not: null } : null } : {}),
    };
  }

  private eventSearchWhere(query: string, access: Access): Prisma.EventWhereInput | null {
    const terms = this.queryTerms(query);
    if (terms.length === 0) return null;
    return {
      AND: terms.map((term): Prisma.EventWhereInput => {
        const eventType = this.eventTypeTerm(term);
        return { OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { shortDescription: { contains: term, mode: 'insensitive' } },
          { locationDescription: { contains: term, mode: 'insensitive' } },
          { emoji: { contains: term, mode: 'insensitive' } },
          ...(eventType ? [{ type: eventType }] : []),
          ...(access.majors === null || access.majors.size > 0
            ? [{ majorEvent: { is: this.andMajorWhere({ deletedAt: null }, this.idAccessWhere(access.majors), this.majorAudienceFilter(), { name: { contains: term, mode: 'insensitive' } }) } }]
            : []),
          ...(access.groups === null || access.groups.size > 0
            ? [{ eventGroup: { is: this.andGroupWhere({ deletedAt: null }, this.idAccessWhere(access.groups), this.groupAudienceFilter(), { name: { contains: term, mode: 'insensitive' } }) } }]
            : []),
        ] };
      }),
    };
  }

  private groupSearchWhere(query: string, access: Access): Prisma.EventGroupWhereInput | null {
    const terms = this.queryTerms(query);
    if (terms.length === 0) return null;
    return {
      AND: terms.map((term) => ({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { emoji: { contains: term, mode: 'insensitive' } },
          ...(access.majors === null || access.majors.size > 0
            ? [{ majorEvent: { is: this.andMajorWhere({ deletedAt: null }, this.idAccessWhere(access.majors), this.majorAudienceFilter(), { name: { contains: term, mode: 'insensitive' } }) } }]
            : []),
        ],
      })),
    };
  }

  private majorSearchWhere(query: string): Prisma.MajorEventWhereInput | null {
    const terms = this.queryTerms(query);
    return terms.length
      ? { AND: terms.map((term) => ({ OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ] })) }
      : null;
  }

  private async toOutputNodes(nodes: InternalNode[], access: Access): Promise<AdminEventContextNode[]> {
    const ancestorGroupIds = [...new Set(
      nodes
        .map((node) => node.eventGroupId)
        .filter((id): id is string => id !== null && this.canAccessId(access.groups, id)),
    )];
    const ancestorGroups = ancestorGroupIds.length > 0
      ? await this.prisma.eventGroup.findMany({
          where: this.andGroupWhere(
            { id: { in: ancestorGroupIds }, deletedAt: null },
            this.groupAudienceFilter(),
          ),
          select: { id: true, name: true, emoji: true, majorEventId: true },
        })
      : [];
    const ancestorGroupsById = new Map(ancestorGroups.map((group) => [group.id, group]));
    const ancestorMajorIds = [...new Set(
      nodes
        .map((node) => {
          const group = node.eventGroupId ? ancestorGroupsById.get(node.eventGroupId) : null;
          return group?.majorEventId ?? (node.eventGroupId ? null : node.majorEventId);
        })
        .filter((id): id is string => id !== null && this.canAccessId(access.majors, id)),
    )];

    const groupNodeIds = access.allowed.has(AdminEventContextKind.EVENT)
      ? nodes.filter((node) => node.kind === AdminEventContextKind.EVENT_GROUP).map((node) => node.id)
      : [];
    const majorNodeIds = nodes
      .filter((node) => node.kind === AdminEventContextKind.MAJOR_EVENT)
      .map((node) => node.id);

    const [ancestorMajors, groupChildEvents, majorChildGroups, majorChildEvents] = await Promise.all([
      ancestorMajorIds.length > 0
        ? this.prisma.majorEvent.findMany({
            where: this.andMajorWhere(
              { id: { in: ancestorMajorIds }, deletedAt: null },
              this.majorAudienceFilter(),
            ),
            select: { id: true, name: true, emoji: true },
          })
        : [],
      groupNodeIds.length > 0
        ? this.prisma.event.findMany({
            where: this.andEventWhere(
              { eventGroupId: { in: groupNodeIds }, deletedAt: null },
              this.eventAccessWhere(access.events),
              this.eventAudienceFilter(),
            ),
            select: { eventGroupId: true },
            distinct: ['eventGroupId'],
          })
        : [],
      majorNodeIds.length > 0 && access.allowed.has(AdminEventContextKind.EVENT_GROUP)
        ? this.prisma.eventGroup.findMany({
            where: this.andGroupWhere(
              { OR: majorNodeIds.map((id) => eventGroupBelongsToMajorEventWhere(id)) },
              { deletedAt: null },
              this.idAccessWhere(access.groups),
              this.groupAudienceFilter(),
            ),
            select: {
              majorEventId: true,
              events: {
                where: { majorEventId: { in: majorNodeIds }, deletedAt: null },
                select: { majorEventId: true },
                take: 1,
              },
            },
          })
        : [],
      majorNodeIds.length > 0 && access.allowed.has(AdminEventContextKind.EVENT)
        ? this.prisma.event.findMany({
            where: this.andEventWhere(
              { majorEventId: { in: majorNodeIds }, eventGroupId: null, deletedAt: null },
              this.eventAccessWhere(access.events),
              this.eventAudienceFilter(),
            ),
            select: { majorEventId: true },
            distinct: ['majorEventId'],
          })
        : [],
    ]);

    const ancestorMajorsById = new Map(ancestorMajors.map((major) => [major.id, major]));
    const groupsWithChildren = new Set(
      groupChildEvents.map((event) => event.eventGroupId).filter((id): id is string => id !== null),
    );
    const majorsWithChildren = new Set(
      majorChildEvents.map((event) => event.majorEventId).filter((id): id is string => id !== null),
    );
    for (const group of majorChildGroups) {
      if (group.majorEventId) {
        majorsWithChildren.add(group.majorEventId);
      } else {
        for (const event of group.events) {
          if (event.majorEventId) majorsWithChildren.add(event.majorEventId);
        }
      }
    }

    return nodes.map((node) => {
      const ancestors: AdminEventContextAncestor[] = [];
      const group = node.eventGroupId ? ancestorGroupsById.get(node.eventGroupId) : null;
      const canonicalMajorEventId = group?.majorEventId ?? (node.eventGroupId ? null : node.majorEventId);
      const major = canonicalMajorEventId ? ancestorMajorsById.get(canonicalMajorEventId) : null;
      if (major) ancestors.push({ kind: AdminEventContextKind.MAJOR_EVENT, ...major });
      if (group) {
        ancestors.push({
          kind: AdminEventContextKind.EVENT_GROUP,
          id: group.id,
          name: group.name,
          emoji: group.emoji,
        });
      }
      return {
        kind: node.kind,
        id: node.id,
        name: node.name,
        emoji: node.emoji,
        startDate: node.startDate,
        endDate: node.endDate,
        eventType: node.eventType,
        locationDescription: node.locationDescription,
        publicationState: node.publicationState,
        ancestors,
        hasChildren:
          node.kind === AdminEventContextKind.EVENT_GROUP
            ? groupsWithChildren.has(node.id)
            : node.kind === AdminEventContextKind.MAJOR_EVENT
              ? majorsWithChildren.has(node.id)
              : false,
      };
    });
  }

  private async assertReadableParent(kind: AdminEventContextKind, id: string, access: Access): Promise<void> {
    if (!access.allowed.has(kind)) throw new NotFoundException('Event context was not found.');
    const found = kind === AdminEventContextKind.EVENT
      ? await this.prisma.event.findFirst({ where: this.andEventWhere({ id, deletedAt: null }, this.eventAccessWhere(access.events), this.eventAudienceFilter()), select: { id: true } })
      : kind === AdminEventContextKind.EVENT_GROUP
        ? await this.prisma.eventGroup.findFirst({ where: this.andGroupWhere({ id, deletedAt: null }, this.idAccessWhere(access.groups), this.groupAudienceFilter()), select: { id: true } })
        : await this.prisma.majorEvent.findFirst({ where: this.andMajorWhere({ id, deletedAt: null }, this.idAccessWhere(access.majors), this.majorAudienceFilter()), select: { id: true } });
    if (!found) throw new NotFoundException('Event context was not found.');
  }

  private validateInput(input: PageInput): void {
    if (input.startDateFrom && input.startDateUntil && input.startDateFrom > input.startDateUntil) {
      throw new BadRequestException('A data inicial deve ser anterior à data final.');
    }
    if (Boolean(input.parentKind) !== Boolean(input.parentId?.trim())) {
      throw new BadRequestException('parentKind and parentId must be provided together.');
    }
    if (input.parentKind === AdminEventContextKind.EVENT) {
      throw new BadRequestException('Events cannot contain child contexts.');
    }
    if (input.parentKind === AdminEventContextKind.EVENT_GROUP && input.childKind && input.childKind !== AdminEventContextKind.EVENT) {
      throw new BadRequestException('Event groups can contain only events.');
    }
    if (input.parentKind === AdminEventContextKind.MAJOR_EVENT && input.childKind === AdminEventContextKind.MAJOR_EVENT) {
      throw new BadRequestException('Major events cannot contain major events.');
    }
  }

  private decodeCursor(value: string | undefined, signature: string): CursorState {
    if (!value) return { v: 1, signature, source: null, offsets: this.emptyOffsets() };
    try {
      const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<CursorState>;
      if (
        parsed.v !== 1 ||
        parsed.signature !== signature ||
        !parsed.offsets ||
        (parsed.source !== 'sql' && parsed.source !== 'typesense')
      ) throw new Error('invalid');
      const offsets = this.emptyOffsets();
      for (const kind of Object.values(AdminEventContextKind)) {
        const offset = parsed.offsets[kind];
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid');
        offsets[kind] = offset;
      }
      return { v: 1, signature, source: parsed.source, offsets };
    } catch {
      throw new BadRequestException('Invalid event-context cursor.');
    }
  }

  private encodeCursor(cursor: CursorState): string {
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private compareNodes(left: InternalNode, right: InternalNode, ranked: boolean): number {
    if (ranked) {
      const scoreDifference = this.score(right.score) - this.score(left.score);
      if (scoreDifference !== 0n) return scoreDifference > 0n ? 1 : -1;
      const kindDifference = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
      return kindDifference || (left.sourceAdvance ?? 0) - (right.sourceAdvance ?? 0) || left.id.localeCompare(right.id);
    }
    const dateDifference = right.sortDate.getTime() - left.sortDate.getTime();
    if (dateDifference !== 0) return dateDifference;
    const kindDifference = KIND_ORDER[left.kind] - KIND_ORDER[right.kind];
    return kindDifference || left.id.localeCompare(right.id);
  }

  private score(value?: string): bigint {
    try { return BigInt(value ?? '0'); } catch { return 0n; }
  }

  private queryTerms(query: string): string[] {
    return query.split(/\s+/u).map((term) => term.trim()).filter(Boolean).slice(0, MAX_QUERY_TERMS);
  }

  private eventTypeTerm(term: string): 'MINICURSO' | 'PALESTRA' | 'OTHER' | null {
    const normalized = term.toUpperCase();
    return normalized === 'MINICURSO' || normalized === 'PALESTRA' || normalized === 'OTHER' ? normalized : null;
  }

  private eventAccessWhere(targets: AccessibleEventGrantTargets | null): Prisma.EventWhereInput | null {
    if (targets === null) return null;
    const OR: Prisma.EventWhereInput[] = [];
    if (targets.eventIds.size) OR.push({ id: { in: [...targets.eventIds] } });
    if (targets.eventGroupIds.size) OR.push({ eventGroupId: { in: [...targets.eventGroupIds] } });
    if (targets.majorEventIds.size) OR.push({ majorEventId: { in: [...targets.majorEventIds] } });
    return OR.length ? { OR } : { id: { in: [] } };
  }

  private idAccessWhere<T>(ids: Set<string> | null): T | null {
    return ids === null ? null : ({ id: { in: [...ids] } } as T);
  }

  private inaccessibleMajorWhere(access: Access): Prisma.MajorEventWhereInput {
    return { NOT: this.andMajorWhere(
      { deletedAt: null },
      this.idAccessWhere(access.majors),
      this.majorAudienceFilter(),
    ) };
  }

  private inaccessibleGroupWhere(access: Access): Prisma.EventGroupWhereInput {
    return { NOT: this.andGroupWhere(
      { deletedAt: null },
      this.idAccessWhere(access.groups),
      this.groupAudienceFilter(),
    ) };
  }

  private canAccessId(ids: Set<string> | null, id: string): boolean {
    return ids === null || ids.has(id);
  }

  private eventAudienceFilter(): Prisma.EventWhereInput | null {
    const principal = audienceContext.getStore();
    return principal ? eventAudienceWhere(principal) : null;
  }

  private groupAudienceFilter(): Prisma.EventGroupWhereInput | null {
    const principal = audienceContext.getStore();
    return principal ? groupAudienceWhere(principal) : null;
  }

  private majorAudienceFilter(): Prisma.MajorEventWhereInput | null {
    const principal = audienceContext.getStore();
    return principal ? majorEventAudienceWhere(principal) : null;
  }

  private andEventWhere(...parts: (Prisma.EventWhereInput | null | undefined)[]): Prisma.EventWhereInput {
    return this.andWhere(parts);
  }

  private andGroupWhere(...parts: (Prisma.EventGroupWhereInput | null | undefined)[]): Prisma.EventGroupWhereInput {
    return this.andWhere(parts);
  }

  private andMajorWhere(...parts: (Prisma.MajorEventWhereInput | null | undefined)[]): Prisma.MajorEventWhereInput {
    return this.andWhere(parts);
  }

  private andWhere<T>(parts: (T | null | undefined)[]): T {
    const filtered = parts.filter((part): part is T => Boolean(part));
    if (filtered.length === 1) return filtered[0];
    return { AND: filtered } as T;
  }

  private emptyEventTargets(): AccessibleEventGrantTargets {
    return { eventIds: new Set(), eventGroupIds: new Set(), majorEventIds: new Set() };
  }

  private emptyOffsets(): Record<AdminEventContextKind, number> {
    return {
      [AdminEventContextKind.EVENT]: 0,
      [AdminEventContextKind.EVENT_GROUP]: 0,
      [AdminEventContextKind.MAJOR_EVENT]: 0,
    };
  }
}
