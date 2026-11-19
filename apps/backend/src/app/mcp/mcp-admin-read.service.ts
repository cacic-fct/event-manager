import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminConfig, MCP_ADMIN_READ_SCOPE } from './mcp-admin.config';
import { mcpUserId } from './mcp-admin-principal';

export const MCP_EVENT_SELECT = {
  id: true,
  name: true,
  description: true,
  startDate: true,
  endDate: true,
  updatedAt: true,
  majorEventId: true,
  eventGroupId: true,
  publicationState: true,
  locationName: true,
  isVirtual: true,
} satisfies Prisma.EventSelect;

@Injectable()
export class McpAdminReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: McpAdminAccessService,
    private readonly config: McpAdminConfig,
  ) {}

  async listDelegations(user: AuthenticatedUser) {
    if (!user.oidcScopeSet.has(MCP_ADMIN_READ_SCOPE)) throw new ForbiddenException('Escopo OAuth insuficiente.');
    // The client can discover only delegations explicitly created by this user for it.
    const delegations = await this.prisma.mcpAdminDelegation.findMany({
      where: {
        userId: mcpUserId(user),
        clientId: String(user.claims['azp']),
        resource: this.config.resourceUrl,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, eventIds: true, capabilities: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const readable = await this.prisma.event.findMany({
      where: {
        AND: [
          { id: { in: [...new Set(delegations.flatMap((delegation) => delegation.eventIds))] } },
          await this.access.eventWhere(user, Permission.Event.Read),
        ],
      },
      select: { id: true },
    });
    const readableIds = new Set(readable.map((event) => event.id));
    return {
      delegations: delegations
        .map((delegation) => ({
          ...delegation,
          eventIds: delegation.eventIds.filter((id) => readableIds.has(id)),
          requiresCurrentPermissions: true,
        }))
        .filter((delegation) => delegation.eventIds.length > 0),
    };
  }

  async listEvents(user: AuthenticatedUser, delegationId: string, offset: number) {
    const delegation = await this.access.assertToolAccess(user, delegationId, 'EVENT_READ');
    const events = await this.prisma.event.findMany({
      where: { AND: [{ id: { in: delegation.eventIds } }, await this.access.eventWhere(user, Permission.Event.Read)] },
      select: { id: true, name: true, startDate: true, endDate: true, publicationState: true, updatedAt: true },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: 11,
    });
    return {
      events: events.slice(0, 10).map((event) => ({ ...event, applicationUrl: this.eventUrl(event.id) })),
      nextOffset: events.length > 10 ? offset + 10 : null,
    };
  }

  async getEvent(user: AuthenticatedUser, delegationId: string, eventId: string) {
    await this.access.assertToolAccess(user, delegationId, 'EVENT_READ', eventId);
    const event = await this.prisma.event.findFirst({
      where: { AND: [{ id: eventId }, await this.access.eventWhere(user, Permission.Event.Read)] },
      select: MCP_EVENT_SELECT,
    });
    if (!event) throw new NotFoundException('Evento indisponível.');
    return {
      ...event,
      description: event.description?.slice(0, 20000) ?? null,
      descriptionTruncated: (event.description?.length ?? 0) > 20000,
      applicationUrl: this.eventUrl(event.id),
      contentTrust: 'untrusted-user-content',
    };
  }

  async attendanceSummary(user: AuthenticatedUser, delegationId: string, eventId: string) {
    await this.access.assertToolAccess(user, delegationId, 'ATTENDANCE_READ', eventId);
    const [attendances, pendingReviewFlags] = await Promise.all([
      this.prisma.eventAttendance.groupBy({ by: ['status'], where: { eventId }, _count: { _all: true } }),
      this.prisma.attendanceReviewFlag.count({ where: { eventId, status: 'PENDING' } }),
    ]);
    return {
      eventId,
      attendances: attendances.map((group) => ({ status: group.status, count: group._count._all })),
      pendingReviewFlags,
    };
  }

  private eventUrl(eventId: string): string {
    return new URL(`/admin/event-workspace/event/${encodeURIComponent(eventId)}`, this.config.resourceUrl).href;
  }
}
