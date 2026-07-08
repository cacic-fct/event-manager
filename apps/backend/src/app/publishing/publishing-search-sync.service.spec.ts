import { PublicationState } from '@cacic-fct/shared-data-types';
import { PublicationSearchSyncService } from './publishing-search-sync.service';
import { PUBLICATION_EVENT_SELECT } from './publishing.selects';

describe('PublicationSearchSyncService', () => {
  function createService() {
    const prisma = {
      event: {
        findMany: jest.fn(),
      },
      majorEvent: {
        findMany: jest.fn(),
      },
    };
    const typesenseSearch = {
      upsertEvent: jest.fn().mockResolvedValue(undefined),
      upsertMajorEvent: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PublicationSearchSyncService(prisma as never, typesenseSearch as never);

    return { prisma, service, typesenseSearch };
  }

  it('deduplicates targets and skips child event upserts when the parent major event is synced', async () => {
    const { prisma, service, typesenseSearch } = createService();
    const startDate = new Date('2026-07-07T14:00:00.000Z');
    const endDate = new Date('2026-07-07T16:00:00.000Z');
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'standalone-event',
        name: 'Evento avulso',
        emoji: 'target',
        type: 'LECTURE',
        description: 'Descricao completa',
        shortDescription: 'Descricao curta',
        locationDescription: 'Auditorio',
        majorEventId: null,
        eventGroupId: 'group-1',
        shouldIssueCertificate: true,
        publiclyVisible: true,
        publicationState: PublicationState.PUBLISHED,
        startDate,
        endDate,
      },
      {
        id: 'child-event',
        name: 'Evento de grande evento',
        emoji: null,
        type: 'WORKSHOP',
        description: null,
        shortDescription: null,
        locationDescription: null,
        majorEventId: 'major-event',
        eventGroupId: null,
        shouldIssueCertificate: false,
        publiclyVisible: true,
        publicationState: PublicationState.PUBLISHED,
        startDate,
        endDate,
      },
    ]);
    prisma.majorEvent.findMany.mockResolvedValue([
      {
        id: 'major-event',
        name: 'Grande evento',
        description: 'Descricao do grande evento',
        publicationState: PublicationState.PUBLISHED,
        startDate,
        endDate,
      },
    ]);

    await service.syncSearch({
      eventIds: ['standalone-event', 'child-event', 'standalone-event'],
      majorEventIds: ['major-event', 'major-event'],
    });

    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['standalone-event', 'child-event'] }, deletedAt: null },
      select: PUBLICATION_EVENT_SELECT,
    });
    expect(prisma.majorEvent.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['major-event'] }, deletedAt: null },
      select: {
        id: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        publicationState: true,
      },
    });
    expect(typesenseSearch.upsertEvent).toHaveBeenCalledTimes(1);
    expect(typesenseSearch.upsertEvent).toHaveBeenCalledWith({
      id: 'standalone-event',
      name: 'Evento avulso',
      emoji: 'target',
      type: 'LECTURE',
      description: 'Descricao completa',
      shortDescription: 'Descricao curta',
      locationDescription: 'Auditorio',
      majorEventId: null,
      eventGroupId: 'group-1',
      shouldIssueCertificate: true,
      publiclyVisible: true,
      publicationState: PublicationState.PUBLISHED,
      startDate,
      endDate,
    });
    expect(typesenseSearch.upsertMajorEvent).toHaveBeenCalledWith({
      id: 'major-event',
      name: 'Grande evento',
      description: 'Descricao do grande evento',
      publicationState: PublicationState.PUBLISHED,
      startDate,
      endDate,
    });
  });

  it('upserts child events directly when their parent major event is not part of the sync', async () => {
    const { prisma, service, typesenseSearch } = createService();
    const startDate = new Date('2026-07-07T14:00:00.000Z');
    const endDate = new Date('2026-07-07T16:00:00.000Z');
    prisma.event.findMany.mockResolvedValue([
      {
        id: 'child-event',
        name: 'Evento de grande evento',
        emoji: null,
        type: 'WORKSHOP',
        description: null,
        shortDescription: null,
        locationDescription: null,
        majorEventId: 'major-event',
        eventGroupId: null,
        shouldIssueCertificate: false,
        publiclyVisible: false,
        publicationState: PublicationState.SCHEDULED,
        startDate,
        endDate,
      },
    ]);

    await service.syncSearch({
      eventIds: ['child-event'],
      majorEventIds: [],
    });

    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
    expect(typesenseSearch.upsertEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'child-event',
        majorEventId: 'major-event',
        publicationState: PublicationState.SCHEDULED,
      }),
    );
    expect(typesenseSearch.upsertMajorEvent).not.toHaveBeenCalled();
  });

  it('does not query or write search documents when no targets need syncing', async () => {
    const { prisma, service, typesenseSearch } = createService();

    await service.syncSearch({
      eventIds: [],
      majorEventIds: [],
    });

    expect(prisma.event.findMany).not.toHaveBeenCalled();
    expect(prisma.majorEvent.findMany).not.toHaveBeenCalled();
    expect(typesenseSearch.upsertEvent).not.toHaveBeenCalled();
    expect(typesenseSearch.upsertMajorEvent).not.toHaveBeenCalled();
  });
});
