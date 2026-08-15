import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogOperation,
  SportsCategoryStatus,
  SportsFormat,
  SportsPreset,
  SportsRegistrationStatus,
} from '@prisma/client';
import { sportsAdminCategoryRecord, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsCategoryAdminService } from './sports-category-admin.service';

describe('SportsCategoryAdminService', () => {
  const actor = { sub: 'admin-1', token: 'token', permissionSet: new Set<string>() } as never;
  const frozen = {
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const payments = {};
  let tx: ReturnType<typeof createTransaction>;
  let prisma: ReturnType<typeof createPrisma>;
  let service: SportsCategoryAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = createPrisma(tx);
    service = new SportsCategoryAdminService(prisma as never, frozen as never, auditLog as never, payments as never);
  });

  it('creates a category with a new backing event group and audit scope', async () => {
    const category = sportsAdminCategoryRecord();
    prisma.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.sportsCategory.findFirst.mockResolvedValue(null);
    tx.eventGroup.create.mockResolvedValue(category.eventGroup);
    tx.sportsCategory.create.mockResolvedValue(category);

    await expect(service.createCategory(categoryInput(), actor)).resolves.toEqual(category);

    expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-event-1', actor, 'edit');
    expect(tx.eventGroup.create).toHaveBeenCalledWith({
      data: {
        name: 'Torneio esportivo — Futsal',
        emoji: '⚽',
        shouldIssueCertificate: false,
        createdById: 'admin-1',
        updatedById: 'admin-1',
      },
    });
    expect(tx.sportsCategory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tournamentId: 'tournament-1',
          eventGroupId: 'event-group-1',
          name: 'Futsal',
          createdById: 'admin-1',
        }),
      }),
    );
    expect(tx.sportsRegistration.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          teamId: 'team-1',
          categoryId: category.id,
          status: SportsRegistrationStatus.APPROVED,
          approvedById: 'admin-1',
        }),
      ],
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.CREATE,
        after: expect.objectContaining({ id: 'category-1' }),
      }),
      tx,
    );
  });

  it('attaches and synchronizes an explicitly selected event group', async () => {
    const category = sportsAdminCategoryRecord();
    prisma.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.sportsCategory.findFirst.mockResolvedValue(null);
    tx.eventGroup.findFirst.mockResolvedValue(category.eventGroup);
    tx.sportsCategory.create.mockResolvedValue(category);

    await service.createCategory(categoryInput({ eventGroupId: 'event-group-1', emoji: ' 🥅 ' }), actor);

    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('event-group-1', actor, 'edit');
    expect(tx.eventGroup.update).toHaveBeenCalledWith({
      where: { id: 'event-group-1' },
      data: {
        name: 'Torneio esportivo — Futsal',
        emoji: '🥅',
        shouldIssueCertificate: false,
        updatedById: 'admin-1',
      },
    });
  });

  it('rejects missing tournaments and duplicate category divisions', async () => {
    prisma.sportsTournament.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ majorEventId: 'major-event-1' });

    await expect(service.createCategory(categoryInput(), actor)).rejects.toBeInstanceOf(NotFoundException);
    tx.sportsCategory.findFirst.mockResolvedValue({ id: 'duplicate' });
    await expect(service.createCategory(categoryInput(), actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('accepts omitted optional overall scoring rules before checking tournament scope', async () => {
    prisma.sportsTournament.findFirst.mockResolvedValue(null);

    await expect(
      service.createCategory(categoryInput({ overallScoringRules: undefined }), actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sportsTournament.findFirst).toHaveBeenCalled();
  });

  it('rejects an event group already owned by another category', async () => {
    prisma.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.sportsCategory.findFirst.mockResolvedValue(null);
    tx.eventGroup.findFirst.mockResolvedValue(null);

    await expect(service.createCategory(categoryInput({ eventGroupId: 'event-group-used' }), actor)).rejects.toThrow(
      'O grupo de eventos não existe ou já pertence a outra modalidade.',
    );
  });

  it('rejects invalid overall scoring rules before persistence', async () => {
    await expect(
      service.createCategory(categoryInput({ overallScoringRules: { mode: 'INVALID' } }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sportsTournament.findFirst).not.toHaveBeenCalled();
  });

  it('updates category and backing event-group presentation with optimistic revision', async () => {
    const existing = sportsAdminCategoryRecord();
    const result = sportsAdminCategoryRecord({ name: 'Futsal Universitário', revision: 3 });
    prisma.sportsCategory.findFirst.mockResolvedValue(existing);
    tx.sportsCategory.findFirst.mockResolvedValue(null);
    tx.sportsCategory.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsCategory.findUniqueOrThrow.mockResolvedValue(result);

    await expect(
      service.updateCategory(
        'category-1',
        { expectedRevision: 2, name: ' Futsal Universitário ', emoji: ' 🥅 ', status: SportsCategoryStatus.ACTIVE },
        actor,
      ),
    ).resolves.toEqual(result);

    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('event-group-1', actor, 'edit');
    expect(tx.eventGroup.update).toHaveBeenCalledWith({
      where: { id: 'event-group-1' },
      data: { name: 'Torneio esportivo — Futsal Universitário', emoji: '🥅', updatedById: 'admin-1' },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.UPDATE,
        before: expect.objectContaining({ revision: 2 }),
      }),
      tx,
    );
  });

  it('sets and clears finishedAt from lifecycle status changes', async () => {
    const existing = sportsAdminCategoryRecord();
    prisma.sportsCategory.findFirst.mockResolvedValue(existing);
    tx.sportsCategory.findFirst.mockResolvedValue(null);
    tx.sportsCategory.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsCategory.findUniqueOrThrow.mockResolvedValue(existing);

    await service.updateCategory('category-1', { expectedRevision: 2, status: SportsCategoryStatus.FINISHED }, actor);
    expect(tx.sportsCategory.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ finishedAt: expect.any(Date) }) }),
    );

    await service.updateCategory('category-1', { expectedRevision: 2, status: SportsCategoryStatus.ACTIVE }, actor);
    expect(tx.sportsCategory.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ finishedAt: null }) }),
    );
  });

  it('revalidates roster and overall scoring rules when either configuration changes', async () => {
    const existing = sportsAdminCategoryRecord();
    prisma.sportsCategory.findFirst.mockResolvedValue(existing);
    tx.sportsCategory.findFirst.mockResolvedValue(null);
    tx.sportsCategory.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsCategory.findUniqueOrThrow.mockResolvedValue(existing);

    await service.updateCategory(
      'category-1',
      {
        expectedRevision: 2,
        minimumRosterSize: 6,
        maximumRosterSize: 14,
        overallScoringRules: {},
      },
      actor,
    );

    expect(tx.sportsCategory.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ minimumRosterSize: 6, maximumRosterSize: 14, overallScoringRules: {} }),
      }),
    );
  });

  it('validates a partial registration override against the existing window', async () => {
    const existing = sportsAdminCategoryRecord({
      registrationStartDate: sportsTestDate(-2 * 60 * 60_000),
      registrationEndDate: sportsTestDate(2 * 60 * 60_000),
    });
    prisma.sportsCategory.findFirst.mockResolvedValue(existing);

    await expect(
      service.updateCategory(
        'category-1',
        { expectedRevision: 2, registrationEndDate: sportsTestDate(-3 * 60 * 60_000) },
        actor,
      ),
    ).rejects.toThrow('O fim do inscrições da modalidade precisa ser posterior ao início.');

    expect(tx.sportsCategory.updateMany).not.toHaveBeenCalled();
  });

  it('rejects missing, duplicate, and concurrently changed category updates', async () => {
    prisma.sportsCategory.findFirst.mockResolvedValueOnce(null);
    await expect(
      service.updateCategory('missing', { expectedRevision: 1, name: 'Futsal' }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.sportsCategory.findFirst.mockResolvedValue(sportsAdminCategoryRecord());
    tx.sportsCategory.findFirst.mockResolvedValueOnce({ id: 'duplicate' }).mockResolvedValueOnce(null);
    await expect(
      service.updateCategory('category-1', { expectedRevision: 2, name: 'Duplicada' }, actor),
    ).rejects.toBeInstanceOf(ConflictException);

    tx.sportsCategory.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.updateCategory('category-1', { expectedRevision: 1, rulesText: 'Concorrente' }, actor),
    ).rejects.toThrow('A modalidade mudou. Recarregue e tente novamente.');
  });

  it('soft deletes the category graph and all backing match events', async () => {
    const category = sportsAdminCategoryRecord();
    prisma.sportsCategory.findFirst.mockResolvedValue(category);
    tx.sportsMatch.findMany.mockResolvedValue([
      { id: 'match-1', eventId: 'event-1' },
      { id: 'match-2', eventId: 'event-2' },
    ]);
    tx.sportsCategory.updateMany.mockResolvedValue({ count: 1 });

    await service.deleteCategory('category-1', 2, actor);

    expect(frozen.assertEventGroupMutable).toHaveBeenCalledWith('event-group-1', actor, 'delete');
    expect(tx.event.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['event-1', 'event-2'] }, deletedAt: null },
      data: { deletedAt: expect.any(Date), updatedById: 'admin-1' },
    });
    expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith({
      where: { categoryId: 'category-1', deletedAt: null },
      data: expect.objectContaining({ status: SportsRegistrationStatus.WITHDRAWN, deletedAt: expect.any(Date) }),
    });
    expect(tx.sportsOfficialAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, OR: [{ categoryId: 'category-1' }, { matchId: { in: ['match-1', 'match-2'] } }] },
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.DELETE, force: true }),
      tx,
    );
  });

  it('rejects missing and concurrently changed category deletes without cascade audit', async () => {
    prisma.sportsCategory.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(sportsAdminCategoryRecord());
    await expect(service.deleteCategory('missing', 1, actor)).rejects.toBeInstanceOf(NotFoundException);

    tx.sportsMatch.findMany.mockResolvedValue([]);
    tx.sportsCategory.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteCategory('category-1', 1, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(auditLog.record).not.toHaveBeenCalled();
  });
});

