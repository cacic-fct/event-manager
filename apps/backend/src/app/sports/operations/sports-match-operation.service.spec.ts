import { ConflictException } from '@nestjs/common';
import { SportsMatchActionType, SportsMatchState, SportsReviewStatus } from '@prisma/client';
import {
  SPORTS_TEST_NOW,
  sportsMatchCommand,
  sportsMatchRecord,
  sportsOfficialActor,
} from '../testing/sports-backend.fixtures';
import { SportsMatchOperationService } from './sports-match-operation.service';

describe('SportsMatchOperationService offline command log', () => {
  const standings = {
    refreshAfterApprovedOutcome: jest.fn(),
    reconcileAfterProjectionChange: jest.fn().mockResolvedValue([]),
  };
  const advancement = {
    advanceApprovedOutcome: jest.fn(),
    reconcileAfterProjectionChange: jest.fn().mockResolvedValue([]),
  };
  const realtime = {
    scope: jest.fn((channel: string, id: string) => `${channel}:${id}`),
    publish: jest.fn().mockResolvedValue(undefined),
    publishStructuralInvalidations: jest.fn().mockResolvedValue(undefined),
    publishAutorouteInvalidations: jest.fn().mockResolvedValue(undefined),
  };
  const mutationEvents = {
    publishMatchProjection: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const eventEffects = {
    syncEvent: jest.fn().mockResolvedValue(undefined),
  };

  let tx: ReturnType<typeof createTransaction>;
  let prisma: {
    $transaction: jest.Mock;
  };
  let service: SportsMatchOperationService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(SPORTS_TEST_NOW);
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    service = new SportsMatchOperationService(
      prisma as never,
      advancement as never,
      standings as never,
      realtime as never,
      mutationEvents as never,
      auditLog as never,
      frozen as never,
      eventEffects as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('deduplicates a retried offline action even when JSON key order differs', async () => {
    const first = sportsMatchCommand({
      payload: { side: 'HOME', metadata: { device: 'court-1', sequence: 1 } },
    });
    const retried = sportsMatchCommand({
      payload: { metadata: { sequence: 1, device: 'court-1' }, side: 'HOME' },
    });

    const firstResult = await service.commit([first], sportsOfficialActor());
    const secondResult = await service.commit([retried], sportsOfficialActor());

    expect(secondResult).toEqual(firstResult);
    expect(tx.sportsMatchAction.create).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatch.updateMany).toHaveBeenCalledTimes(1);
    expect(auditLog.record).toHaveBeenCalledTimes(1);
    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', undefined, 'edit');
  });

  it('rejects reuse of an offline client identifier for different command content', async () => {
    await service.commit([sportsMatchCommand({ payload: { source: 'device-a' } })], sportsOfficialActor());

    await expect(
      service.commit([sportsMatchCommand({ payload: { source: 'device-b' } })], sportsOfficialActor()),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsMatchAction.create).toHaveBeenCalledTimes(1);
  });

  it('rebases a commutative score delta from an older positive revision', async () => {
    tx.state.revision = 4;
    tx.state.operationSequence = 3;
    tx.state.state = SportsMatchState.LIVE;
    tx.state.canonicalState = SportsMatchState.LIVE;
    tx.actions.push({
      id: 'action-start',
      clientId: 'offline_start_0001',
      matchId: 'match-1',
      payloadHash: 'hash',
      baseRevision: 1,
      sequence: 1,
      type: SportsMatchActionType.START,
      payload: {},
      reviewStatus: SportsReviewStatus.APPROVED,
      scorerRosterEntryId: null,
      actorPersonId: 'official-person-1',
      actorUserId: 'official-user-1',
      actorRole: 'REFEREE',
      authoredAt: new Date('2026-07-29T11:30:00.000Z'),
      offline: true,
      reviewedAt: SPORTS_TEST_NOW,
      reviewedById: 'admin-1',
      reviewMessage: null,
      createdAt: SPORTS_TEST_NOW,
      updatedAt: SPORTS_TEST_NOW,
    });

    await service.commit(
      [
        sportsMatchCommand({
          clientId: 'offline_score_0001',
          baseRevision: 2,
          type: SportsMatchActionType.SCORE_DELTA,
          payload: { side: 'AWAY', amount: 1 },
        }),
      ],
      sportsOfficialActor(),
    );

    expect(tx.sportsMatchAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          baseRevision: 2,
          sequence: 4,
          type: SportsMatchActionType.SCORE_DELTA,
          reviewStatus: SportsReviewStatus.PENDING,
          offline: true,
        }),
      }),
    );
    expect(tx.sportsMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revision: 4,
          operationSequence: 3,
        }),
      }),
    );
  });

  it('rejects stale non-commutative commands with the current revision', async () => {
    tx.state.revision = 4;
    tx.state.operationSequence = 3;

    await expect(
      service.commit(
        [
          sportsMatchCommand({
            clientId: 'offline_pause_0001',
            baseRevision: 2,
            type: SportsMatchActionType.PAUSE,
          }),
        ],
        sportsOfficialActor(),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        expectedRevision: 4,
        receivedRevision: 2,
      }),
    });

    expect(tx.sportsMatchAction.create).not.toHaveBeenCalled();
  });

  it('fails the compare-and-swap when the match changes during persistence', async () => {
    tx.sportsMatch.updateMany.mockImplementationOnce(() => ({ count: 0 }));

    await expect(service.commit([sportsMatchCommand()], sportsOfficialActor())).rejects.toThrow(
      'A partida mudou durante o envio da ação.',
    );

    expect(tx.sportsMatchAction.create).toHaveBeenCalledTimes(1);
    expect(realtime.publish).not.toHaveBeenCalled();
    expect(mutationEvents.publishMatchProjection).not.toHaveBeenCalled();
  });

  it('rejects mixed-match offline batches before opening a transaction', async () => {
    await expect(
      service.commit(
        [
          sportsMatchCommand(),
          sportsMatchCommand({
            clientId: 'offline_action_0002',
            matchId: 'match-2',
          }),
        ],
        sportsOfficialActor(),
      ),
    ).rejects.toThrow('uma única partida');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('delegates provisional post-commit effects to the shared mutation coordinator', async () => {
    await service.commit([sportsMatchCommand()], sportsOfficialActor());

    expect(mutationEvents.publishMatchProjection).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'match-1',
        state: SportsMatchState.LIVE,
        canonicalState: SportsMatchState.SCHEDULED,
        reviewStatus: SportsReviewStatus.PENDING,
        revision: 2,
      }),
    );
    expect(eventEffects.syncEvent).not.toHaveBeenCalled();
  });

  it('returns the committed actions when post-commit effects fail', async () => {
    mutationEvents.publishMatchProjection.mockRejectedValueOnce(new Error('broker unavailable'));
    realtime.publishStructuralInvalidations.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(service.commit([sportsMatchCommand()], sportsOfficialActor())).resolves.toHaveLength(1);

    expect(tx.sportsMatchAction.create).toHaveBeenCalledTimes(1);
    expect(tx.sportsMatch.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reconciles the backing Event after an administrator commits a reschedule', async () => {
    await service.commit(
      [
        sportsMatchCommand({
          type: SportsMatchActionType.RESCHEDULE,
          payload: {
            startDate: '2026-07-30T14:00:00.000Z',
            endDate: '2026-07-30T15:00:00.000Z',
          },
        }),
      ],
      sportsOfficialActor({ kind: 'ADMIN', role: 'ADMIN', userId: 'admin-1' }),
    );

    expect(tx.event.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        startDate: new Date('2026-07-30T14:00:00.000Z'),
        endDate: new Date('2026-07-30T15:00:00.000Z'),
        updatedById: 'admin-1',
      },
    });
    expect(eventEffects.syncEvent).toHaveBeenCalledWith('event-1');
  });

  it('approves a pending start against the canonical projection without self-invalidating', async () => {
    const pendingStart = {
      id: 'action-pending-start',
      clientId: 'offline_pending_start',
      matchId: 'match-1',
      payloadHash: 'hash',
      baseRevision: 1,
      sequence: 1,
      type: SportsMatchActionType.START,
      payload: {},
      reviewStatus: SportsReviewStatus.PENDING,
      scorerRosterEntryId: null,
      actorPersonId: 'official-person-1',
      actorUserId: 'official-user-1',
      actorRole: 'REFEREE',
      authoredAt: new Date('2026-07-29T11:55:00.000Z'),
      offline: true,
      reviewedAt: null,
      reviewedById: null,
      reviewMessage: null,
      createdAt: SPORTS_TEST_NOW,
      updatedAt: SPORTS_TEST_NOW,
      match: {
        ...tx.state,
        category: tx.state.category,
      },
    };
    tx.actions.push(pendingStart);
    tx.actionById.set(pendingStart.id, pendingStart);
    tx.state.revision = 2;
    tx.state.operationSequence = 1;
    tx.state.state = SportsMatchState.LIVE;
    tx.state.canonicalState = SportsMatchState.SCHEDULED;
    tx.state.reviewStatus = SportsReviewStatus.PENDING;

    await expect(
      service.review(pendingStart.id, SportsReviewStatus.APPROVED, {
        sub: 'admin-1',
        token: 'token',
        permissionSet: new Set<string>(),
      } as never),
    ).resolves.toMatchObject({
      id: pendingStart.id,
      reviewStatus: SportsReviewStatus.APPROVED,
    });

    expect(tx.sportsMatchAction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: pendingStart.id },
        data: expect.objectContaining({
          reviewStatus: SportsReviewStatus.APPROVED,
          reviewedById: 'admin-1',
        }),
      }),
    );
    expect(tx.sportsMatch.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          state: SportsMatchState.LIVE,
          canonicalState: SportsMatchState.LIVE,
          reviewStatus: SportsReviewStatus.APPROVED,
        }),
      }),
    );
  });
});

