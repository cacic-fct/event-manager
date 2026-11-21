import { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException } from '@nestjs/common';
import { type AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminWorkspaceReadService } from './mcp-admin-workspace-read.service';

const { jest } = import.meta;

function setup() {
  const user: AuthenticatedUser = {
    sub: 'user-1',
    token: 'unused',
    realm_access: { roles: [] },
    roles: ['access'],
    roleSet: new Set(['access']),
    permissions: [],
    permissionSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    claims: { azp: 'mcp-client' },
  };
  const delegated = { eventIds: ['event-1', 'event-2'] };
  const visible = { deletedAt: null, id: { in: ['event-1'] } };
  const access = {
    assertToolAccess: jest.fn().mockResolvedValue(delegated),
    eventWhere: jest.fn().mockResolvedValue(visible),
  };
  const prisma = {
    event: {
      findFirst: jest
        .fn()
        .mockResolvedValue({
          lecturerInformation: 'Instruções',
          collectorInformation: null,
          preparationUpdatedAt: null,
        }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([{ publicationState: 'PUBLISHED', _count: { _all: 1 } }]),
      count: jest.fn().mockResolvedValue(1),
    },
    eventSubscription: {
      groupBy: jest.fn().mockResolvedValue([{ createdByMethod: 'SELF_SUBSCRIPTION', _count: { _all: 2 } }]),
    },
    majorEventSubscription: {
      groupBy: jest.fn().mockResolvedValue([{ subscriptionStatus: 'CONFIRMED', _count: { _all: 1 } }]),
    },
    eventForm: { findMany: jest.fn().mockResolvedValue([]) },
    contentReview: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const service = new McpAdminWorkspaceReadService(
    prisma as unknown as PrismaService,
    access as unknown as McpAdminAccessService,
  );
  return { user, delegated, visible, access, prisma, service };
}

describe('McpAdminWorkspaceReadService', () => {
  it('denies workspace discovery before querying metadata or aggregates', async () => {
    const { service, user, prisma, access } = setup();
    access.assertToolAccess.mockRejectedValue(new ForbiddenException());
    await expect(service.getWorkspaceSummary(user, 'delegation-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.event.groupBy).not.toHaveBeenCalled();
    expect(prisma.event.count).not.toHaveBeenCalled();
  });

  it('intersects selected delegation and current visibility before every workspace aggregate', async () => {
    const { service, user, prisma, visible, delegated } = setup();
    const result = await service.getWorkspaceSummary(user, 'delegation-1');
    const where = { AND: [{ id: { in: delegated.eventIds } }, visible] };
    expect(prisma.event.groupBy).toHaveBeenCalledWith({ by: ['publicationState'], where, _count: { _all: true } });
    for (const [query] of prisma.event.count.mock.calls) expect(query.where.AND[0]).toEqual(where);
    expect(prisma.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ where, take: 21 }));
    expect(result.publication).toEqual([{ state: 'PUBLISHED', count: 1 }]);
    expect(JSON.stringify(prisma.event.findMany.mock.calls)).not.toMatch(
      /materials|lecturerInformation|collectorInformation/,
    );
  });

  it.each([
    'getEventPreparation',
    'getEventMaterials',
    'getRegistrationSummary',
    'listEventForms',
    'getEventContentReview',
  ] as const)('denies %s before domain queries', async (method) => {
    const { service, user, prisma, access } = setup();
    access.assertToolAccess.mockRejectedValue(new ForbiddenException());
    await expect(service[method](user, 'delegation-1', 'event-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
    expect(prisma.eventSubscription.groupBy).not.toHaveBeenCalled();
    expect(prisma.majorEventSubscription.groupBy).not.toHaveBeenCalled();
    expect(prisma.eventForm.findMany).not.toHaveBeenCalled();
    expect(prisma.contentReview.findFirst).not.toHaveBeenCalled();
  });

  it('requires explicit preparation capability and bounds private instructions', async () => {
    const { service, user, access, prisma } = setup();
    prisma.event.findFirst.mockResolvedValue({
      lecturerInformation: 'x'.repeat(10001),
      collectorInformation: null,
      preparationUpdatedAt: null,
    });
    const result = await service.getEventPreparation(user, 'delegation-1', 'event-1');
    expect(access.assertToolAccess).toHaveBeenCalledWith(user, 'delegation-1', 'PREPARATION_READ', 'event-1');
    expect(result.lecturerInformation).toHaveLength(10000);
    expect(result.truncated).toBe(true);
    expect(Object.keys(result)).toEqual([
      'eventId',
      'lecturerInformation',
      'collectorInformation',
      'truncated',
      'updatedAt',
      'eventUpdatedAt',
      'contentTrust',
    ]);
  });

  it('returns parsed HTTPS material links with an explicit projection', async () => {
    const { service, user, prisma, access } = setup();
    const eventUpdatedAt = new Date();
    prisma.event.findFirst.mockResolvedValue({
      materials: [{ title: 'Slides', url: 'https://example.org/slides', objectKey: 'private-object' }],
      materialsUpdatedAt: null,
      updatedAt: eventUpdatedAt,
    } as never);
    const result = await service.getEventMaterials(user, 'delegation-1', 'event-1');
    expect(access.assertToolAccess).toHaveBeenCalledWith(user, 'delegation-1', 'MATERIALS_READ', 'event-1');
    expect(access.eventWhere).toHaveBeenCalledWith(user, Permission.Event.Update);
    expect(result.links).toEqual([{ title: 'Slides', url: 'https://example.org/slides', releaseAfterEvent: false }]);
    expect(result.eventUpdatedAt).toEqual(eventUpdatedAt);
    expect(JSON.stringify(result)).not.toContain('private-object');
  });

  it('rejects stored material URLs containing credentials instead of leaking them', async () => {
    const { service, user, prisma } = setup();
    prisma.event.findFirst.mockResolvedValue({
      materials: [{ title: 'Slides', url: 'https://user:secret@example.org/slides' }],
      materialsUpdatedAt: null,
    } as never);
    await expect(service.getEventMaterials(user, 'delegation-1', 'event-1')).rejects.toThrow('sem credenciais');
  });

  it('rejects invalid form pagination before accessing domain records', async () => {
    const { service, user, prisma } = setup();
    await expect(service.listEventForms(user, 'delegation-1', 'event-1', -1)).rejects.toThrow('Página inválida');
    expect(prisma.eventForm.findMany).not.toHaveBeenCalled();
  });

  it('counts only active registrations and parent registrations selecting this event', async () => {
    const { service, user, prisma, visible } = setup();
    const result = await service.getRegistrationSummary(user, 'delegation-1', 'event-1');
    const event = { is: { AND: [{ id: 'event-1' }, visible, visible] } };
    expect(prisma.eventSubscription.groupBy).toHaveBeenCalledWith({
      by: ['createdByMethod'],
      where: { eventId: 'event-1', event, deletedAt: null, lgpdDeletionRequestId: null },
      _count: { _all: true },
    });
    expect(prisma.majorEventSubscription.groupBy).toHaveBeenCalledWith({
      by: ['subscriptionStatus'],
      where: {
        deletedAt: null,
        lgpdDeletionRequestId: null,
        selectedEvents: { some: { eventId: 'event-1', event, deletedAt: null, lgpdDeletionRequestId: null } },
      },
      _count: { _all: true },
    });
    expect(result.eventRegistrations).toEqual([{ creationMethod: 'SELF_SUBSCRIPTION', count: 2 }]);
    expect(result.majorEventSelections).toEqual([{ status: 'CONFIRMED', count: 1 }]);
    expect(JSON.stringify(result)).not.toMatch(/personId|email|receipt|price/);
  });

  it('restricts forms to the authorized owner event before pagination and excludes answers', async () => {
    const { service, user, access, prisma, visible } = setup();
    const result = await service.listEventForms(user, 'delegation-1', 'event-1', 20);
    expect(access.assertToolAccess).toHaveBeenCalledWith(user, 'delegation-1', 'FORMS_READ', 'event-1');
    expect(access.eventWhere).toHaveBeenCalledWith(user, Permission.EventForm.Read);
    expect(prisma.eventForm.findMany).toHaveBeenCalledWith({
      where: {
        ownerEventId: 'event-1',
        ownerMajorEventId: null,
        ownerEvent: { is: { AND: [{ id: 'event-1' }, visible, visible] } },
        deletedAt: null,
      },
      select: { id: true, name: true, publicationState: true, responseMode: true, updatedAt: true },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: 20,
      take: 21,
    });
    expect(result.coverage).toBe('event-owned-only');
    expect(result.nextOffset).toBeNull();
  });

  it('returns staged material changes without author identities or profile details', async () => {
    const { service, user, prisma, access } = setup();
    const eventUpdatedAt = new Date();
    prisma.contentReview.findFirst.mockResolvedValue({
      id: 'review-1',
      eventId: 'event-1',
      personId: null,
      revision: 2,
      updatedAt: null,
      event: { updatedAt: eventUpdatedAt },
      changes: [
        {
          kind: 'material',
          key: 'material-1',
          before: null,
          after: { title: 'Slides', url: 'https://example.org/slides' },
          authorName: 'Private author',
          authorPersonId: 'private-id',
        },
        { kind: 'profileField', key: 'email', after: 'private@example.org' },
      ],
    } as never);
    const result = await service.getEventContentReview(user, 'delegation-1', 'event-1');
    expect(access.assertToolAccess).toHaveBeenCalledWith(user, 'delegation-1', 'CONTENT_REVIEWS_READ', 'event-1');
    expect(result.review?.changes).toEqual([
      {
        key: 'material-1',
        before: null,
        after: { title: 'Slides', url: 'https://example.org/slides', releaseAfterEvent: false },
      },
    ]);
    expect(result.eventUpdatedAt).toEqual(eventUpdatedAt);
    expect(JSON.stringify(result)).not.toMatch(/Private author|private-id|private@example/);
  });
});
