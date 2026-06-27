import { RATE_LIMIT_METADATA_KEY } from '../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';
import { PublicMajorEventsResolver } from './major-events.resolver';
import { PUBLIC_MAJOR_EVENT_WHERE } from './models';
import { createPublicMajorEventRecord } from './testing/public-event-record.fixtures';

describe('PublicMajorEventsResolver', () => {
  it('uses a bounded Typesense page for public major-event search pagination', async () => {
    const prisma = {
      majorEvent: {
        findMany: jest.fn().mockResolvedValue([createPublicMajorEventRecord({ id: 'major-1' })]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchMajorEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: ['major-1'],
      }),
    };
    const resolver = new PublicMajorEventsResolver(prisma as never, typesenseSearch as never);

    await expect(
      resolver.publicMajorEvents(' congresso ', undefined, undefined, 10_000, 1_000),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'major-1',
        name: 'Major 1',
      }),
    ]);

    expect(typesenseSearch.searchMajorEvents).toHaveBeenCalledWith('congresso', {
      filterBy: 'publicationState:=PUBLISHED',
      limit: 1_000,
      offset: 10_000,
    });
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...PUBLIC_MAJOR_EVENT_WHERE,
          id: {
            in: ['major-1'],
          },
        },
        skip: 0,
        take: 1,
      }),
    );
  });

  it('returns no major events without querying SQL when Typesense returns zero ids', async () => {
    const prisma = {
      majorEvent: {
        findMany: jest.fn(),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchMajorEvents: jest.fn().mockResolvedValue({
        available: true,
        ids: [],
      }),
    };
    const resolver = new PublicMajorEventsResolver(prisma as never, typesenseSearch as never);

    await expect(resolver.publicMajorEvents('sem resultados')).resolves.toEqual([]);

    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
  });

  it('falls back to SQL name and date filters when major-event search is unavailable', async () => {
    const startDateFrom = new Date('2026-06-01T00:00:00.000Z');
    const startDateUntil = new Date('2026-06-30T23:59:59.000Z');
    const prisma = {
      majorEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const typesenseSearch = {
      isEnabled: jest.fn().mockReturnValue(true),
      searchMajorEvents: jest.fn().mockResolvedValue({
        available: false,
        ids: [],
      }),
    };
    const resolver = new PublicMajorEventsResolver(prisma as never, typesenseSearch as never);

    await resolver.publicMajorEvents(' semana ', startDateFrom, startDateUntil, 5, 10);

    expect(typesenseSearch.searchMajorEvents).toHaveBeenCalledWith('semana', {
      filterBy: 'publicationState:=PUBLISHED && startDate:>=1780272000 && startDate:<=1782863999',
      limit: 10,
      offset: 5,
    });
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          ...PUBLIC_MAJOR_EVENT_WHERE,
          startDate: {
            gte: startDateFrom,
            lte: startDateUntil,
          },
          name: {
            contains: 'semana',
            mode: 'insensitive',
          },
        },
        skip: 5,
        take: 10,
      }),
    );
  });

  it('loads one public major event through the shared publication predicate', async () => {
    const prisma = {
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue(createPublicMajorEventRecord({ id: 'major-detail' })),
      },
    };
    const resolver = new PublicMajorEventsResolver(prisma as never, { isEnabled: () => false } as never);

    await expect(resolver.publicMajorEvent('major-detail')).resolves.toEqual(
      expect.objectContaining({ id: 'major-detail' }),
    );

    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: {
        ...PUBLIC_MAJOR_EVENT_WHERE,
        id: 'major-detail',
      },
      select: expect.any(Object),
    });
  });

  it('applies the public events rate-limit policy', () => {
    const metadata = Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, PublicMajorEventsResolver.prototype.publicMajorEvents);

    expect(metadata).toEqual({
      policy: RATE_LIMIT_POLICIES.publicEvents,
      resources: [],
    });
  });
});
