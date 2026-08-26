import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  PrizeDrawChanceMode,
  PrizeDrawSpeed,
  PrizeDrawTargetType,
  SavePrizeDrawInput,
} from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import { PrizeDrawService } from './prize-draw.service';

describe('PrizeDrawService', () => {
  describe('configuration', () => {
    it('returns no admin draws without accessible targets and scopes collection reads otherwise', async () => {
      const context = createContext();
      await expect(context.service.listAdmin(actor())).resolves.toEqual([]);
      expect(context.prisma.prizeDraw.findMany).not.toHaveBeenCalled();

      context.policy.accessibleEventTargets.mockResolvedValue({
        eventIds: new Set(['event-1']),
        eventGroupIds: new Set(['group-1']),
        majorEventIds: new Set(['major-1']),
      });
      context.prisma.prizeDraw.findMany.mockResolvedValue([drawRecord()]);
      await expect(context.service.listAdmin(actor())).resolves.toEqual([
        expect.objectContaining({ id: 'draw-1', eligibleEntrantCount: 0 }),
      ]);
      expect(context.prisma.prizeDraw.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          OR: expect.arrayContaining([
            { eventId: { in: ['event-1'] } },
            { event: { eventGroupId: { in: ['group-1'] } } },
          ]),
        }),
      }));
      expect(context.eligibility.resolve).not.toHaveBeenCalled();
    });

    it('loads eligible entries after excluding canonical active winners when configured', async () => {
      const context = createContext();
      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord({
        removeWinnerAfterDraw: true,
        spins: [spinRecord({ winnerPerson: { id: 'old-id', mergedIntoId: 'canonical-id' } })],
      }));
      context.eligibility.resolve.mockResolvedValue([eligible('person-2', 'Grace Hopper')]);

      await expect(context.service.eligibleEntries('draw-1')).resolves.toEqual([
        eligible('person-2', 'Grace Hopper'),
      ]);
      expect(context.eligibility.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'draw-1' }),
        { excludeIdentityKeys: new Set(['person:canonical-id']) },
      );
    });

    it.each([
      ['blank title', { title: ' ' }, 'Informe um título'],
      ['two targets', { majorEventId: 'major-1' }, 'Vincule o sorteio'],
      ['no eligibility source', { includePresent: false }, 'Selecione ao menos uma fonte'],
      ['unsupported countdown', { dramaticCountdownSeconds: 4 }, '3 ou 5 segundos'],
      ['planned spins without a limit', { plannedSpins: [plannedSpin()] }, 'exigem uma quantidade'],
      ['missing planned spin', { spinLimit: 2, plannedSpins: [plannedSpin()] }, 'Configure cada giro'],
      ['non-contiguous positions', { spinLimit: 2, plannedSpins: [plannedSpin(1), plannedSpin(3)] }, 'posições dos giros'],
      ['manual entry while disabled', { manualEntries: [manualEntry()] }, 'Ative as entradas manuais'],
      ['weight in equal mode', { weightOverrides: [{ personId: 'person-1', weight: 2 }] }, 'modo ponderado'],
      [
        'duplicate manual person',
        { includeManualEntries: true, manualEntries: [manualEntry('person-1'), manualEntry('person-1')] },
        'pessoa manual não pode aparecer duas vezes',
      ],
      [
        'duplicate weight override',
        {
          chanceMode: PrizeDrawChanceMode.WEIGHTED,
          weightOverrides: [{ personId: 'person-1', weight: 2 }, { personId: 'person-1', weight: 3 }],
        },
        'apenas um peso',
      ],
      ['non-positive weight', { includeManualEntries: true, manualEntries: [{ ...manualEntry(), weight: 0 }] }, 'inteiros positivos'],
    ])('rejects %s before touching persistence', async (_name, patch, message) => {
      const context = createContext();

      await expect(context.service.save(input(patch), actor())).rejects.toThrow(message);

      expect(context.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates a draw and synchronizes planned, manual, weighted, and excluded entries transactionally', async () => {
      const context = createContext();
      const savedInput = input({
        title: '  Brindes finais  ',
        description: '  Encerramento  ',
        includeManualEntries: true,
        chanceMode: PrizeDrawChanceMode.WEIGHTED,
        spinLimit: 1,
        plannedSpins: [plannedSpin()],
        manualEntries: [{ personId: null, name: '  Convidada  ', weight: 3 }],
        weightOverrides: [{ personId: 'person-1', weight: 4 }],
        excludedPersonIds: ['person-2'],
      });
      context.prisma.people.count.mockResolvedValue(2);
      context.tx.people.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
      context.tx.people.findMany.mockResolvedValue([{ id: 'person-3', name: 'Convidada cadastrada' }]);
      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord());

      const result = await context.service.save(savedInput, actor());

      expect(context.policy.assertPermissions).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ sub: 'admin-1' }),
        [Permission.PrizeDraw.Create],
        { eventId: 'event-1' },
      );
      expect(context.policy.assertPermissions).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        [Permission.RelatedPerson.Read],
        { eventId: 'event-1' },
      );
      expect(context.tx.prizeDraw.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Brindes finais',
          description: 'Encerramento',
          createdById: 'admin-1',
          updatedById: 'admin-1',
        }),
      });
      expect(context.tx.prizeDrawPlannedSpin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ drawId: 'draw-1', position: 1, countdownSeconds: null }),
      });
      expect(context.tx.prizeDrawManualEntry.create).toHaveBeenCalledWith({
        data: {
          drawId: 'draw-1',
          personId: 'person-3',
          name: 'Convidada cadastrada',
          weight: 3,
          createdById: 'admin-1',
        },
      });
      expect(context.tx.prizeDrawWeightOverride.upsert).toHaveBeenCalled();
      expect(context.tx.prizeDrawExcludedPerson.upsert).toHaveBeenCalled();
      expect(context.realtime.publishDraw).toHaveBeenCalledWith('draw-1', 'DRAW_UPDATED', 1);
      expect(result.id).toBe('draw-1');
    });

    it('refuses person references outside the selected target scope', async () => {
      const context = createContext();
      context.prisma.people.count.mockResolvedValue(0);

      await expect(
        context.service.save(
          input({ includeManualEntries: true, manualEntries: [manualEntry('outside-person')] }),
          actor(),
        ),
      ).rejects.toThrow('não pertencem ao escopo');

      expect(context.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('protects frozen eligibility and existing-spin target invariants on update', async () => {
      const context = createContext();
      context.prisma.prizeDraw.findFirst.mockResolvedValueOnce(
        drawRecord({ frozenAt: new Date(), includePresent: true }),
      );

      await expect(
        context.service.save(input({ id: 'draw-1', includePresent: false, includeSubscribers: true }), actor()),
      ).rejects.toThrow('Descongele a lista');

      context.prisma.prizeDraw.findFirst.mockReset().mockResolvedValueOnce(
        drawRecord({ spins: [spinRecord()], eventId: 'event-1' }),
      );
      await expect(
        context.service.save(
          input({ id: 'draw-1', targetType: PrizeDrawTargetType.MAJOR_EVENT, eventId: null, majorEventId: 'major-1' }),
          actor(),
        ),
      ).rejects.toThrow('não pode mudar depois do primeiro giro');
    });
  });

  describe('operation lifecycle', () => {
    it('freezes only a non-empty roster and publishes the committed revision', async () => {
      const context = createContext();
      context.tx.prizeDraw.findFirst.mockResolvedValue(drawRecord());
      context.eligibility.resolve.mockResolvedValue([eligible('person-1', 'Ada Lovelace')]);
      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord({ frozenAt: new Date(), revision: 2 }));

      const result = await context.service.freeze('draw-1', actor());

      expect(context.eligibility.freeze).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'draw-1' }),
        expect.any(Date),
        'admin-1',
        context.tx,
      );
      expect(context.realtime.publishDraw).toHaveBeenCalledWith('draw-1', 'ELIGIBILITY_FROZEN', 2);
      expect(result.frozenAt).toBeInstanceOf(Date);
    });

    it('does not freeze an empty or already frozen roster', async () => {
      const context = createContext();
      context.tx.prizeDraw.findFirst.mockResolvedValue(drawRecord());
      context.eligibility.resolve.mockResolvedValue([]);
      await expect(context.service.freeze('draw-1', actor())).rejects.toThrow('Não há participantes');

      context.tx.prizeDraw.findFirst.mockResolvedValue(drawRecord({ frozenAt: new Date() }));
      await expect(context.service.freeze('draw-1', actor())).rejects.toThrow('já está congelada');
    });

    it('unfreezes by deleting the snapshot, records the actor, and rejects dynamic rosters', async () => {
      const context = createContext();
      context.tx.prizeDraw.findFirst.mockResolvedValue(drawRecord({ frozenAt: new Date() }));
      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord({ revision: 3 }));

      await context.service.unfreeze('draw-1', actor());

      expect(context.tx.prizeDrawFrozenEntry.deleteMany).toHaveBeenCalledWith({ where: { drawId: 'draw-1' } });
      expect(context.tx.prizeDraw.update).toHaveBeenCalledWith({
        where: { id: 'draw-1' },
        data: expect.objectContaining({
          frozenAt: null,
          frozenById: null,
          unfrozenAt: expect.any(Date),
          updatedById: 'admin-1',
          revision: { increment: 1 },
        }),
      });
      expect(context.realtime.publishDraw).toHaveBeenCalledWith('draw-1', 'ELIGIBILITY_UNFROZEN', 3);

      context.tx.prizeDraw.findFirst.mockResolvedValue(drawRecord());
      await expect(context.service.unfreeze('draw-1', actor())).rejects.toThrow('não está congelada');
    });

    it('persists a real planned spin, excludes the previous canonical winner, and delays publication until animation ends', async () => {
      const context = createContext();
      const previous = spinRecord({
        id: 'spin-previous',
        sequence: 1,
        winnerEntryKey: 'person:old-id',
        winnerPerson: { id: 'old-id', mergedIntoId: 'canonical-id' },
      });
      context.tx.prizeDraw.findFirst.mockResolvedValue(
        drawRecord({
          spinLimit: 2,
          removeWinnerAfterDraw: true,
          notifyWinner: true,
          plannedSpins: [plannedSpinRecord(1), plannedSpinRecord(2, PrizeDrawSpeed.DRAMATIC)],
          spins: [previous],
        }),
      );
      context.eligibility.resolve.mockResolvedValue([eligible('person-2', 'Grace Hopper', 2)]);
      context.tx.prizeDrawSpin.create.mockResolvedValue(spinRecord({ id: 'spin-2', sequence: 2 }));
      context.tx.prizeDraw.update.mockResolvedValue({ revision: 7 });

      const result = await context.service.spin(
        { drawId: 'draw-1', demo: false, reducedMotion: true },
        actor(),
      );

      expect(context.eligibility.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'draw-1' }),
        expect.objectContaining({
          client: context.tx,
          excludeIdentityKeys: new Set(['person:canonical-id']),
        }),
      );
      expect(context.tx.prizeDrawSpin.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sequence: 2,
          plannedSpinId: 'planned-2',
          winnerPersonId: 'person-2',
          winnerWeight: 2,
          totalWeight: 2,
          notificationTransactionId: 'prize-draw-winner:draw-1:2',
          notificationStatus: 'PENDING',
        }),
      });
      expect(context.notificationJobs.enqueuePresentation).toHaveBeenCalledWith('spin-2', {
        delayMs: expect.any(Number),
      });
      expect(context.realtime.publishDraw).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({
        demo: false,
        spinId: 'spin-2',
        sequence: 2,
        winnerFullName: 'Grace Hopper',
        hasMoreSpins: false,
      }));
    });

    it('keeps demo spins side-effect free and enforces roster and configured limits', async () => {
      const context = createContext();
      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord());
      context.eligibility.resolve.mockResolvedValue([eligible('person-1', 'Ada Lovelace')]);

      await expect(
        context.service.spin({ drawId: 'draw-1', demo: true, reducedMotion: false }, actor()),
      ).resolves.toEqual(expect.objectContaining({ demo: true, spinId: null, winnerFullName: 'Ada Lovelace' }));
      expect(context.prisma.$transaction).not.toHaveBeenCalled();
      expect(context.notificationJobs.enqueuePresentation).not.toHaveBeenCalled();

      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord({ spinLimit: 1, spins: [spinRecord()] }));
      await expect(
        context.service.spin({ drawId: 'draw-1', demo: true, reducedMotion: false }, actor()),
      ).rejects.toThrow('Todos os giros');

      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord());
      context.eligibility.resolve.mockResolvedValue([]);
      await expect(
        context.service.spin({ drawId: 'draw-1', demo: true, reducedMotion: false }, actor()),
      ).rejects.toThrow('Não há participantes elegíveis');
    });

    it('commits undo and publishes it even when notification cleanup fails', async () => {
      const context = createContext();
      context.tx.prizeDrawSpin.findFirst.mockResolvedValue(spinRecord());
      context.tx.prizeDrawSpin.update.mockResolvedValue(spinRecord({ undoneAt: new Date() }));
      context.tx.prizeDraw.update.mockResolvedValue({ revision: 9 });
      context.notificationJobs.undoSpin.mockRejectedValue(new Error('queue unavailable'));
      context.prisma.prizeDraw.findFirst.mockResolvedValue(drawRecord({ revision: 9 }));

      await context.service.undoLast('draw-1', actor());

      expect(context.realtime.publishDraw).toHaveBeenCalledWith('draw-1', 'SPIN_UNDONE', 9, 'spin-1');
    });

    it('returns canonical merged contact details and rejects missing or undone spins', async () => {
      const context = createContext();
      context.prisma.prizeDrawSpin.findUnique.mockResolvedValue({
        id: 'spin-1',
        winnerDisplayName: 'Nome abreviado',
        undoneAt: null,
        winnerPerson: {
          name: 'Antigo',
          email: 'old@example.com',
          phone: null,
          academicId: null,
          mergedInto: {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            phone: '5518999999999',
            academicId: '123',
          },
        },
      });
      await expect(context.service.winnerContact('spin-1')).resolves.toEqual({
        spinId: 'spin-1',
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '5518999999999',
        academicId: '123',
      });

      context.prisma.prizeDrawSpin.findUnique.mockResolvedValue({ id: 'spin-1', undoneAt: new Date() });
      await expect(context.service.winnerContact('spin-1')).rejects.toBeInstanceOf(ConflictException);
      context.prisma.prizeDrawSpin.findUnique.mockResolvedValue(null);
      await expect(context.service.winnerContact('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('public discovery', () => {
    it('deduplicates requested targets and reports released draw counts per scope', async () => {
      const context = createContext();
      context.policy.accessibleEventTargets.mockResolvedValue(null);
      context.prisma.prizeDraw.findMany.mockResolvedValue([
        { eventId: 'event-1', majorEventId: null, event: { eventGroupId: 'group-1' } },
        { eventId: 'event-1', majorEventId: null, event: { eventGroupId: 'group-1' } },
        { eventId: null, majorEventId: 'major-1', event: null },
      ]);

      await expect(
        context.service.publicAvailability(
          { eventIds: ['event-1', 'event-1'], majorEventIds: ['major-1'], eventGroupIds: ['group-1', 'missing'] },
          undefined,
        ),
      ).resolves.toEqual([
        { targetType: 'EVENT', targetId: 'event-1', drawCount: 2 },
        { targetType: 'MAJOR_EVENT', targetId: 'major-1', drawCount: 1 },
        { targetType: 'EVENT_GROUP', targetId: 'group-1', drawCount: 2 },
        { targetType: 'EVENT_GROUP', targetId: 'missing', drawCount: 0 },
      ]);
    });

    it('rejects ambiguous and unavailable public targets before querying draws', async () => {
      const context = createContext();
      await expect(context.service.listPublic({}, undefined)).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        context.service.listPublic({ eventId: 'event-1', majorEventId: 'major-1' }, undefined),
      ).rejects.toBeInstanceOf(BadRequestException);

      context.prisma.event.findFirst.mockResolvedValue(null);
      await expect(context.service.listPublic({ eventId: 'event-1' }, undefined)).rejects.toThrow(
        'Página pública de sorteios não encontrada',
      );
    });
  });
});

