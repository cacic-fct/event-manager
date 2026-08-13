import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AuditLogOperation,
  SportsEligibilityStatus,
  SportsRegistrationStatus,
  SportsTeamMemberStatus,
  SportsTeamStatus,
} from '@prisma/client';
import {
  sportsAdminRepresentativeRecord,
  sportsAdminTeamMemberRecord,
  sportsAdminTeamRecord,
} from '../testing/sports-backend.fixtures';
import { SportsTeamAdminService } from './sports-team-admin.service';

describe('SportsTeamAdminService', () => {
  const actor = { sub: 'actor-1' };
  const frozen = { assertMajorEventMutable: jest.fn() };
  const auditLog = { record: jest.fn() };
  const payments = { ensureParticipant: jest.fn().mockResolvedValue({ id: 'participant-1' }) };
  let tx: ReturnType<typeof transaction>;
  let prisma: ReturnType<typeof prismaClient>;
  let service: SportsTeamAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = transaction();
    prisma = prismaClient(tx);
    service = new SportsTeamAdminService(prisma as never, frozen as never, auditLog as never, payments as never);
  });

  describe('team records', () => {
    it('creates a normalized active team and audits it', async () => {
      const team = sportsAdminTeamRecord({ name: 'Equipe Nova', institution: 'Unesp' });
      tx.sportsTeam.create.mockResolvedValue(team);

      await expect(
        service.createTeam(
          { tournamentId: 'tournament-1', name: '  Equipe Nova  ', institution: '  Unesp  ' },
          actor as never,
        ),
      ).resolves.toEqual(team);

      expect(tx.sportsTeam.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Equipe Nova',
          institution: 'Unesp',
          status: SportsTeamStatus.ACTIVE,
          fieldRevisions: { name: 1, institution: 1, logo: 1 },
        }),
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.CREATE }),
        tx,
      );
    });

    it('supports explicit initial status and an empty institution', async () => {
      tx.sportsTeam.create.mockResolvedValue(sportsAdminTeamRecord());

      await service.createTeam(
        { tournamentId: 'tournament-1', name: 'Equipe Nova', institution: '   ', status: SportsTeamStatus.SUSPENDED },
        actor as never,
      );

      expect(tx.sportsTeam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ institution: null, status: SportsTeamStatus.SUSPENDED }),
        }),
      );
    });

    it('rejects a missing tournament or duplicate team name', async () => {
      prisma.sportsTournament.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ majorEventId: 'major-event-1' });
      tx.sportsTeam.findFirst.mockResolvedValue({ id: 'duplicate' });

      await expect(
        service.createTeam({ tournamentId: 'missing', name: 'Equipe Nova' }, actor as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createTeam({ tournamentId: 'tournament-1', name: 'Equipe Nova' }, actor as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('updates all mutable fields and revision ownership', async () => {
      const result = sportsAdminTeamRecord({
        name: 'Equipe Verde',
        institution: null,
        status: SportsTeamStatus.SUSPENDED,
        revision: 3,
        fieldRevisions: { name: 3, institution: 3, logo: 1 },
      });
      prisma.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      tx.sportsTeam.findUniqueOrThrow.mockResolvedValue(result);

      await expect(
        service.updateTeam(
          'team-1',
          { expectedRevision: 2, name: ' Equipe Verde ', institution: ' ', status: SportsTeamStatus.SUSPENDED },
          actor as never,
        ),
      ).resolves.toEqual(result);

      expect(tx.sportsTeam.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Equipe Verde',
            institution: null,
            status: SportsTeamStatus.SUSPENDED,
            fieldRevisions: { name: 3, institution: 3, logo: 1 },
          }),
        }),
      );
    });

    it('updates without optional field changes and checks the existing name for duplicates', async () => {
      prisma.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      tx.sportsTeam.findUniqueOrThrow.mockResolvedValue(sportsAdminTeamRecord({ revision: 3 }));

      await service.updateTeam('team-1', { expectedRevision: 2 }, actor as never);

      expect(tx.sportsTeam.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ name: { equals: 'Equipe Azul', mode: 'insensitive' } }),
        }),
      );
      const data = tx.sportsTeam.updateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('name');
      expect(data).not.toHaveProperty('institution');
      expect(data).not.toHaveProperty('status');
    });

    it('rejects missing, duplicate, or concurrently changed teams on update', async () => {
      prisma.sportsTeam.findFirst.mockResolvedValueOnce(null);
      await expect(service.updateTeam('missing', { expectedRevision: 1 }, actor as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      prisma.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      tx.sportsTeam.findFirst.mockResolvedValueOnce({ id: 'duplicate' }).mockResolvedValueOnce(null);
      await expect(
        service.updateTeam('team-1', { expectedRevision: 2, name: 'Duplicada' }, actor as never),
      ).rejects.toBeInstanceOf(ConflictException);
      tx.sportsTeam.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.updateTeam('team-1', { expectedRevision: 2 }, actor as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('members and representatives', () => {
    it('creates a participant-backed approved team member', async () => {
      prisma.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      tx.sportsTeamMember.create.mockResolvedValue(sportsAdminTeamMemberRecord());

      await expect(service.createTeamMember('team-1', 'person-1', actor as never)).resolves.toMatchObject({
        id: 'member-1',
      });

      expect(payments.ensureParticipant).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ personId: 'person-1', approved: true }),
      );
      expect(tx.sportsTeamMember.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: SportsTeamMemberStatus.APPROVED }) }),
      );
    });

    it.each([
      [null, null],
      [new Date(), 'actor-original'],
    ])('restores an existing member while preserving approval when present', async (approvedAt, approvedById) => {
      prisma.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      const existing = sportsAdminTeamMemberRecord({ approvedAt, approvedById });
      tx.sportsTeamMember.findFirst.mockResolvedValue(existing);
      tx.sportsTeamMember.update.mockResolvedValue(sportsAdminTeamMemberRecord());

      await service.createTeamMember('team-1', 'person-1', actor as never);

      expect(tx.sportsTeamMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approvedAt: approvedAt ?? expect.any(Date),
            approvedById: approvedById ?? 'actor-1',
            deletedAt: null,
          }),
        }),
      );
    });

    it('rejects missing teams or people while creating members', async () => {
      prisma.sportsTeam.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(sportsAdminTeamRecord());
      await expect(service.createTeamMember('missing', 'person-1', actor as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      tx.people.findFirst.mockResolvedValue(null);
      await expect(service.createTeamMember('team-1', 'missing', actor as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it.each([SportsTeamMemberStatus.APPROVED, SportsTeamMemberStatus.SUSPENDED])(
      'updates member status to %s',
      async (status) => {
        const existing = sportsAdminTeamMemberRecord({ approvedAt: null, approvedById: null });
        prisma.sportsTeamMember.findFirst.mockResolvedValue(existing);
        tx.sportsTeamMember.findUniqueOrThrow.mockResolvedValue(sportsAdminTeamMemberRecord({ status, revision: 2 }));

        await service.updateTeamMember('member-1', 1, status, actor as never);

        if (status === SportsTeamMemberStatus.APPROVED) {
          expect(tx.sportsRegistrationMember.updateMany).not.toHaveBeenCalled();
        } else {
          expect(tx.sportsRegistrationMember.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
              data: expect.objectContaining({ eligibility: SportsEligibilityStatus.INELIGIBLE }),
            }),
          );
        }
      },
    );

    it('rejects missing or concurrently changed member updates', async () => {
      prisma.sportsTeamMember.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sportsAdminTeamMemberRecord());
      await expect(
        service.updateTeamMember('missing', 1, SportsTeamMemberStatus.SUSPENDED, actor as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      tx.sportsTeamMember.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.updateTeamMember('member-1', 1, SportsTeamMemberStatus.SUSPENDED, actor as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('assigns a representative with a linked user', async () => {
      tx.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      tx.sportsTeamRepresentative.upsert.mockResolvedValue(sportsAdminRepresentativeRecord());

      await expect(service.assignRepresentative('team-1', 'person-1', actor as never)).resolves.toMatchObject({
        id: 'representative-1',
      });

      expect(tx.sportsTeamRepresentative.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ active: true, revokedAt: null }) }),
      );
    });

    it('rejects representative assignment for a missing team or unlinked person', async () => {
      tx.sportsTeam.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(sportsAdminTeamRecord());
      await expect(service.assignRepresentative('missing', 'person-1', actor as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      tx.people.findFirst.mockResolvedValue({ id: 'person-1', userId: null });
      await expect(service.assignRepresentative('team-1', 'person-1', actor as never)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns an already inactive representative without writing', async () => {
      prisma.sportsTeamRepresentative.findUnique.mockResolvedValue(sportsAdminRepresentativeRecord({ active: false }));

      await expect(service.revokeRepresentative('representative-1', actor as never)).resolves.toMatchObject({
        active: false,
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('revokes an active representative and audits the transition', async () => {
      prisma.sportsTeamRepresentative.findUnique.mockResolvedValue(sportsAdminRepresentativeRecord());
      tx.sportsTeamRepresentative.findUniqueOrThrow.mockResolvedValue(
        sportsAdminRepresentativeRecord({ active: false, revokedAt: new Date() }),
      );

      await expect(service.revokeRepresentative('representative-1', actor as never)).resolves.toMatchObject({
        active: false,
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.DELETE }),
        tx,
      );
    });

    it('rejects missing or concurrently changed representative revocation', async () => {
      prisma.sportsTeamRepresentative.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sportsAdminRepresentativeRecord());
      await expect(service.revokeRepresentative('missing', actor as never)).rejects.toBeInstanceOf(NotFoundException);
      tx.sportsTeamRepresentative.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revokeRepresentative('representative-1', actor as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('deletion', () => {
    it('withdraws a team and all dependent active records', async () => {
      prisma.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());

      await expect(service.deleteTeam('team-1', 2, actor as never)).resolves.toBeUndefined();

      expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: SportsRegistrationStatus.WITHDRAWN }) }),
      );
      expect(tx.sportsTeamMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: SportsTeamMemberStatus.WITHDRAWN }) }),
      );
      expect(tx.sportsTeamRepresentative.updateMany).toHaveBeenCalled();
      expect(tx.sportsTournamentScoreEntry.updateMany).toHaveBeenCalled();
    });

    it('rejects missing teams, active matches, or concurrent deletion changes', async () => {
      prisma.sportsTeam.findFirst.mockResolvedValueOnce(null);
      await expect(service.deleteTeam('missing', 1, actor as never)).rejects.toBeInstanceOf(NotFoundException);

      prisma.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      tx.sportsMatch.findFirst.mockResolvedValueOnce({ id: 'active-match' }).mockResolvedValueOnce(null);
      await expect(service.deleteTeam('team-1', 2, actor as never)).rejects.toBeInstanceOf(ConflictException);
      tx.sportsTeam.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteTeam('team-1', 2, actor as never)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});

function prismaClient(tx: ReturnType<typeof transaction>) {
  return {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    sportsTournament: { findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-event-1' }) },
    sportsTeam: { findFirst: jest.fn() },
    sportsTeamMember: { findFirst: jest.fn() },
    sportsTeamRepresentative: { findUnique: jest.fn() },
  };
}

function transaction() {
  return {
    people: { findFirst: jest.fn().mockResolvedValue({ id: 'person-1', name: 'Ana Silva', userId: 'user-1' }) },
    sportsTeam: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    sportsTeamMember: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    sportsRegistrationMember: { updateMany: jest.fn() },
    sportsTeamRepresentative: {
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    sportsMatch: { findFirst: jest.fn().mockResolvedValue(null) },
    sportsRegistration: { updateMany: jest.fn() },
    sportsTournamentScoreEntry: { updateMany: jest.fn() },
  };
}
