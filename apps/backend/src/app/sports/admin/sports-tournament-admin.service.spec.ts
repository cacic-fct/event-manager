import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogOperation,
  PublicationState,
  SportsCategoryStatus,
  SportsRegistrationStatus,
  SportsScoringMode,
  SportsTeamMemberStatus,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { sportsAdminTournamentRecord, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsTournamentAdminService } from './sports-tournament-admin.service';

describe('SportsTournamentAdminService', () => {
  const actor = { sub: 'admin-1', token: 'token', permissionSet: new Set<string>() } as never;
  const frozen = { assertMajorEventMutable: jest.fn().mockResolvedValue(undefined) };
  const auditLog = { record: jest.fn().mockResolvedValue(undefined) };
  const payments = {};
  let tx: ReturnType<typeof createTransaction>;
  let prisma: ReturnType<typeof createPrisma>;
  let service: SportsTournamentAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = createPrisma(tx);
    service = new SportsTournamentAdminService(prisma as never, frozen as never, auditLog as never, payments as never);
  });

  describe('attachTournament', () => {
    it('creates and audits sports mode for an existing major event', async () => {
      const tournament = sportsAdminTournamentRecord();
      tx.majorEvent.findFirst.mockResolvedValue(tournament.majorEvent);
      tx.sportsTournament.findUnique.mockResolvedValue(null);
      tx.sportsTournament.create.mockResolvedValue(tournament);

      await expect(
        service.attachTournament(
          {
            majorEventId: 'major-event-1',
            status: SportsTournamentStatus.LIVE,
            selfSubscriptionEnabled: true,
            scoringMode: SportsScoringMode.BOTH,
          },
          actor,
        ),
      ).resolves.toEqual(tournament);

      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-event-1', actor, 'edit');
      expect(tx.sportsTournament.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          majorEventId: 'major-event-1',
          status: SportsTournamentStatus.LIVE,
          selfSubscriptionEnabled: true,
          scoringMode: SportsScoringMode.BOTH,
          createdById: 'admin-1',
        }),
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.CREATE, entityId: 'tournament-1' }),
        tx,
      );
    });

    it('returns an active attachment idempotently without a duplicate audit', async () => {
      const tournament = sportsAdminTournamentRecord();
      tx.majorEvent.findFirst.mockResolvedValue(tournament.majorEvent);
      tx.sportsTournament.findUnique.mockResolvedValue(tournament);

      await expect(service.attachTournament({ majorEventId: 'major-event-1' }, actor)).resolves.toEqual(tournament);
      expect(tx.sportsTournament.create).not.toHaveBeenCalled();
      expect(tx.sportsTournament.update).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('revives a soft-deleted attachment with safe defaults', async () => {
      const deleted = sportsAdminTournamentRecord({ deletedAt: sportsTestDate(-60_000) });
      const revived = sportsAdminTournamentRecord({ revision: 3 });
      tx.majorEvent.findFirst.mockResolvedValue(deleted.majorEvent);
      tx.sportsTournament.findUnique.mockResolvedValue(deleted);
      tx.sportsTournament.update.mockResolvedValue(revived);

      await expect(service.attachTournament({ majorEventId: 'major-event-1' }, actor)).resolves.toEqual(revived);
      expect(tx.sportsTournament.update).toHaveBeenCalledWith({
        where: { id: 'tournament-1' },
        data: {
          deletedAt: null,
          status: SportsTournamentStatus.DRAFT,
          registrationStartDate: null,
          registrationEndDate: null,
          selfSubscriptionEnabled: false,
          selfSubscriptionAllowNoTeam: false,
          selfSubscriptionAllowNoCategory: false,
          allowPlayerMultipleTeams: false,
          scoringMode: SportsScoringMode.PER_SPORT,
          revision: { increment: 1 },
          updatedById: 'admin-1',
        },
      });
    });

    it('rejects a missing major event after authorization', async () => {
      tx.majorEvent.findFirst.mockResolvedValue(null);
      await expect(service.attachTournament({ majorEventId: 'missing' }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('missing', actor, 'edit');
    });
  });

  describe('createTournament', () => {
    it('creates a draft major event and tournament with relative dates', async () => {
      const tournament = sportsAdminTournamentRecord();
      tx.majorEvent.create.mockResolvedValue(tournament.majorEvent);
      tx.sportsTournament.create.mockResolvedValue(tournament);
      const input = tournamentInput();

      await expect(service.createTournament(input, actor)).resolves.toEqual(tournament);

      expect(tx.majorEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Jogos Universitários',
          emoji: '🏆',
          startDate: input.startDate,
          endDate: input.endDate,
          description: 'Competição universitária',
          publicationState: PublicationState.DRAFT,
          createdById: 'admin-1',
        }),
      });
      expect(tx.sportsTournament.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SportsTournamentStatus.DRAFT,
            registrationStartDate: input.registrationStartDate,
            registrationEndDate: input.registrationEndDate,
          }),
        }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.CREATE, entityLabel: 'Jogos Universitários' }),
        tx,
      );
    });

    it('rejects inverted tournament and partial registration date ranges before persistence', async () => {
      const startDate = sportsTestDate(2 * 60_000);
      const endDate = sportsTestDate(60_000);
      await expect(service.createTournament(tournamentInput({ startDate, endDate }), actor)).rejects.toThrow(
        'O fim do torneio precisa ser posterior ao início.',
      );
      await expect(
        service.createTournament(
          tournamentInput({ registrationStartDate: startDate, registrationEndDate: null }),
          actor,
        ),
      ).rejects.toThrow('Informe o início e o fim de inscrições do torneio.');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateTournament', () => {
    it('updates settings, lifecycle timestamp, and audit snapshot', async () => {
      const existing = sportsAdminTournamentRecord();
      const result = sportsAdminTournamentRecord({ status: SportsTournamentStatus.FINISHED, revision: 3 });
      prisma.sportsTournament.findFirst.mockResolvedValue(existing);
      tx.sportsTournament.updateMany.mockResolvedValue({ count: 1 });
      tx.sportsTournament.findUniqueOrThrow.mockResolvedValue(result);

      await expect(
        service.updateTournament(
          'tournament-1',
          {
            expectedRevision: 2,
            status: SportsTournamentStatus.FINISHED,
            registrationStartDate: sportsTestDate(-2 * 60 * 60_000),
            registrationEndDate: sportsTestDate(2 * 60 * 60_000),
            selfSubscriptionEnabled: false,
            scoringMode: SportsScoringMode.PER_SPORT,
          },
          actor,
        ),
      ).resolves.toEqual(result);

      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-event-1', actor, 'edit');
      expect(tx.sportsTournament.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: SportsTournamentStatus.FINISHED,
            registrationStartDate: expect.any(Date),
            registrationEndDate: expect.any(Date),
            finishedAt: expect.any(Date),
            selfSubscriptionEnabled: false,
            revision: { increment: 1 },
          }),
        }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: AuditLogOperation.UPDATE,
          before: expect.objectContaining({ revision: 2 }),
        }),
        tx,
      );
    });

    it('blocks disabling multiple teams while cross-team participants remain', async () => {
      prisma.sportsTournament.findFirst.mockResolvedValue(
        sportsAdminTournamentRecord({ allowPlayerMultipleTeams: true }),
      );
      tx.sportsTournamentParticipant.findMany.mockResolvedValue([
        { teamMemberships: [{ teamId: 'team-1' }, { teamId: 'team-2' }] },
      ]);

      await expect(
        service.updateTournament('tournament-1', { expectedRevision: 2, allowPlayerMultipleTeams: false }, actor),
      ).rejects.toThrow('Não é possível desativar múltiplas equipes');
      expect(tx.sportsTournament.updateMany).not.toHaveBeenCalled();
    });

    it('allows disabling multiple teams when each participant belongs to one unique team', async () => {
      const existing = sportsAdminTournamentRecord({ allowPlayerMultipleTeams: true });
      prisma.sportsTournament.findFirst.mockResolvedValue(existing);
      tx.sportsTournamentParticipant.findMany.mockResolvedValue([
        { teamMemberships: [{ teamId: 'team-1' }, { teamId: 'team-1' }] },
      ]);
      tx.sportsTournament.updateMany.mockResolvedValue({ count: 1 });
      tx.sportsTournament.findUniqueOrThrow.mockResolvedValue({ ...existing, allowPlayerMultipleTeams: false });

      await service.updateTournament('tournament-1', { expectedRevision: 2, allowPlayerMultipleTeams: false }, actor);
      expect(tx.sportsTournament.updateMany).toHaveBeenCalled();
    });

    it('rejects a partial tournament registration override before persistence', async () => {
      prisma.sportsTournament.findFirst.mockResolvedValue(sportsAdminTournamentRecord());

      await expect(
        service.updateTournament(
          'tournament-1',
          { expectedRevision: 2, registrationStartDate: sportsTestDate(-60_000) },
          actor,
        ),
      ).rejects.toThrow('Informe o início e o fim de inscrições do torneio.');

      expect(tx.sportsTournament.updateMany).not.toHaveBeenCalled();
    });

    it('validates a partial registration override against the existing window', async () => {
      const existing = sportsAdminTournamentRecord({
        registrationStartDate: sportsTestDate(-2 * 60 * 60_000),
        registrationEndDate: sportsTestDate(2 * 60 * 60_000),
      });
      prisma.sportsTournament.findFirst.mockResolvedValue(existing);

      await expect(
        service.updateTournament(
          'tournament-1',
          { expectedRevision: 2, registrationStartDate: sportsTestDate(3 * 60 * 60_000) },
          actor,
        ),
      ).rejects.toThrow('O fim do inscrições do torneio precisa ser posterior ao início.');

      expect(tx.sportsTournament.updateMany).not.toHaveBeenCalled();
    });

    it('rejects missing and concurrently changed tournaments without audit', async () => {
      prisma.sportsTournament.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sportsAdminTournamentRecord());
      await expect(service.updateTournament('missing', { expectedRevision: 1 }, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      tx.sportsTournament.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.updateTournament('tournament-1', { expectedRevision: 1 }, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auditLog.record).not.toHaveBeenCalled();
    });
  });

  describe('deleteTournament', () => {
    it('soft deletes the entire sports graph and backing match events', async () => {
      const tournament = sportsAdminTournamentRecord();
      prisma.sportsTournament.findFirst.mockResolvedValue(tournament);
      tx.sportsCategory.findMany.mockResolvedValue([
        { id: 'category-1', eventGroupId: 'event-group-1' },
        { id: 'category-2', eventGroupId: 'event-group-2' },
      ]);
      tx.sportsMatch.findMany.mockResolvedValue([
        { id: 'match-1', eventId: 'event-1' },
        { id: 'match-2', eventId: 'event-2' },
      ]);
      tx.sportsTeam.findMany.mockResolvedValue([{ id: 'team-1' }, { id: 'team-2' }]);
      tx.sportsTournament.updateMany.mockResolvedValue({ count: 1 });

      await service.deleteTournament('tournament-1', 2, actor);

      expect(frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-event-1', actor, 'delete');
      expect(tx.event.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['event-1', 'event-2'] }, deletedAt: null },
        data: { deletedAt: expect.any(Date), updatedById: 'admin-1' },
      });
      expect(tx.sportsCategory.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['category-1', 'category-2'] }, deletedAt: null },
        data: expect.objectContaining({ status: SportsCategoryStatus.CANCELED, deletedAt: expect.any(Date) }),
      });
      expect(tx.sportsTeamMember.updateMany).toHaveBeenCalledWith({
        where: { teamId: { in: ['team-1', 'team-2'] }, deletedAt: null },
        data: expect.objectContaining({ status: SportsTeamMemberStatus.WITHDRAWN }),
      });
      expect(tx.sportsTeam.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['team-1', 'team-2'] }, deletedAt: null },
        data: expect.objectContaining({ status: SportsTeamStatus.WITHDRAWN }),
      });
      expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: SportsRegistrationStatus.WITHDRAWN }) }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.DELETE, force: true }),
        tx,
      );
    });

    it('rejects missing and concurrently changed tournament deletes without cascade audit', async () => {
      prisma.sportsTournament.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sportsAdminTournamentRecord());
      await expect(service.deleteTournament('missing', 1, actor)).rejects.toBeInstanceOf(NotFoundException);

      tx.sportsCategory.findMany.mockResolvedValue([]);
      tx.sportsMatch.findMany.mockResolvedValue([]);
      tx.sportsTeam.findMany.mockResolvedValue([]);
      tx.sportsTournament.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteTournament('tournament-1', 1, actor)).rejects.toBeInstanceOf(ConflictException);
      expect(auditLog.record).not.toHaveBeenCalled();
    });
  });
});

