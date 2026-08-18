import { PublicationState, SportsFormat, SportsMatchState } from '@prisma/client';

jest.mock('../../audit-log/audit-log.service', () => ({
  AuditLogService: class AuditLogService {},
}));

import { SportsBracketService } from './sports-bracket.service';

describe('SportsBracketService generation lifecycle', () => {
  const advancement = { advanceBye: jest.fn() };
  const auditLog = { record: jest.fn() };
  const realtime = { publishStructuralInvalidations: jest.fn() };
  const frozen = { assertEventGroupMutable: jest.fn() };
  const eventEffects = { syncEvents: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    realtime.publishStructuralInvalidations.mockResolvedValue(undefined);
    eventEffects.syncEvents.mockResolvedValue(undefined);
  });

  it('returns the existing bracket for an identical durable generation key', async () => {
    const input = {
      categoryId: 'category-1',
      participants: [
        { registrationId: 'registration-1', seed: 1 },
        { registrationId: 'registration-2', seed: 2 },
      ],
      randomizeUnseeded: false,
    };
    const category = categoryRecord();
    const tx = {
      sportsCategory: { findFirst: jest.fn() },
      sportsStage: {
        findMany: jest.fn().mockResolvedValue([{ id: 'stage-existing', matches: [] }]),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new SportsBracketService(
      prisma as never,
      advancement as never,
      auditLog as never,
      realtime as never,
      frozen as never,
      eventEffects as never,
    );
    const generationKey = internals(service).generationKey(category, input);
    tx.sportsCategory.findFirst.mockResolvedValue({
      ...category,
      registrations: [
        { id: 'registration-1', team: { name: 'Equipe 1' } },
        { id: 'registration-2', team: { name: 'Equipe 2' } },
      ],
      stages: [
        {
          id: 'stage-existing',
          settings: { generationKey },
          matches: [],
        },
      ],
    });

    await expect(service.generate(input, { sub: 'admin-1' } as never)).resolves.toEqual([
      { id: 'stage-existing', matches: [] },
    ]);

    expect(tx.sportsStage.create).not.toHaveBeenCalled();
    expect(auditLog.record).not.toHaveBeenCalled();
    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('event-group-1', { sub: 'admin-1' }, 'edit');
    expect(realtime.publishStructuralInvalidations).toHaveBeenCalledWith([
      expect.objectContaining({
        kind: 'BRACKET_GENERATED',
        tournamentId: 'tournament-1',
        categoryId: 'category-1',
        stageIds: ['stage-existing'],
      }),
    ]);
    expect(eventEffects.syncEvents).toHaveBeenCalledWith([]);
  });

  it('returns the committed bracket when post-commit effects fail', async () => {
    const input = {
      categoryId: 'category-1',
      participants: [
        { registrationId: 'registration-1', seed: 1 },
        { registrationId: 'registration-2', seed: 2 },
      ],
      randomizeUnseeded: false,
    };
    const category = categoryRecord();
    const tx = {
      sportsCategory: { findFirst: jest.fn() },
      sportsStage: {
        findMany: jest.fn().mockResolvedValue([{ id: 'stage-existing', matches: [] }]),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new SportsBracketService(
      prisma as never,
      advancement as never,
      auditLog as never,
      realtime as never,
      frozen as never,
      eventEffects as never,
    );
    const generationKey = internals(service).generationKey(category, input);
    tx.sportsCategory.findFirst.mockResolvedValue({
      ...category,
      registrations: [
        { id: 'registration-1', team: { name: 'Equipe 1' } },
        { id: 'registration-2', team: { name: 'Equipe 2' } },
      ],
      stages: [{ id: 'stage-existing', settings: { generationKey }, matches: [] }],
    });
    eventEffects.syncEvents.mockRejectedValueOnce(new Error('search unavailable'));
    realtime.publishStructuralInvalidations.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.generate(input, { sub: 'admin-1' } as never)).resolves.toEqual([
      { id: 'stage-existing', matches: [] },
    ]);
  });

  it('reconciles both soft-deleted and newly created backing Events after bracket replacement commits', async () => {
    const category = {
      ...categoryRecord(),
      registrations: [
        { id: 'registration-1', team: { name: 'Equipe 1' } },
        { id: 'registration-2', team: { name: 'Equipe 2' } },
      ],
      stages: [
        {
          id: 'stage-old',
          settings: { generationKey: 'old-generation' },
          matches: [
            {
              id: 'match-old',
              eventId: 'event-old',
              state: SportsMatchState.SCHEDULED,
              operationSequence: 0,
              event: { publicationState: PublicationState.DRAFT },
            },
          ],
        },
      ],
    };
    const generatedStages = [
      {
        id: 'stage-new',
        matches: [
          {
            id: 'match-new',
            eventId: 'event-new',
            event: {
              id: 'event-new',
              deletedAt: null,
              isPubliclyListed: false,
              publicationState: PublicationState.DRAFT,
            },
          },
        ],
      },
    ];
    const tx = {
      sportsCategory: { findFirst: jest.fn().mockResolvedValue(category) },
      sportsMatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      event: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      sportsStage: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'stage-new', settings: {} }]),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new SportsBracketService(
      prisma as never,
      advancement as never,
      auditLog as never,
      realtime as never,
      frozen as never,
      eventEffects as never,
    );
    const persistence = service as unknown as {
      persistSingleElimination: jest.Mock;
      loadGeneratedStages: jest.Mock;
    };
    persistence.persistSingleElimination = jest.fn().mockResolvedValue('stage-new');
    persistence.loadGeneratedStages = jest.fn().mockResolvedValue(generatedStages);

    await service.generate(
      {
        categoryId: category.id,
        participants: [
          { registrationId: ' registration-1 ', seed: 1 },
          { registrationId: 'registration-2', seed: 2 },
        ],
        replaceExistingDraft: true,
      },
      { sub: 'admin-1' } as never,
    );

    expect(tx.event.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['event-old'] }, deletedAt: null } }),
    );
    expect(persistence.persistSingleElimination).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        participants: [
          { registrationId: 'registration-1', seed: 1 },
          { registrationId: 'registration-2', seed: 2 },
        ],
      }),
      expect.anything(),
      'admin-1',
    );
    expect(eventEffects.syncEvents).toHaveBeenCalledWith(['event-old', 'event-new']);
  });

  it('keeps generation keys stable across JSON key order but sensitive to entrant order', () => {
    const service = new SportsBracketService(
      {} as never,
      advancement as never,
      auditLog as never,
      realtime as never,
      frozen as never,
      eventEffects as never,
    );
    const firstCategory = categoryRecord({
      bracketRules: { groupCount: 2, qualifiersPerGroup: 1 },
    });
    const reorderedCategory = categoryRecord({
      bracketRules: { qualifiersPerGroup: 1, groupCount: 2 },
    });
    const participants = [{ registrationId: 'registration-1' }, { registrationId: 'registration-2' }];

    expect(internals(service).generationKey(firstCategory, { participants })).toBe(
      internals(service).generationKey(reorderedCategory, { participants }),
    );
    expect(internals(service).generationKey(firstCategory, { participants })).not.toBe(
      internals(service).generationKey(firstCategory, {
        participants: [...participants].reverse(),
      }),
    );
  });

  it('allows explicit replacement of untouched draft brackets containing automatic byes', async () => {
    const service = new SportsBracketService(
      {} as never,
      advancement as never,
      auditLog as never,
      realtime as never,
      frozen as never,
      eventEffects as never,
    );
    const tx = deletionTransaction();

    await internals(service).replaceDraftIfRequested(
      tx as never,
      [
        {
          id: 'stage-1',
          matches: [
            {
              id: 'bye-match',
              eventId: 'event-1',
              state: SportsMatchState.FINISHED,
              operationSequence: 0,
              event: { publicationState: PublicationState.DRAFT },
            },
          ],
        },
      ],
      true,
      'admin-1',
    );

    expect(tx.sportsMatch.updateMany).toHaveBeenCalled();
    expect(tx.event.updateMany).toHaveBeenCalled();
    expect(tx.sportsStage.updateMany).toHaveBeenCalled();
  });

  it('refuses to replace a bracket once a match was operated or published', async () => {
    const service = new SportsBracketService(
      {} as never,
      advancement as never,
      auditLog as never,
      realtime as never,
      frozen as never,
      eventEffects as never,
    );
    const base = {
      id: 'match-1',
      eventId: 'event-1',
      state: SportsMatchState.SCHEDULED,
      operationSequence: 0,
      event: { publicationState: PublicationState.DRAFT },
    };

    await expect(
      internals(service).replaceDraftIfRequested(
        deletionTransaction() as never,
        [{ id: 'stage-1', matches: [{ ...base, operationSequence: 1 }] }],
        true,
        'admin-1',
      ),
    ).rejects.toThrow('partidas iniciadas');
    await expect(
      internals(service).replaceDraftIfRequested(
        deletionTransaction() as never,
        [
          {
            id: 'stage-1',
            matches: [
              {
                ...base,
                event: { publicationState: PublicationState.PUBLISHED },
              },
            ],
          },
        ],
        true,
        'admin-1',
      ),
    ).rejects.toThrow('partidas iniciadas');
  });

  function categoryRecord(
    overrides: Partial<{
      bracketRules: object;
      standingsRules: object;
    }> = {},
  ) {
    return {
      id: 'category-1',
      name: 'Modalidade',
      format: SportsFormat.SINGLE_ELIMINATION,
      bracketRules: {},
      standingsRules: {},
      eventGroupId: 'event-group-1',
      eventGroup: { emoji: '🏆' },
      tournament: {
        id: 'tournament-1',
        majorEventId: 'major-event-1',
        majorEvent: {
          startDate: new Date('2026-08-01T10:00:00.000Z'),
          endDate: new Date('2026-08-01T18:00:00.000Z'),
          publicationState: PublicationState.DRAFT,
        },
      },
      ...overrides,
    };
  }

  function deletionTransaction() {
    return {
      sportsMatch: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      event: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      sportsStage: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
  }

  function internals(service: SportsBracketService) {
    return service as unknown as {
      generationKey(
        category: ReturnType<typeof categoryRecord>,
        input: {
          participants: Array<{
            registrationId: string;
            seed?: number | null;
          }>;
          randomizeUnseeded?: boolean;
          randomSeed?: string | null;
        },
      ): string;
      replaceDraftIfRequested(
        tx: unknown,
        stages: Array<{
          id: string;
          matches: Array<{
            id: string;
            eventId: string;
            state: SportsMatchState;
            operationSequence: number;
            event: { publicationState: PublicationState };
          }>;
        }>,
        replace: boolean,
        actorId: string,
      ): Promise<void>;
    };
  }
});
