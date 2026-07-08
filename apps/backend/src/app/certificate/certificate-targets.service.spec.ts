import { CertificateScope } from '@cacic-fct/shared-data-types';
import { NotFoundException } from '@nestjs/common';
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

  it('returns no event groups or major events when Typesense has no matches', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch({
      searchEventGroups: jest.fn().mockResolvedValue({
        available: true,
        ids: [],
      }),
      searchMajorEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: [],
      }),
    });
    const service = new CertificateTargetsService(prisma as never, typesenseSearch as never);

    await expect(service.listIssuableEventGroups('ausente', 0, 10)).resolves.toEqual([]);
    await expect(service.listIssuableMajorEvents('ausente', 0, 10)).resolves.toEqual([]);

    expect(prisma.eventGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
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

  it('falls back to SQL target search for event groups and major events when Typesense is unavailable', async () => {
    const prisma = createPrisma();
    const typesenseSearch = createTypesenseSearch({
      searchEventGroups: jest.fn().mockResolvedValue({
        available: false,
        ids: [],
      }),
      searchMajorEvents: jest.fn().mockResolvedValue({
        available: false,
        ids: [],
      }),
    });
    const service = new CertificateTargetsService(prisma as never, typesenseSearch as never);

    await service.listIssuableEventGroups('grupo', 2, 5);
    await service.listIssuableMajorEvents('semana', 3, 6);

    expect(prisma.eventGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: {
            contains: 'grupo',
            mode: 'insensitive',
          },
        }),
        skip: 2,
        take: 5,
      }),
    );
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          name: {
            contains: 'semana',
            mode: 'insensitive',
          },
        }),
        skip: 3,
        take: 6,
      }),
    );
  });

  it('returns no targets when grant filters do not expose matching certificate scopes', async () => {
    const prisma = createPrisma();
    const service = new CertificateTargetsService(prisma as never);
    const accessibleTargets = {
      eventIds: new Set<string>(),
      majorEventIds: new Set<string>(),
      eventGroupIds: new Set<string>(),
    };

    await expect(service.listIssuableEvents(undefined, 0, 20, accessibleTargets)).resolves.toEqual([]);
    await expect(service.listIssuableEventGroups(undefined, 0, 20, accessibleTargets)).resolves.toEqual([]);
    await expect(service.listIssuableMajorEvents(undefined, 0, 20, accessibleTargets)).resolves.toEqual([]);

    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.eventGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
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

  it('accepts issuable event, event group, and major event targets', async () => {
    const prisma = createPrisma();
    prisma.event.findFirst.mockResolvedValue({ id: 'event-1' });
    prisma.eventGroup.findFirst.mockResolvedValue({ id: 'group-1' });
    prisma.majorEvent.findFirst.mockResolvedValue({ id: 'major-1' });
    const service = new CertificateTargetsService(prisma as never);

    await expect(service.assertIssuableTarget(CertificateScope.EVENT, 'event-1')).resolves.toBeUndefined();
    await expect(service.assertIssuableTarget(CertificateScope.EVENT_GROUP, 'group-1')).resolves.toBeUndefined();
    await expect(service.assertIssuableTarget(CertificateScope.MAJOR_EVENT, 'major-1')).resolves.toBeUndefined();

    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'event-1',
        }),
      }),
    );
    expect(prisma.eventGroup.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'group-1',
        }),
      }),
    );
    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'major-1',
        }),
      }),
    );
  });

  it('rejects non-issuable event, event group, and major event targets', async () => {
    const prisma = createPrisma();
    prisma.event.findFirst.mockResolvedValue(null);
    prisma.eventGroup.findFirst.mockResolvedValue(null);
    prisma.majorEvent.findFirst.mockResolvedValue(null);
    const service = new CertificateTargetsService(prisma as never);

    await expect(service.assertIssuableTarget(CertificateScope.EVENT, 'event-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.assertIssuableTarget(CertificateScope.EVENT_GROUP, 'group-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.assertIssuableTarget(CertificateScope.MAJOR_EVENT, 'major-1')).rejects.toBeInstanceOf(
      NotFoundException,
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
