import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminConfig, MCP_ADMIN_READ_SCOPE } from './mcp-admin.config';
import { McpAdminReadService } from './mcp-admin-read.service';

const { jest } = import.meta;

function context() {
  const user: AuthenticatedUser = {
    sub: 'user-1',
    token: 'unused',
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [MCP_ADMIN_READ_SCOPE],
    scopeSet: new Set([MCP_ADMIN_READ_SCOPE]),
    oidcScopes: [MCP_ADMIN_READ_SCOPE],
    oidcScopeSet: new Set([MCP_ADMIN_READ_SCOPE]),
    claims: { azp: 'mcp-client' },
  };
  const event = {
    id: 'event-1',
    name: 'Evento permitido',
    description: 'Descrição pública',
    startDate: new Date(Date.now() + 60_000),
    endDate: new Date(Date.now() + 120_000),
    updatedAt: new Date(),
    majorEventId: null,
    eventGroupId: null,
    publicationState: 'PUBLISHED',
    locationName: 'Sala A',
    isVirtual: false,
  };
  const delegation = {
    id: 'delegation-1',
    eventIds: ['event-1', 'event-2'],
    capabilities: ['EVENT_READ'],
    expiresAt: new Date(Date.now() + 60_000),
  };
  const visibleWhere = { AND: [{ deletedAt: null }, { audience: 'PUBLIC' }] } satisfies Prisma.EventWhereInput;
  const access = {
    assertToolAccess: jest.fn().mockResolvedValue(delegation),
    eventWhere: jest.fn().mockResolvedValue(visibleWhere),
  };
  const prisma = {
    mcpAdminDelegation: { findMany: jest.fn().mockResolvedValue([delegation]) },
    event: {
      findMany: jest.fn().mockResolvedValue([{ id: 'event-1' }]),
      findFirst: jest.fn().mockResolvedValue(event),
    },
    eventAttendance: { groupBy: jest.fn().mockResolvedValue([{ status: 'PRESENT', _count: { _all: 4 } }]) },
    attendanceReviewFlag: { count: jest.fn().mockResolvedValue(2) },
  };
  const config = { resourceUrl: 'https://events.example/api/mcp/admin' };
  const service = new McpAdminReadService(
    prisma as unknown as PrismaService,
    access as unknown as McpAdminAccessService,
    config as McpAdminConfig,
  );
  return { service, prisma, access, user, event, delegation, visibleWhere, config };
}

