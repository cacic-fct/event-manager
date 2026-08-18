import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogOperation, SportsScoreEntrySource } from '@prisma/client';
import { sportsAdminScoreEntryRecord } from '../testing/sports-backend.fixtures';
import { SportsScoreEntryAdminService } from './sports-score-entry-admin.service';

describe('SportsScoreEntryAdminService', () => {
  const actor = { sub: 'actor-1' };
  const frozen = { assertMajorEventMutable: jest.fn() };
  const auditLog = { record: jest.fn() };
  let tx: ReturnType<typeof transaction>;
  let prisma: ReturnType<typeof prismaClient>;
  let service: SportsScoreEntryAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = transaction();
    prisma = prismaClient(tx);
    service = new SportsScoreEntryAdminService(prisma as never, frozen as never, auditLog as never, {} as never);
  });

  it.each([
    [SportsScoreEntrySource.MANUAL, 'category-1'],
    [SportsScoreEntrySource.PENALTY, undefined],
  ])('creates a %s adjustment with category %s', async (source, categoryId) => {
    const entry = sportsAdminScoreEntryRecord({ source, categoryId: categoryId ?? null, points: -2 });
    tx.sportsTournamentScoreEntry.create.mockResolvedValue(entry);

    await expect(
      service.createTournamentScoreEntry(
        {
          tournamentId: 'tournament-1',
          categoryId,
          teamId: 'team-1',
          source,
          points: -2,
          reason: '  Ajuste disciplinar  ',
        },
        actor as never,
      ),
    ).resolves.toEqual(entry);

    expect(tx.sportsTournamentScoreEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ categoryId: categoryId ?? null, reason: 'Ajuste disciplinar' }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.CREATE, after: expect.objectContaining({ points: -2 }) }),
      tx,
    );
  });

  it('rejects creation for a missing tournament', async () => {
    prisma.sportsTournament.findFirst.mockResolvedValue(null);

    await expect(
      service.createTournamentScoreEntry(
        {
          tournamentId: 'missing',
          teamId: 'team-1',
          source: SportsScoreEntrySource.MANUAL,
          points: 1,
          reason: 'Ajuste',
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    [{ source: SportsScoreEntrySource.MATCH, points: 1 }, 'source'],
    [{ source: SportsScoreEntrySource.MANUAL, points: 1, sourceMatchId: 'match-1' }, 'source match'],
    [{ source: SportsScoreEntrySource.MANUAL, points: 1.5 }, 'fractional points'],
  ])('rejects invalid manual adjustment input: %s (%s)', async (invalid) => {
    await expect(
      service.createTournamentScoreEntry(
        {
          tournamentId: 'tournament-1',
          teamId: 'team-1',
          reason: 'Ajuste',
          ...invalid,
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [null, { id: 'category-1' }, 'team'],
    [{ id: 'team-1' }, null, 'category'],
  ])('rejects an invalid score target (%s)', async (team, category) => {
    tx.sportsTeam.findFirst.mockResolvedValue(team);
    tx.sportsCategory.findFirst.mockResolvedValue(category);

    await expect(
      service.createTournamentScoreEntry(
        {
          tournamentId: 'tournament-1',
          categoryId: 'category-1',
          teamId: 'team-1',
          source: SportsScoreEntrySource.MANUAL,
          points: 1,
          reason: 'Ajuste',
        },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates every mutable field and audits before and after snapshots', async () => {
    const existing = sportsAdminScoreEntryRecord();
    const result = sportsAdminScoreEntryRecord({
      categoryId: null,
      teamId: 'team-2',
      source: SportsScoreEntrySource.PENALTY,
      points: -4,
      reason: 'Penalidade confirmada',
      revision: 3,
    });
    prisma.sportsTournamentScoreEntry.findFirst.mockResolvedValue(existing);
    tx.sportsTournamentScoreEntry.findUniqueOrThrow.mockResolvedValue(result);

    await expect(
      service.updateTournamentScoreEntry(
        'score-entry-1',
        {
          tournamentId: 'tournament-1',
          expectedRevision: 2,
          categoryId: null,
          teamId: 'team-2',
          source: SportsScoreEntrySource.PENALTY,
          points: -4,
          reason: ' Penalidade confirmada ',
        },
        actor as never,
      ),
    ).resolves.toEqual(result);

    expect(tx.sportsTournamentScoreEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: null,
          teamId: 'team-2',
          source: SportsScoreEntrySource.PENALTY,
          points: -4,
          reason: 'Penalidade confirmada',
        }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.UPDATE,
        before: expect.objectContaining({ points: 3 }),
        after: expect.objectContaining({ points: -4 }),
      }),
      tx,
    );
  });

  it('updates revision only while retaining existing target and score values', async () => {
    const existing = sportsAdminScoreEntryRecord();
    prisma.sportsTournamentScoreEntry.findFirst.mockResolvedValue(existing);
    tx.sportsTournamentScoreEntry.findUniqueOrThrow.mockResolvedValue(sportsAdminScoreEntryRecord({ revision: 3 }));

    await service.updateTournamentScoreEntry(
      'score-entry-1',
      { tournamentId: 'tournament-1', expectedRevision: 2 },
      actor as never,
    );

    expect(tx.sportsTeam.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: 'team-1' }) }),
    );
    const data = tx.sportsTournamentScoreEntry.updateMany.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('categoryId');
    expect(data).not.toHaveProperty('teamId');
    expect(data).not.toHaveProperty('source');
    expect(data).not.toHaveProperty('points');
    expect(data).not.toHaveProperty('reason');
  });

  it('rejects a missing entry, tournament mismatch, and concurrent update', async () => {
    prisma.sportsTournamentScoreEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sportsAdminScoreEntryRecord())
      .mockResolvedValueOnce(sportsAdminScoreEntryRecord());

    await expect(
      service.updateTournamentScoreEntry(
        'missing',
        { tournamentId: 'tournament-1', expectedRevision: 1 },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateTournamentScoreEntry(
        'score-entry-1',
        { tournamentId: 'other', expectedRevision: 2 },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    tx.sportsTournamentScoreEntry.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateTournamentScoreEntry(
        'score-entry-1',
        { tournamentId: 'tournament-1', expectedRevision: 1 },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('soft-deletes an adjustment with an audited snapshot', async () => {
    const existing = sportsAdminScoreEntryRecord();
    prisma.sportsTournamentScoreEntry.findFirst.mockResolvedValue(existing);

    await expect(
      service.deleteTournamentScoreEntry('score-entry-1', 'tournament-1', 2, actor as never),
    ).resolves.toBeUndefined();

    expect(tx.sportsTournamentScoreEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date), deletedById: 'actor-1' }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.DELETE,
        force: true,
        after: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
      tx,
    );
  });

  it('rejects missing, mismatched, or concurrently changed deletion', async () => {
    prisma.sportsTournamentScoreEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sportsAdminScoreEntryRecord())
      .mockResolvedValueOnce(sportsAdminScoreEntryRecord());

    await expect(
      service.deleteTournamentScoreEntry('missing', 'tournament-1', 1, actor as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.deleteTournamentScoreEntry('score-entry-1', 'other', 2, actor as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    tx.sportsTournamentScoreEntry.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.deleteTournamentScoreEntry('score-entry-1', 'tournament-1', 1, actor as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

function prismaClient(tx: ReturnType<typeof transaction>) {
  return {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    sportsTournament: { findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-event-1' }) },
    sportsTournamentScoreEntry: { findFirst: jest.fn() },
  };
}

function transaction() {
  return {
    sportsTeam: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
    sportsCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }) },
    sportsTournamentScoreEntry: {
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
  };
}
