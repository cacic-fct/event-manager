import { BadRequestException } from '@nestjs/common';
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

  it('normalizes blank fields when creating a preset', async () => {
    const prisma = createPrismaMock();
    const resolver = new PlacePresetsResolver(prisma as never);

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
  });

  it('merges presets without touching event location data', async () => {
    const prisma = createPrismaMock();
    const resolver = new PlacePresetsResolver(prisma as never);

    await resolver.mergePlacePreset('target-place', 'source-place', {
      name: 'Sala final',
      latitude: -22.1,
      longitude: -49.2,
      locationDescription: 'Bloco A',
    });

    expect(prisma.event.updateMany).not.toHaveBeenCalled();
    expect(prisma.placePreset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'target-place' },
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
        where: { id: 'source-place' },
        data: {
          deletedAt: expect.any(Date),
        },
      }),
    );
  });

  it('rejects merging a preset into itself', async () => {
    const resolver = new PlacePresetsResolver(createPrismaMock() as never);

    await expect(resolver.mergePlacePreset('same-place', 'same-place', { name: 'Same' })).rejects.toBeInstanceOf(
      BadRequestException,
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
      create: jest.fn().mockResolvedValue({ id: 'place-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'place-1' }),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<void>) => callback(prisma)),
  };

  return prisma;
}