function createTransaction() {
  const state = sportsMatchRecord() as {
    id: string;
    eventId: string;
    categoryId: string;
    revision: number;
    operationSequence: number;
    state: SportsMatchState;
    canonicalState: SportsMatchState;
    reviewStatus: SportsReviewStatus;
    homeRegistrationId: string;
    awayRegistrationId: string;
    scoreboard: object;
    category: {
      eventGroupId: string;
      maximumPeriods: number;
      periodLabel: string;
      tournament: {
        id: string;
        majorEventId: string;
      };
    };
    rosters: [];
  };
  const actions: Array<Record<string, unknown>> = [];
  const actionByClientId = new Map<string, Record<string, unknown>>();
  const actionById = new Map<string, Record<string, unknown>>();
  let actionId = 0;

  const sportsMatchAction = {
    findUnique: jest.fn(
      ({ where }: { where: { clientId?: string; id?: string } }) =>
        (where.clientId ? actionByClientId.get(where.clientId) : where.id ? actionById.get(where.id) : null) ?? null,
    ),
    create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      const action = {
        id: `action-${++actionId}`,
        ...data,
        createdAt: SPORTS_TEST_NOW,
        updatedAt: SPORTS_TEST_NOW,
      };
      actions.push(action);
      actionByClientId.set(data['clientId'] as string, action);
      actionById.set(action.id, action);
      return action;
    }),
    update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const action = actionById.get(where.id);
      if (!action) {
        throw new Error(`Unknown action ${where.id}`);
      }
      Object.assign(action, data);
      return action;
    }),
  };
  const sportsMatch = {
    findFirst: jest.fn(() => ({
      ...state,
      actions: undefined,
      rosters: undefined,
    })),
    findUniqueOrThrow: jest.fn(() => ({
      ...state,
      actions,
      rosters: state.rosters,
    })),
    updateMany: jest.fn(({ where }: { where: { revision: number; operationSequence: number } }) => {
      if (where.revision !== state.revision || where.operationSequence !== state.operationSequence) {
        return { count: 0 };
      }
      state.revision += 1;
      state.operationSequence += 1;
      return { count: 1 };
    }),
    update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
      Object.assign(state, data);
      return {
        ...state,
        actions: undefined,
        rosters: undefined,
      };
    }),
  };

  return {
    state,
    actions,
    actionById,
    sportsMatchAction,
    sportsMatch,
    sportsMatchRosterEntry: {
      findFirst: jest.fn(),
    },
    event: {
      update: jest.fn(),
    },
  };
}