function categoryInput(overrides: Record<string, unknown> = {}) {
  return {
    tournamentId: 'tournament-1',
    name: ' Futsal ',
    emoji: '⚽',
    sport: SportsPreset.FUTSAL,
    format: SportsFormat.SINGLE_ELIMINATION,
    registrationStartDate: sportsTestDate(-7 * 24 * 60 * 60_000),
    registrationEndDate: sportsTestDate(7 * 24 * 60 * 60_000),
    minimumRosterSize: 5,
    maximumRosterSize: 12,
    maximumCaptains: 1,
    maximumCoaches: 2,
    periodsEnabled: true,
    maximumPeriods: 4,
    periodLabel: 'Tempo',
    scoreRules: {},
    overallScoringRules: {},
    rosterRules: {},
    bracketRules: {},
    standingsRules: {},
    ...overrides,
  } as never;
}

function createPrisma(tx: ReturnType<typeof createTransaction>) {
  return {
    $transaction: jest.fn((callback: (transaction: ReturnType<typeof createTransaction>) => Promise<unknown>) =>
      callback(tx),
    ),
    sportsTournament: { findFirst: jest.fn() },
    sportsCategory: { findFirst: jest.fn() },
  };
}

function createTransaction() {
  return {
    eventForm: { findFirst: jest.fn() },
    eventGroup: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    event: { updateMany: jest.fn() },
    sportsCategory: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
    sportsMatch: { findMany: jest.fn(), updateMany: jest.fn() },
    sportsStage: { updateMany: jest.fn() },
    sportsTeam: { findMany: jest.fn().mockResolvedValue([{ id: 'team-1' }]) },
    sportsRegistration: { createMany: jest.fn(), updateMany: jest.fn() },
    sportsOfficialAssignment: { updateMany: jest.fn() },
    sportsTournamentScoreEntry: { updateMany: jest.fn() },
  };
}
