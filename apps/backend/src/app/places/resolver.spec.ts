import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { PlacePresetsResolver } from './resolver';

describe('PlacePresetsResolver', () => {
  it('lists active places alphabetically with query filters', async () => {
    const prisma = createPrismaMock();
    const resolver = new PlacePresetsResolver(prisma as never);

    await resolver.placePresets('lab', 5, 10);

    expect(prisma.placePreset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          OR: [
            { name: { contains: 'lab', mode: 'insensitive' } },
            { locationDescription: { contains: 'lab', mode: 'insensitive' } },
          ],
        },
        orderBy: {
          name: 'asc',
        },
        skip: 5,
        take: 10,
      }),
    );
  });

  it('lists active places without a search clause for blank queries', async () => {
    const prisma = createPrismaMock();
    const resolver = new PlacePresetsResolver(prisma as never);

    await resolver.placePresets('   ');

    expect(prisma.placePreset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
        },
        skip: 0,
        take: 50,
      }),
    );
  });

  it('uses Typesense rank for place searches before applying pagination', async () => {
    const prisma = createPrismaMock();
    prisma.placePreset.findMany.mockResolvedValue([{ id: 'place-b' }, { id: 'place-a' }]);
    const typesenseSearch = createTypesenseMock({
      searchPlacePresets: jest.fn().mockResolvedValue({
        available: true,
        ids: ['place-a', 'place-b'],
      }),
    });
    const resolver = new PlacePresetsResolver(prisma as never, createAuditLogMock() as never, typesenseSearch as never);

    await expect(resolver.placePresets(' lab ', 1, 1)).resolves.toEqual([{ id: 'place-b' }]);

    expect(typesenseSearch.searchPlacePresets).toHaveBeenCalledWith('lab', 2);
    expect(prisma.placePreset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          deletedAt: null,
          id: {
            in: ['place-a', 'place-b'],
          },
        },
        skip: 0,
        take: 2,
      }),
    );
  });

  it('returns one active place and rejects missing places', async () => {
    const prisma = createPrismaMock();
    const resolver = new PlacePresetsResolver(prisma as never);

    await expect(resolver.placePreset('place-1')).resolves.toEqual({ id: 'place-1' });
    expect(prisma.placePreset.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'place-1',
          deletedAt: null,
        },
      }),
    );

    prisma.placePreset.findFirst.mockResolvedValueOnce(null);
    await expect(resolver.placePreset('missing-place')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('normalizes blank fields when creating a preset', async () => {
    const prisma = createPrismaMock();
    const auditLog = createAuditLogMock();
    const resolver = new PlacePresetsResolver(prisma as never, auditLog as never);

    await resolver.createPlacePreset({
      name: '  Sala 1  ',
      latitude: undefined,
      longitude: -49.2,
      locationDescription: '  ',
    });

    expect(prisma.placePreset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: 'Sala 1',
          latitude: null,
          longitude: -49.2,
          locationDescription: null,
        },
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.PLACE_PRESET,
        entityId: 'place-1',
        operation: AuditLogOperation.CREATE,
        scope: { permission: Permission.PlacePreset.Create },
      }),
      prisma,
    );
  });

  it('synchronizes place preset search documents after mutations', async () => {
    const prisma = createPrismaMock();
    const typesenseSearch = createTypesenseMock();
    const resolver = new PlacePresetsResolver(prisma as never, createAuditLogMock() as never, typesenseSearch as never);

    await resolver.createPlacePreset({
      name: 'Sala 1',
      latitude: null,
      longitude: null,
      locationDescription: 'Bloco A',
    });
    await resolver.updatePlacePreset('place-1', {
      name: 'Sala 2',
      locationDescription: 'Bloco B',
    });
    await resolver.deletePlacePreset('place-1');

    expect(typesenseSearch.upsertPlacePreset).toHaveBeenCalledWith({
      id: 'place-1',
      name: 'Sala 1',
      locationDescription: 'Bloco A',
    });
    expect(typesenseSearch.upsertPlacePreset).toHaveBeenCalledWith({
      id: 'place-1',
      name: 'Sala 2',
      locationDescription: 'Bloco B',
    });
    expect(typesenseSearch.deletePlacePreset).toHaveBeenCalledWith('place-1');
  });

  it('updates and deletes active presets only', async () => {
    const prisma = createPrismaMock();
    const auditLog = createAuditLogMock();
    const resolver = new PlacePresetsResolver(prisma as never, auditLog as never);

    await resolver.updatePlacePreset('place-1', {
      name: '  Lab 2  ',
      latitude: null,
      longitude: undefined,
      locationDescription: '  Second floor  ',
    });

    expect(prisma.placePreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'place-1',
          deletedAt: null,
        },
        data: {
          name: 'Lab 2',
          latitude: null,
          longitude: null,
          locationDescription: 'Second floor',
        },
      }),
    );

    await expect(resolver.deletePlacePreset('place-1')).resolves.toEqual({
      deleted: true,
      id: 'place-1',
    });
    expect(prisma.placePreset.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          id: 'place-1',
          deletedAt: null,
        },
        data: {
          deletedAt: expect.any(Date),
        },
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.PLACE_PRESET,
        entityId: 'place-1',
        operation: AuditLogOperation.UPDATE,
        scope: { permission: Permission.PlacePreset.Update },
      }),
      prisma,
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.PLACE_PRESET,
        entityId: 'place-1',
        operation: AuditLogOperation.DELETE,
        scope: { permission: Permission.PlacePreset.Delete },
      }),
      prisma,
    );
  });

  it('rejects updates and deletes when the place is missing or deleted', async () => {
    const prisma = createPrismaMock();
    prisma.placePreset.findFirst.mockResolvedValue(null);
    const resolver = new PlacePresetsResolver(prisma as never);

    await expect(resolver.updatePlacePreset('missing-place', { name: 'Missing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(resolver.deletePlacePreset('missing-place')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('merges presets without touching event location data', async () => {
    const prisma = createPrismaMock();
    const auditLog = createAuditLogMock();
    const resolver = new PlacePresetsResolver(prisma as never, auditLog as never);

    await resolver.mergePlacePreset('target-place', 'source-place', {
      name: 'Sala final',
      latitude: -22.1,
      longitude: -49.2,
      locationDescription: 'Bloco A',
    });

    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    expect(prisma.placePreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-place', deletedAt: null },
        data: {
          name: 'Sala final',
          latitude: -22.1,
          longitude: -49.2,
          locationDescription: 'Bloco A',
        },
      }),
    );
    expect(prisma.placePreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'source-place', deletedAt: null },
        data: {
          deletedAt: expect.any(Date),
        },
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.PLACE_PRESET,
        entityId: 'target-place',
        operation: AuditLogOperation.MERGE,
        scope: { permission: Permission.PlacePreset.Merge },
      }),
      prisma,
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: AuditLogEntityType.PLACE_PRESET,
        entityId: 'source-place',
        operation: AuditLogOperation.MERGE,
        scope: { permission: Permission.PlacePreset.Merge },
      }),
      prisma,
    );
  });

  it('rejects merging a preset into itself', async () => {
    const resolver = new PlacePresetsResolver(createPrismaMock() as never);

    await expect(resolver.mergePlacePreset('same-place', 'same-place', { name: 'Same' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects merges when either preset is missing', async () => {
    const prisma = createPrismaMock();
    const resolver = new PlacePresetsResolver(prisma as never);

    prisma.placePreset.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'source-place' });
    await expect(resolver.mergePlacePreset('missing-target', 'source-place', { name: 'Name' })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    prisma.placePreset.findFirst.mockResolvedValueOnce({ id: 'target-place' }).mockResolvedValueOnce(null);
    await expect(resolver.mergePlacePreset('target-place', 'missing-source', { name: 'Name' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

function createPrismaMock() {
  const prisma = {
    event: {
      updateMany: jest.fn(),
    },
    placePreset: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 'place-1' }),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'place-1',
          name: data.name,
          locationDescription: data.locationDescription,
        }),
      ),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'place-1',
          name: data.name ?? 'Sala 2',
          locationDescription: data.locationDescription ?? 'Bloco B',
        }),
      ),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'target-place', name: 'Sala final' }),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => callback(prisma)),
  };

  return prisma;
}

function createAuditLogMock() {
  return {
    record: jest.fn(),
  };
}

function createTypesenseMock(overrides: Partial<{
  isEnabled: jest.Mock;
  searchPlacePresets: jest.Mock;
  upsertPlacePreset: jest.Mock;
  deletePlacePreset: jest.Mock;
}> = {}) {
  return {
    isEnabled: jest.fn().mockReturnValue(true),
    searchPlacePresets: jest.fn().mockResolvedValue({ available: false, ids: [] }),
    upsertPlacePreset: jest.fn(),
    deletePlacePreset: jest.fn(),
    ...overrides,
  };
}