function input(patch: Partial<SavePrizeDrawInput> = {}): SavePrizeDrawInput {
  return {
    title: 'Sorteio',
    description: null,
    targetType: PrizeDrawTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    includePresent: true,
    includeSubscribers: false,
    includeManualEntries: false,
    chanceMode: PrizeDrawChanceMode.EQUAL,
    spinLimit: null,
    removeWinnerAfterDraw: false,
    defaultSpeed: PrizeDrawSpeed.QUICK,
    dramaticCountdownSeconds: 3,
    notifyWinner: false,
    plannedSpins: [],
    manualEntries: [],
    weightOverrides: [],
    excludedPersonIds: [],
    ...patch,
  };
}

function plannedSpin(position = 1) {
  return { position, description: null, speed: PrizeDrawSpeed.QUICK, countdownSeconds: null };
}

function plannedSpinRecord(position: number, speed = PrizeDrawSpeed.QUICK) {
  return {
    id: `planned-${position}`,
    position,
    description: `Prêmio ${position}`,
    speed,
    countdownSeconds: speed === PrizeDrawSpeed.DRAMATIC ? 5 : null,
  };
}

function manualEntry(personId: string | null = null) {
  return { personId, name: 'Pessoa manual', weight: 1 };
}

function eligible(personId: string, displayName: string, weight = 1) {
  return { identityKey: `person:${personId}`, personId, displayName, weight, sources: ['ATTENDANCE'] };
}

