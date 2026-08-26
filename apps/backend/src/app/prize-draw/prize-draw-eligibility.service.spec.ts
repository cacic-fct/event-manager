import { PrizeDrawChanceMode, PrizeDrawTargetType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrizeDrawEligibilityConfig, PrizeDrawEligibilityService } from './prize-draw-eligibility.service';

describe('PrizeDrawEligibilityService', () => {
  it('unifies known people across sources and applies explicit weighted precedence', async () => {
    const prisma = mockPrisma({
      attendances: [{ person: { id: 'person-1', name: 'Ana Alves' } }],
      eventSubscriptions: [
        { person: { id: 'person-1', name: 'Ana Alves' } },
        { person: { id: 'person-2', name: 'Bruno Barros' } },
      ],
      manualEntries: [
        {
          id: 'manual-person',
          name: 'Bruno Barros',
          weight: 5,
          personId: 'person-2',
          person: { id: 'person-2', name: 'Bruno Barros', deletedAt: null, mergedIntoId: null, mergedInto: null },
        },
        { id: 'manual-free', name: 'Convidada externa', weight: 3, personId: null, person: null },
      ],
      overrides: [{ personId: 'person-1', weight: 4, person: { mergedIntoId: null } }],
    });
    const service = new PrizeDrawEligibilityService(prisma);

    await expect(service.resolve(config())).resolves.toEqual([
      {
        identityKey: 'person:person-1',
        personId: 'person-1',
        displayName: 'Ana Alves',
        weight: 4,
        sources: ['ATTENDANCE', 'SUBSCRIPTION'],
      },
      {
        identityKey: 'person:person-2',
        personId: 'person-2',
        displayName: 'Bruno Barros',
        weight: 5,
        sources: ['SUBSCRIPTION', 'MANUAL'],
      },
      {
        identityKey: 'manual:manual-free',
        personId: null,
        displayName: 'Convidada externa',
        weight: 3,
        sources: ['MANUAL'],
      },
    ]);
  });

  it('uses a frozen snapshot as the sole source and supports removed-winner exclusions', async () => {
    const prisma = mockPrisma({
      frozenEntries: [
        {
          id: 'frozen-1',
          drawId: 'draw-1',
          identityKey: 'person:person-1',
          personId: 'person-1',
          displayName: 'Ana Alves',
          weight: 1,
          sources: ['ATTENDANCE'],
          person: { id: 'person-1', name: 'Ana Alves', deletedAt: null, mergedIntoId: null, mergedInto: null },
          createdAt: new Date(),
        },
        {
          id: 'frozen-2',
          drawId: 'draw-1',
          identityKey: 'person:person-2',
          personId: 'person-2',
          displayName: 'Bruno Barros',
          weight: 1,
          sources: ['SUBSCRIPTION'],
          person: { id: 'person-2', name: 'Bruno Barros', deletedAt: null, mergedIntoId: null, mergedInto: null },
          createdAt: new Date(),
        },
      ],
    });
    const service = new PrizeDrawEligibilityService(prisma);
    const entries = await service.resolve(
      { ...config(), frozenAt: new Date(Date.now() - 60_000) },
      { excludeIdentityKeys: new Set(['person:person-1']) },
    );

    expect(entries.map((entry) => entry.identityKey)).toEqual(['person:person-2']);
    expect(prisma.eventAttendance.findMany).not.toHaveBeenCalled();
  });

  it('canonicalizes merged people and excludes LGPD-anonymized rows from a frozen roster', async () => {
    const prisma = mockPrisma({
      frozenEntries: [
        {
          identityKey: 'person:source-person',
          personId: 'source-person',
          displayName: 'Nome antigo',
          weight: 2,
          sources: ['ATTENDANCE'],
          person: {
            id: 'source-person',
            name: 'Nome antigo',
            deletedAt: null,
            mergedIntoId: 'target-person',
            mergedInto: {
              id: 'target-person',
              name: 'Nome atual',
              deletedAt: null,
              mergedIntoId: null,
            },
          },
        },
      ],
    });
    const service = new PrizeDrawEligibilityService(prisma);

    await expect(service.resolve({ ...config(), frozenAt: new Date() })).resolves.toEqual([
      {
        identityKey: 'person:target-person',
        personId: 'target-person',
        displayName: 'Nome atual',
        weight: 2,
        sources: ['ATTENDANCE'],
      },
    ]);
    expect(prisma.prizeDrawFrozenEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { drawId: 'draw-1', NOT: { identityKey: { startsWith: 'lgpd:' } } } }),
    );
  });

  it('does not silently convert a deleted person-tied manual entry into a free entry', async () => {
    const prisma = mockPrisma({
      manualEntries: [
        {
          id: 'manual-person',
          name: 'Nome antigo',
          weight: 1,
          personId: 'deleted-person',
          person: {
            id: 'deleted-person',
            name: 'Nome antigo',
            deletedAt: new Date(),
            mergedIntoId: null,
            mergedInto: null,
          },
        },
      ],
    });
    const service = new PrizeDrawEligibilityService(prisma);

    await expect(service.resolve({ ...config(), includePresent: false, includeSubscribers: false })).resolves.toEqual(
      [],
    );
  });

  it('excludes a registered person after combining attendance and subscription sources', async () => {
    const prisma = mockPrisma({
      attendances: [
        { person: { id: 'person-1', name: 'Ana Alves' } },
        { person: { id: 'person-2', name: 'Bruno Barros' } },
      ],
      excludedPeople: [{ personId: 'person-1', person: { mergedIntoId: null } }],
    });
    const service = new PrizeDrawEligibilityService(prisma);

    const entries = await service.resolve({
      ...config(),
      includeSubscribers: false,
      includeManualEntries: false,
      chanceMode: PrizeDrawChanceMode.EQUAL,
    });

    expect(entries.map((entry) => entry.personId)).toEqual(['person-2']);
  });
});

function config(): PrizeDrawEligibilityConfig {
  return {
    id: 'draw-1',
    targetType: PrizeDrawTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    includePresent: true,
    includeSubscribers: true,
    includeManualEntries: true,
    chanceMode: PrizeDrawChanceMode.WEIGHTED,
    frozenAt: null,
  };
}

function mockPrisma(
  input: {
    attendances?: unknown[];
    eventSubscriptions?: unknown[];
    majorSubscriptions?: unknown[];
    manualEntries?: unknown[];
    overrides?: unknown[];
    frozenEntries?: unknown[];
    excludedPeople?: unknown[];
  } = {},
) {
  return {
    eventAttendance: { findMany: jest.fn().mockResolvedValue(input.attendances ?? []) },
    eventSubscription: { findMany: jest.fn().mockResolvedValue(input.eventSubscriptions ?? []) },
    event: { findUnique: jest.fn().mockResolvedValue({ majorEventId: null, autoSubscribe: false, eventGroup: null }) },
    majorEventSubscription: { findMany: jest.fn().mockResolvedValue(input.majorSubscriptions ?? []) },
    prizeDrawManualEntry: { findMany: jest.fn().mockResolvedValue(input.manualEntries ?? []) },
    prizeDrawWeightOverride: { findMany: jest.fn().mockResolvedValue(input.overrides ?? []) },
    prizeDrawExcludedPerson: { findMany: jest.fn().mockResolvedValue(input.excludedPeople ?? []) },
    prizeDrawFrozenEntry: { findMany: jest.fn().mockResolvedValue(input.frozenEntries ?? []) },
  } as unknown as PrismaService & {
    eventAttendance: { findMany: jest.Mock };
  };
}
