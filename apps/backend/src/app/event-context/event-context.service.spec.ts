import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { AdminEventContextKind } from './event-context.models';
import { EventContextService } from './event-context.service';

describe('EventContextService', () => {
  it('filters the complete event inventory before pagination, preserving access restrictions', async () => {
    const harness = createHarness();
    harness.typesense.isEnabled.mockReturnValue(true);
    harness.authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['permitted-event']), eventGroupIds: new Set(), majorEventIds: new Set(),
    });
    const startDateFrom = new Date();
    const startDateUntil = new Date(startDateFrom.getTime() + 86400000);
    await harness.service.getPage({} as never, { startDateFrom, startDateUntil, isInGroup: true, isInMajorEvent: false });
    expect(harness.prisma.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [
      { deletedAt: null }, { OR: [{ id: { in: ['permitted-event'] } }] },
      { startDate: { gte: startDateFrom, lte: startDateUntil }, eventGroupId: { not: null }, majorEventId: null },
    ] }, skip: 0, take: 21 }));
    expect(harness.prisma.eventGroup.findMany).not.toHaveBeenCalled();
    expect(harness.prisma.majorEvent.findMany).not.toHaveBeenCalled();
    expect(harness.typesense.searchEventsRanked).not.toHaveBeenCalled();
  });

  it('invalidates a cursor when event filters change', async () => {
    const harness = createHarness();
    harness.prisma.event.findMany.mockResolvedValue([eventRecord({ id: 'a' }), eventRecord({ id: 'b' })]);
    const first = await harness.service.getPage({} as never, { isInGroup: true, take: 1 });
    await expect(harness.service.getPage({} as never, {
      isInGroup: false, take: 1, cursor: first.nextCursor ?? undefined,
    })).rejects.toThrow('Invalid event-context cursor');
  });

  it('includes grouped events when filtering within a major event', async () => {
    const harness = createHarness();
    harness.prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major' });
    await harness.service.getPage({} as never, { parentKind: 'MAJOR_EVENT', parentId: 'major', isInGroup: true });
    const where = harness.prisma.event.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"majorEventId":"major"');
    expect(JSON.stringify(where)).not.toContain('"eventGroupId":null');
  });

  it('searches all readable events in SQL instead of applying the root hierarchy filter', async () => {
    const harness = createHarness([Permission.Event.Read]);

    await harness.service.getPage({} as never, { query: 'Semana laboratorio' });

    const where = harness.prisma.event.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.AND[1].AND).toHaveLength(2);
    expect(JSON.stringify(where)).not.toContain('"eventGroupId":{"not":null}');
  });

  it('promotes a readable child while withholding an unreadable ancestor breadcrumb', async () => {
    const harness = createHarness([Permission.Event.Read]);
    harness.authorization.accessibleEventTargets.mockResolvedValue({
      eventIds: new Set(['event-1']),
      eventGroupIds: new Set(),
      majorEventIds: new Set(),
    });
    harness.prisma.event.findMany.mockResolvedValueOnce([eventRecord({ eventGroupId: 'hidden-group' })]);

    const page = await harness.service.getPage({} as never);

    expect(page.nodes).toEqual([
      expect.objectContaining({ id: 'event-1', ancestors: [], hasChildren: false }),
    ]);
    expect(JSON.stringify(harness.prisma.event.findMany.mock.calls[0][0].where)).toContain('eventGroup');
    expect(JSON.stringify(harness.prisma.event.findMany.mock.calls[0][0].where)).toContain('NOT');
    expect(harness.prisma.eventGroup.findMany).not.toHaveBeenCalled();
  });

  it('rejects an unreadable parent instead of revealing whether it exists', async () => {
    const harness = createHarness([Permission.EventGroup.Read, Permission.Event.Read]);
    harness.authorization.accessibleEventGroupIds.mockResolvedValue(new Set(['other-group']));

    await expect(harness.service.getPage({} as never, {
      parentKind: AdminEventContextKind.EVENT_GROUP,
      parentId: 'hidden-group',
    })).rejects.toBeInstanceOf(NotFoundException);
    expect(harness.prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('includes legacy groups through their events when listing a major-event context', async () => {
    const harness = createHarness();
    harness.prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    harness.prisma.eventGroup.findMany.mockResolvedValueOnce([
      { id: 'legacy-group', name: 'Grupo legado', emoji: '📚', majorEventId: null, updatedAt: new Date() },
    ]);

    const page = await harness.service.getPage({} as never, {
      parentKind: AdminEventContextKind.MAJOR_EVENT,
      parentId: 'major-1',
      childKind: AdminEventContextKind.EVENT_GROUP,
    });

    expect(page.nodes.map((node) => node.id)).toEqual(['legacy-group']);
    const where = harness.prisma.eventGroup.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"majorEventId":null');
    expect(JSON.stringify(where)).toContain('"events"');
  });

  it('reports legacy event membership when checking major-event children', async () => {
    const harness = createHarness();
    harness.prisma.majorEvent.findMany.mockResolvedValueOnce([
      {
        id: 'major-1',
        name: 'Semana acadêmica',
        emoji: '🎓',
        startDate: new Date('2026-09-14T12:00:00.000Z'),
        endDate: new Date('2026-09-14T13:00:00.000Z'),
        publicationState: 'PUBLISHED',
      },
    ]);
    harness.prisma.eventGroup.findMany.mockResolvedValueOnce([
      { id: 'legacy-group', majorEventId: null, events: [{ majorEventId: 'major-1' }] },
    ]);

    const page = await harness.service.getPage({} as never, {
      childKind: AdminEventContextKind.MAJOR_EVENT,
    });

    expect(page.nodes[0]).toEqual(expect.objectContaining({ id: 'major-1', hasChildren: true }));
    const where = harness.prisma.eventGroup.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"majorEventId":null');
    expect(JSON.stringify(where)).toContain('"events"');
  });

  it('drains stale ranked hits and advances the cursor to the first emitted live hit', async () => {
    const harness = createHarness();
    harness.typesense.isEnabled.mockReturnValue(true);
    harness.typesense.searchEventsRanked
      .mockResolvedValueOnce(rankedResult(['stale-1', 'stale-2'], 4, ['400', '300']))
      .mockResolvedValueOnce(rankedResult(['event-3', 'event-4'], 4, ['200', '100']));
    harness.prisma.event.findMany.mockImplementation(async ({ where }: { where: unknown }) => {
      const ids = idsFromWhere(where);
      return ids.filter((id) => id.startsWith('event-')).map((id) => eventRecord({ id }));
    });

    const page = await harness.service.getPage({} as never, { query: 'laboratorio', take: 1 });

    expect(page.nodes.map((node) => node.id)).toEqual(['event-3']);
    expect(harness.typesense.searchEventsRanked.mock.calls.map((call) => call[1].offset)).toEqual([0, 2]);
    const cursor = JSON.parse(Buffer.from(page.nextCursor ?? '', 'base64url').toString('utf8'));
    expect(cursor.source).toBe('typesense');
    expect(cursor.offsets.EVENT).toBe(3);
  });

  it('keeps an authorized typo-tolerant Typesense hit that is not a literal SQL substring match', async () => {
    const harness = createHarness();
    harness.typesense.isEnabled.mockReturnValue(true);
    harness.typesense.searchEventsRanked.mockResolvedValueOnce(rankedResult(['event-1'], 1, ['100']));
    harness.prisma.event.findMany.mockResolvedValueOnce([eventRecord({ name: 'Laboratório' })]);

    const page = await harness.service.getPage({} as never, { query: 'laboratrio' });

    expect(page.nodes.map((node) => node.id)).toEqual(['event-1']);
  });

  it('keeps a ranked cursor pinned and asks the client to restart after Typesense becomes unavailable', async () => {
    const harness = createHarness();
    harness.typesense.isEnabled.mockReturnValue(true);
    harness.typesense.searchEventsRanked.mockResolvedValue(rankedResult(['event-1', 'event-2'], 2, ['20', '10']));
    harness.prisma.event.findMany.mockImplementation(async ({ where }: { where: unknown }) => {
      const ids = idsFromWhere(where);
      return ids.map((id) => eventRecord({ id }));
    });
    const first = await harness.service.getPage({} as never, { query: 'evento', take: 1 });
    harness.typesense.searchEventsRanked.mockRejectedValueOnce(Object.assign(new Error('invalid index schema'), {
      httpStatus: 400,
    }));

    await expect(harness.service.getPage({} as never, {
      query: 'evento',
      take: 1,
      cursor: first.nextCursor ?? undefined,
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('falls back to SQL when the first ranked request is rejected by an outdated index', async () => {
    const harness = createHarness();
    harness.typesense.isEnabled.mockReturnValue(true);
    harness.typesense.searchEventsRanked.mockRejectedValueOnce(Object.assign(new Error('unknown field'), {
      httpStatus: 400,
    }));
    harness.prisma.event.findMany.mockResolvedValueOnce([eventRecord()]);

    const page = await harness.service.getPage({} as never, { query: 'evento' });

    expect(page.nodes.map((node) => node.id)).toEqual(['event-1']);
    expect(page.nextCursor).toBeNull();
    expect(harness.prisma.event.findMany).toHaveBeenCalled();
  });

  it('chooses SQL from the first page when ranked results reach the provider window', async () => {
    const harness = createHarness();
    harness.typesense.isEnabled.mockReturnValue(true);
    harness.typesense.searchEventsRanked.mockResolvedValueOnce(rankedResult(['event-ranked'], 10_000));
    harness.prisma.event.findMany.mockResolvedValueOnce([eventRecord({ id: 'event-sql' })]);

    const page = await harness.service.getPage({} as never, {
      childKind: AdminEventContextKind.EVENT,
      query: 'evento',
    });

    expect(page.nodes.map((node) => node.id)).toEqual(['event-sql']);
    expect(harness.prisma.event.findMany).toHaveBeenCalledTimes(1);
  });

  it('uses the canonical group relation for ancestry and omits a deleted group chain', async () => {
    const harness = createHarness();
    harness.prisma.event.findMany.mockResolvedValueOnce([
      eventRecord({ majorEventId: 'conflicting-major', eventGroupId: 'group-1' }),
    ]);
    harness.prisma.eventGroup.findMany.mockResolvedValueOnce([{
      id: 'group-1', name: 'Grupo', emoji: '👥', majorEventId: 'canonical-major',
    }]);
    harness.prisma.majorEvent.findMany.mockResolvedValueOnce([{ id: 'canonical-major', name: 'Semana', emoji: '🎓' }]);

    const visible = await harness.service.getPage({} as never, { childKind: AdminEventContextKind.EVENT });

    expect(visible.nodes[0].ancestors.map((ancestor) => ancestor.id)).toEqual(['canonical-major', 'group-1']);
    expect(JSON.stringify(harness.prisma.majorEvent.findMany.mock.calls[0][0].where)).toContain('canonical-major');
    expect(JSON.stringify(harness.prisma.majorEvent.findMany.mock.calls[0][0].where)).not.toContain('conflicting-major');

    harness.prisma.event.findMany.mockResolvedValueOnce([
      eventRecord({ id: 'event-2', majorEventId: 'conflicting-major', eventGroupId: 'deleted-group' }),
    ]);
    harness.prisma.eventGroup.findMany.mockResolvedValueOnce([]);
    harness.prisma.majorEvent.findMany.mockClear();

    const hidden = await harness.service.getPage({} as never, { childKind: AdminEventContextKind.EVENT });
    expect(hidden.nodes[0].ancestors).toEqual([]);
    expect(harness.prisma.majorEvent.findMany).not.toHaveBeenCalled();
  });

  it('hydrates ancestry and child availability with bounded bulk queries', async () => {
    const harness = createHarness();
    harness.prisma.event.findMany
      .mockResolvedValueOnce([
        eventRecord({ id: 'event-1', eventGroupId: 'group-1' }),
        eventRecord({ id: 'event-2', eventGroupId: 'group-2' }),
      ]);
    harness.prisma.eventGroup.findMany.mockResolvedValueOnce([
      { id: 'group-1', name: 'Grupo 1', emoji: '1️⃣', majorEventId: 'major-1' },
      { id: 'group-2', name: 'Grupo 2', emoji: '2️⃣', majorEventId: 'major-1' },
    ]);
    harness.prisma.majorEvent.findMany.mockResolvedValueOnce([
      { id: 'major-1', name: 'Grande evento', emoji: '🎓' },
    ]);

    const page = await harness.service.getPage({} as never, {
      childKind: AdminEventContextKind.EVENT,
    });

    expect(page.nodes).toHaveLength(2);
    expect(page.nodes.every((node) => node.ancestors.map((ancestor) => ancestor.id).join(',') === 'major-1,' + node.id.replace('event', 'group'))).toBe(true);
    expect(harness.prisma.eventGroup.findMany).toHaveBeenCalledTimes(1);
    expect(harness.prisma.majorEvent.findMany).toHaveBeenCalledTimes(1);
    expect(harness.prisma.event.findFirst).not.toHaveBeenCalled();
    expect(harness.prisma.eventGroup.findFirst).not.toHaveBeenCalled();
    expect(harness.prisma.majorEvent.findFirst).not.toHaveBeenCalled();
  });
});

function createHarness(granted = [Permission.Event.Read, Permission.EventGroup.Read, Permission.MajorEvent.Read]) {
  const prisma = {
    event: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    eventGroup: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    majorEvent: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
  };
  const authorization = {
    evaluatePermissions: jest.fn().mockResolvedValue(granted),
    accessibleEventTargets: jest.fn().mockResolvedValue(null),
    accessibleEventGroupIds: jest.fn().mockResolvedValue(null),
    accessibleMajorEventIds: jest.fn().mockResolvedValue(null),
  };
  const typesense = {
    isEnabled: jest.fn().mockReturnValue(false),
    searchEventsRanked: jest.fn().mockResolvedValue(rankedResult([], 0)),
    searchEventGroupsRanked: jest.fn().mockResolvedValue(rankedResult([], 0)),
    searchMajorEventsRanked: jest.fn().mockResolvedValue(rankedResult([], 0)),
  };
  return {
    prisma,
    authorization,
    typesense,
    service: new EventContextService(prisma as never, authorization as never, typesense as never),
  };
}

function eventRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'event-1',
    name: 'Evento',
    emoji: '📅',
    startDate: new Date('2026-09-14T12:00:00.000Z'),
    endDate: new Date('2026-09-14T13:00:00.000Z'),
    type: 'PALESTRA',
    locationDescription: 'Laboratório',
    publicationState: 'PUBLISHED',
    majorEventId: null,
    eventGroupId: null,
    ...overrides,
  };
}

function rankedResult(ids: string[], found: number, scores = ids.map(() => '1')) {
  return {
    available: true,
    found,
    hits: ids.map((id, index) => ({ id, score: scores[index] })),
  };
}

function idsFromWhere(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as { id?: { in?: string[] }; AND?: unknown[] };
  if (record.id?.in) return record.id.in;
  return record.AND?.flatMap((part) => idsFromWhere(part)) ?? [];
}