function tournamentInput(overrides: Record<string, unknown> = {}) {
  return {
    name: ' Jogos Universitários ',
    emoji: ' 🏆 ',
    startDate: sportsTestDate(24 * 60 * 60_000),
    endDate: sportsTestDate(4 * 24 * 60 * 60_000),
    description: ' Competição universitária ',
    registrationStartDate: sportsTestDate(-7 * 24 * 60 * 60_000),
    registrationEndDate: sportsTestDate(12 * 60 * 60_000),
    selfSubscriptionEnabled: true,
    scoringMode: SportsScoringMode.BOTH,
    ...overrides,
  } as never;
}

function createPrisma(tx: ReturnType<typeof createTransaction>) {
  return {
    $transaction: jest.fn((callback: (transaction: ReturnType<typeof createTransaction>) => Promise<unknown>) =>
      callback(tx),
    ),
    sportsTournament: { findFirst: jest.fn() },
  };
}

function updateManyModel() {
  return { updateMany: jest.fn() };
}

function createTransaction() {
  return {
    majorEvent: { findFirst: jest.fn(), create: jest.fn() },
    sportsTournament: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    sportsTournamentParticipant: { findMany: jest.fn(), ...updateManyModel() },
    sportsCategory: { findMany: jest.fn(), ...updateManyModel() },
    sportsMatch: { findMany: jest.fn(), ...updateManyModel() },
    sportsTeam: { findMany: jest.fn(), ...updateManyModel() },
    sportsStage: updateManyModel(),
    sportsRegistration: updateManyModel(),
    eventGroup: updateManyModel(),
    sportsTeamMember: updateManyModel(),
    sportsTeamRepresentative: updateManyModel(),
    sportsVenue: updateManyModel(),
    sportsOfficialAssignment: updateManyModel(),
    sportsPlayerApplication: updateManyModel(),
    sportsTournamentScoreEntry: updateManyModel(),
    event: updateManyModel(),
  };
}