function spinRecord(patch: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'spin-1',
    drawId: 'draw-1',
    sequence: 1,
    plannedSpinId: null,
    description: null,
    speed: PrizeDrawSpeed.QUICK,
    countdownSeconds: null,
    chanceMode: PrizeDrawChanceMode.EQUAL,
    removeWinnerAfterDraw: false,
    winnerEntryKey: 'person:person-1',
    winnerDisplayName: 'Ada Lovelace',
    winnerPersonId: 'person-1',
    winnerPerson: { id: 'person-1', mergedIntoId: null },
    winnerWeight: 1,
    entrantCount: 1,
    totalWeight: 1,
    duplicateEntryCount: 0,
    eligibilityFrozenAt: null,
    repeatedSpinIndex: 0,
    reelDurationMs: 1000,
    preRevealPauseMs: 100,
    drawnAt: now,
    undoneAt: null,
    presentationAcknowledgedAt: now,
    notificationStatus: 'NOT_REQUESTED',
    ...patch,
  };
}

function drawRecord(patch: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'draw-1',
    title: 'Sorteio',
    description: null,
    targetType: PrizeDrawTargetType.EVENT,
    eventId: 'event-1',
    majorEventId: null,
    event: { id: 'event-1', name: 'Evento' },
    majorEvent: null,
    includePresent: true,
    includeSubscribers: false,
    includeManualEntries: false,
    chanceMode: PrizeDrawChanceMode.EQUAL,
    spinLimit: null,
    removeWinnerAfterDraw: false,
    defaultSpeed: PrizeDrawSpeed.QUICK,
    dramaticCountdownSeconds: 3,
    notifyWinner: false,
    frozenAt: null,
    unfrozenAt: null,
    revision: 1,
    plannedSpins: [],
    manualEntries: [],
    weightOverrides: [],
    excludedPeople: [],
    spins: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

function actor() {
  return { sub: 'admin-1' } as never;
}

function createContext() {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    prizeDraw: {
      create: jest.fn().mockResolvedValue({ id: 'draw-1' }),
      update: jest.fn().mockResolvedValue({ revision: 2 }),
      findFirst: jest.fn(),
    },
    prizeDrawPlannedSpin: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    prizeDrawManualEntry: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    prizeDrawWeightOverride: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    prizeDrawExcludedPerson: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      upsert: jest.fn().mockResolvedValue({}),
    },
    prizeDrawFrozenEntry: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    prizeDrawSpin: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    people: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    event: { findFirst: jest.fn().mockResolvedValue({ id: 'event-1' }) },
    majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-1' }) },
    eventGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }) },
    people: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    prizeDraw: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    prizeDrawSpin: { findUnique: jest.fn() },
    prizeDrawSpinEntry: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  const eligibility = {
    resolve: jest.fn().mockResolvedValue([]),
    freeze: jest.fn().mockResolvedValue(undefined),
  };
  const policy = {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
    accessibleEventTargets: jest.fn().mockResolvedValue({
      eventIds: new Set<string>(),
      eventGroupIds: new Set<string>(),
      majorEventIds: new Set<string>(),
    }),
  };
  const realtime = { publishDraw: jest.fn().mockResolvedValue(undefined) };
  const notificationJobs = {
    enqueuePresentation: jest.fn().mockResolvedValue(undefined),
    undoSpin: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PrizeDrawService(
    prisma as never,
    eligibility as never,
    policy as never,
    realtime as never,
    notificationJobs as never,
  );
  return { eligibility, notificationJobs, policy, prisma, realtime, service, tx };
}
