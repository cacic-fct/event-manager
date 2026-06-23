import { CertificateTargetsService } from './certificate-targets.service';

describe('CertificateTargetsService', () => {
  it('uses Typesense rank for issuable event searches before applying pagination', async () => {
    const prisma = createPrisma();
    prisma.event.findMany.mockResolvedValue([{ id: 'event-b' }]);
    const typesenseSearch = createTypesenseSearch({
      searchEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: ['event-b'],
      }),
    });
    const service = new CertificateTargetsService(prisma as never, typesenseSearch as never);

    await expect(service.listIssuableEvents(' aula ', 1, 1)).resolves.toEqual([{ id: 'event-b' }]);

    expect(typesenseSearch.searchEvents).toHaveBeenCalledWith('aula', {
      filterBy: 'isIssuableCertificateEvent:=true',
      limit: 1,
      offset: 1,
    });
    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['event-b'],
          },
        }),
        skip: 0,
        take: 1,
      }),
    );
  });

  it('returns no issuable events when Typesense has no matches', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch({
      searchEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: [],
      }),
    });
    const service = new CertificateTargetsService(prisma as never, typesenseSearch as never);

    await expect(service.listIssuableEvents('ausente', 0, 10)).resolves.toEqual([]);

    expect(prisma.event.findMany).not.toHaveBeenCalled();
  });

  it('uses Typesense rank for event group and major event target searches', async () => {
    const prisma = createPrisma();
    prisma.eventGroup.findMany.mockResolvedValue([{ id: 'group-b' }, { id: 'group-a' }]);
    prisma.majorEvent.findMany.mockResolvedValue([{ id: 'major-b' }, { id: 'major-a' }]);
    const typesenseSearch = createTypesenseSearch({
      searchEventGroups: jest.fn().mockResolvedValue({
        available: true,
        ids: ['group-a', 'group-b'],
      }),
      searchMajorEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: ['major-a', 'major-b'],
      }),
    });
    const service = new CertificateTargetsService(prisma as never, typesenseSearch as never);

    await expect(service.listIssuableEventGroups('grupo', 1, 1)).resolves.toEqual([{ id: 'group-b' }]);
    await expect(service.listIssuableMajorEvents('semana', 1, 1)).resolves.toEqual([{ id: 'major-b' }]);

    expect(typesenseSearch.searchEventGroups).toHaveBeenCalledWith('grupo', 2);
    expect(typesenseSearch.searchMajorEvents).toHaveBeenCalledWith('semana', 2);
    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['group-a', 'group-b'],
          },
        }),
        skip: 0,
        take: 2,
      }),
    );
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            in: ['major-a', 'major-b'],
          },
        }),
        skip: 0,
        take: 2,
      }),
    );
  });

  it('falls back to SQL target search when Typesense is unavailable', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch({
      searchEvents: jest.fn().mockResolvedValue({
        available: false,
        ids: [],
      }),
    });
    const service = new CertificateTargetsService(prisma as never, typesenseSearch as never);

    await service.listIssuableEvents('aula', 0, 10);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: {
            contains: 'aula',
            mode: 'insensitive',
          },
        }),
        skip: 0,
        take: 10,
      }),
    );
  });

  it('filters issuable events to accessible certificate config targets', async () => {
    const prisma = createPrisma();
    const service = new CertificateTargetsService(prisma as never);
    const accessibleTargets = {
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    };

    await service.listIssuableEvents('cert', 5, 10, accessibleTargets);

    expect(prisma.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [
            {
              OR: [
                { id: { in: ['event-1'] } },
                { majorEventId: { in: ['major-1'] } },
                { eventGroupId: { in: ['group-1'] } },
              ],
            },
          ],
        }),
        skip: 5,
        take: 10,
      }),
    );
  });

  it('filters event group and major event target pickers to matching grant scopes', async () => {
    const prisma = createPrisma();
    const service = new CertificateTargetsService(prisma as never);
    const accessibleTargets = {
      eventIds: new Set(['event-1']),
      majorEventIds: new Set(['major-1']),
      eventGroupIds: new Set(['group-1']),
    };

    await service.listIssuableEventGroups(undefined, 0, 20, accessibleTargets);
    await service.listIssuableMajorEvents(undefined, 0, 20, accessibleTargets);

    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['group-1'] },
        }),
      }),
    );
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['major-1'] },
        }),
      }),
    );
  });
});

function createPrisma() {
  return {
    event: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    eventGroup: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    majorEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
  };
}

function createTypesenseSearch(overrides: Partial<{
  searchEvents: jest.Mock;
  searchEventGroups: jest.Mock;
  searchMajorEvents: jest.Mock;
}> = {}) {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    searchEvents: jest.fn(),
    searchEventGroups: jest.fn(),
    searchMajorEvents: jest.fn(),
    ...overrides,
  };
}