describe('McpAdminReadService privacy projections', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z')));
  afterEach(() => jest.useRealTimers());

  it('requires read OAuth scope before discovering any delegated identifiers', async () => {
    const { service, user, prisma } = context();
    user.oidcScopeSet.clear();

    await expect(service.listDelegations(user)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.mcpAdminDelegation.findMany).not.toHaveBeenCalled();
    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('limits delegation discovery to owner/client/resource and filters unavailable event identifiers', async () => {
    const { service, user, prisma, delegation, access, visibleWhere, config } = context();
    prisma.mcpAdminDelegation.findMany.mockResolvedValue([
      delegation,
      { ...delegation, id: 'hidden-delegation', eventIds: ['hidden-event'] },
    ]);

    const result = await service.listDelegations(user);

    expect(prisma.mcpAdminDelegation.findMany).toHaveBeenCalledWith({
      where: {
        userId: user.sub,
        clientId: 'mcp-client',
        resource: config.resourceUrl,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, eventIds: true, capabilities: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    expect(access.eventWhere).toHaveBeenCalledWith(user, Permission.Event.Read);
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { AND: [{ id: { in: ['event-1', 'event-2', 'hidden-event'] } }, visibleWhere] },
      select: { id: true },
    });
    expect(result).toEqual({
      delegations: [{ ...delegation, eventIds: ['event-1'], requiresCurrentPermissions: true }],
    });
    expect(JSON.stringify(result)).not.toContain('hidden-event');
    expect(JSON.stringify(result)).not.toContain('hidden-delegation');
  });

  it('intersects delegation events with current visibility before pagination and selects only summary fields', async () => {
    const { service, user, prisma, access, delegation, visibleWhere, event } = context();
    const events = Array.from({ length: 11 }, (_, index) => ({
      id: `event-${index + 1}`,
      name: `Evento ${index + 1}`,
      startDate: event.startDate,
      endDate: event.endDate,
      publicationState: event.publicationState,
      updatedAt: event.updatedAt,
    }));
    prisma.event.findMany.mockResolvedValue(events);

    const result = await service.listEvents(user, delegation.id, 20);

    expect(access.assertToolAccess).toHaveBeenCalledWith(user, delegation.id, 'EVENT_READ');
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { AND: [{ id: { in: delegation.eventIds } }, visibleWhere] },
      select: { id: true, name: true, startDate: true, endDate: true, publicationState: true, updatedAt: true },
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
      skip: 20,
      take: 11,
    });
    expect(result.events).toHaveLength(10);
    expect(result.nextOffset).toBe(30);
    expect(result.events[0].applicationUrl).toBe('https://events.example/admin/event-workspace/event/event-1');
  });

  it('reports the final page without inventing a further cursor', async () => {
    const { service, user, delegation } = context();
    const result = await service.listEvents(user, delegation.id, 0);
    expect(result.nextOffset).toBeNull();
  });

  it('requires permission for the actual detail target and selects an explicit content allowlist', async () => {
    const { service, user, prisma, access, delegation, event, visibleWhere } = context();

    const result = await service.getEvent(user, delegation.id, event.id);

    expect(access.assertToolAccess).toHaveBeenCalledWith(user, delegation.id, 'EVENT_READ', event.id);
    expect(prisma.event.findFirst).toHaveBeenCalledWith({
      where: { AND: [{ id: event.id }, visibleWhere] },
      select: {
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
      },
    });
    expect(result).toEqual({
      ...event,
      descriptionTruncated: false,
      applicationUrl: 'https://events.example/admin/event-workspace/event/event-1',
      contentTrust: 'untrusted-user-content',
    });
    const query = prisma.event.findFirst.mock.calls[0][0] as { select: Record<string, boolean> };
    for (const field of ['internalNotes', 'attendanceAccessCode', 'createdById', 'person', 'subscribers', 'email']) {
      expect(query.select).not.toHaveProperty(field);
    }
  });

  it('truncates descriptions beyond 20,000 characters and marks them as untrusted content', async () => {
    const { service, user, delegation, event } = context();
    event.description = 'x'.repeat(20_001);

    const result = await service.getEvent(user, delegation.id, event.id);

    expect(result.description).toHaveLength(20_000);
    expect(result.descriptionTruncated).toBe(true);
    expect(result.contentTrust).toBe('untrusted-user-content');
  });

  it('returns no details when the event is unavailable to the current principal', async () => {
    const { service, user, prisma, delegation } = context();
    prisma.event.findFirst.mockResolvedValue(null);

    await expect(service.getEvent(user, delegation.id, 'hidden-event')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns only grouped attendance counts after explicit event attendance permission', async () => {
    const { service, user, prisma, access, delegation, event } = context();

    const result = await service.attendanceSummary(user, delegation.id, event.id);

    expect(access.assertToolAccess).toHaveBeenCalledWith(user, delegation.id, 'ATTENDANCE_READ', event.id);
    expect(prisma.eventAttendance.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { eventId: event.id },
      _count: { _all: true },
    });
    expect(prisma.attendanceReviewFlag.count).toHaveBeenCalledWith({ where: { eventId: event.id, status: 'PENDING' } });
    expect(result).toEqual({
      eventId: event.id,
      attendances: [{ status: 'PRESENT', count: 4 }],
      pendingReviewFlags: 2,
    });
    expect(access.assertToolAccess.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.attendanceReviewFlag.count.mock.invocationCallOrder[0],
    );
    expect(JSON.stringify(result)).not.toMatch(/personId|email|name|academicId|identityDocument/);
  });

  it('never queries attendance or review flags when target permission is denied', async () => {
    const { service, user, prisma, access, delegation, event } = context();
    access.assertToolAccess.mockRejectedValue(new ForbiddenException('No attendance permission'));

    await expect(service.attendanceSummary(user, delegation.id, event.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.eventAttendance.groupBy).not.toHaveBeenCalled();
    expect(prisma.attendanceReviewFlag.count).not.toHaveBeenCalled();
  });
});
