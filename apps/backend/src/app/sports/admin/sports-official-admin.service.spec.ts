import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogOperation, SportsOfficialRole } from '@prisma/client';
import { sportsAdminOfficialAssignmentRecord, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsOfficialAdminService } from './sports-official-admin.service';

describe('SportsOfficialAdminService', () => {
  const actor = {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventGroupMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  };
  const payments = {};
  let tx: ReturnType<typeof createTransaction>;
  let prisma: ReturnType<typeof createPrisma>;
  let service: SportsOfficialAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = createPrisma(tx);
    service = new SportsOfficialAdminService(prisma as never, frozen as never, auditLog as never, payments as never);
  });

  it('creates and audits a tournament-scoped official after major-event authorization', async () => {
    const assignment = assignmentFixture({ categoryId: null, category: null });
    tx.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.people.findFirst.mockResolvedValue({ id: 'person-1', name: 'Árbitra Ana', userId: 'user-1' });
    tx.sportsOfficialAssignment.findFirst.mockResolvedValue(null);
    tx.sportsOfficialAssignment.create.mockResolvedValue(assignment);

    await expect(
      service.assignOfficial(
        { tournamentId: 'tournament-1', personId: 'person-1', role: SportsOfficialRole.REFEREE },
        actor,
      ),
    ).resolves.toEqual(assignment);

    expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-event-1', actor, 'edit');
    expect(tx.sportsOfficialAssignment.create).toHaveBeenCalledWith({
      data: {
        tournamentId: 'tournament-1',
        categoryId: null,
        matchId: null,
        personId: 'person-1',
        role: SportsOfficialRole.REFEREE,
        assignedById: 'admin-1',
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.ASSIGN, entityLabel: 'Árbitra Ana · REFEREE' }),
      tx,
    );
  });

  it('authorizes category and match scopes through their backing resources', async () => {
    const assignment = assignmentFixture({ matchId: 'match-1', match: { eventId: 'event-1' } });
    tx.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.people.findFirst.mockResolvedValue({ id: 'person-1', name: 'Árbitra Ana', userId: 'user-1' });
    tx.sportsCategory.findFirst.mockResolvedValue({ id: 'category-1', eventGroupId: 'event-group-1' });
    tx.sportsMatch.findFirst.mockResolvedValue({
      categoryId: 'category-1',
      eventId: 'event-1',
      category: { eventGroupId: 'event-group-1' },
    });
    tx.sportsOfficialAssignment.findFirst.mockResolvedValue(null);
    tx.sportsOfficialAssignment.create.mockResolvedValue(assignment);

    await service.assignOfficial(
      {
        tournamentId: 'tournament-1',
        categoryId: 'category-1',
        matchId: 'match-1',
        personId: 'person-1',
        role: SportsOfficialRole.REFEREE,
      },
      actor,
    );

    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(frozen.assertEventGroupMutable).not.toHaveBeenCalled();
  });

  it('reactivates an existing equivalent assignment instead of creating a duplicate', async () => {
    const existing = assignmentFixture({ active: false, revokedAt: sportsTestDate(-60_000) });
    const active = assignmentFixture({ revision: 4 });
    tx.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.people.findFirst.mockResolvedValue({ id: 'person-1', name: 'Árbitra Ana', userId: 'user-1' });
    tx.sportsCategory.findFirst.mockResolvedValue({ id: 'category-1', eventGroupId: 'event-group-1' });
    tx.sportsOfficialAssignment.findFirst.mockResolvedValue(existing);
    tx.sportsOfficialAssignment.update.mockResolvedValue(active);

    await expect(
      service.assignOfficial(
        {
          tournamentId: 'tournament-1',
          categoryId: 'category-1',
          personId: 'person-1',
          role: SportsOfficialRole.REFEREE,
        },
        actor,
      ),
    ).resolves.toEqual(active);

    expect(tx.sportsOfficialAssignment.update).toHaveBeenCalledWith({
      where: { id: 'official-1' },
      data: expect.objectContaining({
        active: true,
        assignedAt: expect.any(Date),
        revokedAt: null,
        revokedById: null,
        revision: { increment: 1 },
      }),
    });
    expect(tx.sportsOfficialAssignment.create).not.toHaveBeenCalled();
  });

  it('rejects missing scope records and people without linked accounts', async () => {
    tx.sportsTournament.findFirst.mockResolvedValue(null);
    tx.people.findFirst.mockResolvedValue(null);
    await expect(
      service.assignOfficial({ tournamentId: 'missing', personId: 'missing', role: SportsOfficialRole.REFEREE }, actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.people.findFirst.mockResolvedValue({ id: 'person-1', name: 'Sem conta', userId: null });
    await expect(
      service.assignOfficial(
        { tournamentId: 'tournament-1', personId: 'person-1', role: SportsOfficialRole.REFEREE },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects category and match scopes outside the selected tournament/category', async () => {
    tx.sportsTournament.findFirst.mockResolvedValue({ majorEventId: 'major-event-1' });
    tx.people.findFirst.mockResolvedValue({ id: 'person-1', name: 'Árbitra Ana', userId: 'user-1' });
    tx.sportsCategory.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'category-1',
      eventGroupId: 'event-group-1',
    });

    await expect(
      service.assignOfficial(
        {
          tournamentId: 'tournament-1',
          categoryId: 'category-other',
          personId: 'person-1',
          role: SportsOfficialRole.REFEREE,
        },
        actor,
      ),
    ).rejects.toThrow('A modalidade não pertence ao torneio.');

    tx.sportsMatch.findFirst.mockResolvedValue({
      categoryId: 'category-other',
      eventId: 'event-1',
      category: { eventGroupId: 'event-group-1' },
    });
    await expect(
      service.assignOfficial(
        {
          tournamentId: 'tournament-1',
          categoryId: 'category-1',
          matchId: 'match-other',
          personId: 'person-1',
          role: SportsOfficialRole.REFEREE,
        },
        actor,
      ),
    ).rejects.toThrow('A partida não pertence ao escopo selecionado.');
  });

  it('preserves assignedAt when editing an already-active official', async () => {
    const assignedAt = sportsTestDate(-2);
    const assignment = assignmentFixture({ assignedAt, active: true });
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValue(assignment);
    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsOfficialAssignment.findUniqueOrThrow.mockResolvedValue({
      ...assignment,
      role: SportsOfficialRole.SCOREKEEPER,
      revision: 4,
    });

    await service.updateOfficial('assignment-1', { expectedRevision: 3, role: SportsOfficialRole.SCOREKEEPER }, actor);

    const update = tx.sportsOfficialAssignment.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(update.data).toMatchObject({ active: true, role: SportsOfficialRole.SCOREKEEPER });
    expect(update.data).not.toHaveProperty('assignedAt');
    expect(update.data).not.toHaveProperty('revokedAt');
  });

  it('starts a new assignment interval when reactivating an official', async () => {
    const assignment = assignmentFixture({
      active: false,
      assignedAt: sportsTestDate(-2),
      revokedAt: sportsTestDate(-1),
    });
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValue(assignment);
    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsOfficialAssignment.findUniqueOrThrow.mockResolvedValue({
      ...assignment,
      active: true,
      assignedAt: new Date(),
      revokedAt: null,
      revision: 4,
    });

    await service.updateOfficial('assignment-1', { expectedRevision: 3, active: true }, actor);

    const update = tx.sportsOfficialAssignment.updateMany.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(update.data).toMatchObject({
      active: true,
      revokedAt: null,
      revokedById: null,
      assignedAt: expect.any(Date),
    });
  });

  it('revokes an active assignment through update and audits the inactive state', async () => {
    const assignment = assignmentFixture();
    const revoked = assignmentFixture({ active: false, revokedAt: sportsTestDate(), revision: 4 });
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValue(assignment);
    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsOfficialAssignment.findUniqueOrThrow.mockResolvedValue(revoked);

    await service.updateOfficial('official-1', { expectedRevision: 3, active: false }, actor);

    expect(tx.sportsOfficialAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ active: false, revokedAt: expect.any(Date), revokedById: 'admin-1' }),
      }),
    );
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.UPDATE, summary: 'Responsável removido da partida.' }),
      tx,
    );
  });

  it('rejects missing and concurrently changed assignment updates', async () => {
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(assignmentFixture());
    await expect(service.updateOfficial('missing', { expectedRevision: 1 }, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateOfficial('official-1', { expectedRevision: 2 }, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  it('deletes an active assignment with event-scoped authorization and forced audit', async () => {
    const assignment = assignmentFixture({ matchId: 'match-1', match: { eventId: 'event-1' } });
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValue(assignment);
    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 1 });

    await service.deleteOfficial('official-1', 3, actor);

    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'delete');
    expect(tx.sportsOfficialAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: 'official-1', revision: 3, active: true },
      data: {
        active: false,
        revokedAt: expect.any(Date),
        revokedById: 'admin-1',
        revision: { increment: 1 },
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.DELETE, force: true }),
      tx,
    );
  });

  it('rejects missing and concurrently changed assignment deletes', async () => {
    prisma.sportsOfficialAssignment.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(assignmentFixture());
    await expect(service.deleteOfficial('missing', 1, actor)).rejects.toBeInstanceOf(NotFoundException);

    tx.sportsOfficialAssignment.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.deleteOfficial('official-1', 2, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(auditLog.record).not.toHaveBeenCalled();
  });
});

function createPrisma(tx: ReturnType<typeof createTransaction>) {
  return {
    $transaction: jest.fn((callback: (transaction: ReturnType<typeof createTransaction>) => Promise<unknown>) =>
      callback(tx),
    ),
    sportsOfficialAssignment: {
      findUnique: jest.fn(),
    },
  };
}

function createTransaction() {
  return {
    sportsTournament: { findFirst: jest.fn() },
    people: { findFirst: jest.fn() },
    sportsCategory: { findFirst: jest.fn() },
    sportsMatch: { findFirst: jest.fn() },
    sportsOfficialAssignment: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
}

function assignmentFixture(overrides: Record<string, unknown> = {}) {
  return sportsAdminOfficialAssignmentRecord(overrides);
}
