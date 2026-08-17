import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AuditLogOperation, SportsEligibilityStatus, SportsRegistrationStatus, SportsRosterRole } from '@prisma/client';
import {
  sportsAdminRegistrationCategory,
  sportsAdminRegistrationRecord,
  sportsAdminTeamMemberRecord,
  sportsAdminTeamRecord,
  sportsTestDate,
} from '../testing/sports-backend.fixtures';
import { SportsRegistrationAdminService } from './sports-registration-admin.service';

describe('SportsRegistrationAdminService', () => {
  const actor = { sub: 'actor-1' };
  const frozen = { assertEventGroupMutable: jest.fn() };
  const auditLog = { record: jest.fn() };
  let tx: ReturnType<typeof transaction>;
  let prisma: ReturnType<typeof prismaClient>;
  let service: SportsRegistrationAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = transaction();
    prisma = prismaClient(tx);
    service = new SportsRegistrationAdminService(prisma as never, frozen as never, auditLog as never, {} as never);
  });

  describe('creation', () => {
    it('creates an approved registration and audits its scope', async () => {
      const registration = sportsAdminRegistrationRecord();
      tx.sportsRegistration.create.mockResolvedValue(registration);

      await expect(
        service.createRegistration({ teamId: 'team-1', categoryId: 'category-1', seed: 1 }, actor as never),
      ).resolves.toEqual(registration);

      expect(tx.sportsRegistration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: SportsRegistrationStatus.APPROVED,
          seed: 1,
          approvedAt: expect.any(Date),
        }),
      });
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: AuditLogOperation.CREATE,
          scope: expect.objectContaining({ eventGroupId: 'event-group-1' }),
        }),
        tx,
      );
    });

    it('captures and normalizes the configured registration form', async () => {
      tx.sportsCategory.findFirst.mockResolvedValue(
        sportsAdminRegistrationCategory({
          registrationFormId: 'form-1',
          registrationForm: {
            id: 'form-1',
            name: 'Inscrição',
            elements: [{ id: 'student-id', type: 'shortText', title: 'Matrícula', required: true }],
            updatedAt: sportsTestDate(-60_000),
            deletedAt: null,
          },
        }),
      );
      tx.sportsRegistration.create.mockImplementation(async ({ data }) => ({ id: 'registration-1', ...data }));

      await service.createRegistration(
        {
          teamId: 'team-1',
          categoryId: 'category-1',
          formAnswers: [{ elementId: 'student-id', value: ' 12345 ' }] as never,
        },
        actor as never,
      );

      expect(tx.sportsRegistration.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          seed: null,
          formAnswers: [{ elementId: 'student-id', value: '12345' }],
          formSchemaSnapshot: expect.objectContaining({ formId: 'form-1', version: 1 }),
        }),
      });
    });

    it('returns an existing registration without duplicating or auditing', async () => {
      const existing = sportsAdminRegistrationRecord();
      tx.sportsRegistration.findFirst.mockResolvedValue(existing);

      await expect(
        service.createRegistration({ teamId: 'team-1', categoryId: 'category-1' }, actor as never),
      ).resolves.toEqual(existing);

      expect(tx.sportsRegistration.create).not.toHaveBeenCalled();
      expect(auditLog.record).not.toHaveBeenCalled();
    });

    it('rejects missing category scope, missing records, cross-tournament teams, or answers without a form', async () => {
      prisma.sportsCategory.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.createRegistration({ teamId: 'team-1', categoryId: 'missing' }, actor as never),
      ).rejects.toBeInstanceOf(NotFoundException);

      prisma.sportsCategory.findFirst.mockResolvedValue({ eventGroupId: 'event-group-1' });
      tx.sportsTeam.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sportsAdminTeamRecord({ tournamentId: 'other' }));
      await expect(
        service.createRegistration({ teamId: 'missing', categoryId: 'category-1' }, actor as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.createRegistration({ teamId: 'team-1', categoryId: 'category-1' }, actor as never),
      ).rejects.toBeInstanceOf(BadRequestException);

      tx.sportsTeam.findFirst.mockResolvedValue(sportsAdminTeamRecord());
      await expect(
        service.createRegistration({ teamId: 'team-1', categoryId: 'category-1', formAnswers: [] }, actor as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updates', () => {
    it.each([SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE])(
      'marks approval metadata when status becomes %s',
      async (status) => {
        prisma.sportsRegistration.findFirst.mockResolvedValue(sportsAdminRegistrationRecord());
        tx.sportsRegistration.findUniqueOrThrow.mockResolvedValue(
          sportsAdminRegistrationRecord({ status, revision: 3 }),
        );

        await service.updateRegistration('registration-1', { expectedRevision: 2, status }, actor as never);

        expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status,
              approvedAt: expect.any(Date),
              approvedById: 'actor-1',
              rejectedAt: null,
            }),
          }),
        );
      },
    );

    it('marks rejection metadata and updates seed', async () => {
      prisma.sportsRegistration.findFirst.mockResolvedValue(sportsAdminRegistrationRecord());
      tx.sportsRegistration.findUniqueOrThrow.mockResolvedValue(
        sportsAdminRegistrationRecord({ status: SportsRegistrationStatus.REJECTED, seed: null, revision: 3 }),
      );

      await service.updateRegistration(
        'registration-1',
        { expectedRevision: 2, status: SportsRegistrationStatus.REJECTED, seed: null },
        actor as never,
      );

      expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rejectedAt: expect.any(Date), rejectedById: 'actor-1', seed: null }),
        }),
      );
    });

    it('normalizes edited answers against the stored schema snapshot', async () => {
      prisma.sportsRegistration.findFirst.mockResolvedValue(
        sportsAdminRegistrationRecord({
          formSchemaSnapshot: {
            version: 1,
            elements: [
              {
                id: 'course',
                type: 'singleChoice',
                title: 'Curso',
                required: true,
                options: [{ id: 'law', label: 'Direito' }],
              },
            ],
          },
        }),
      );
      tx.sportsRegistration.findUniqueOrThrow.mockResolvedValue(sportsAdminRegistrationRecord({ revision: 3 }));

      await service.updateRegistration(
        'registration-1',
        { expectedRevision: 2, formAnswers: [{ elementId: 'course', value: 'law' }] as never },
        actor as never,
      );

      expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ formAnswers: [{ elementId: 'course', value: 'law' }] }),
        }),
      );
    });

    it('performs a revision-only update without optional state transitions', async () => {
      prisma.sportsRegistration.findFirst.mockResolvedValue(sportsAdminRegistrationRecord());
      tx.sportsRegistration.findUniqueOrThrow.mockResolvedValue(sportsAdminRegistrationRecord({ revision: 3 }));

      await service.updateRegistration('registration-1', { expectedRevision: 2 }, actor as never);

      const data = tx.sportsRegistration.updateMany.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('status');
      expect(data).not.toHaveProperty('seed');
      expect(data).not.toHaveProperty('formAnswers');
      expect(data).not.toHaveProperty('approvedAt');
      expect(data).not.toHaveProperty('rejectedAt');
    });

    it('rejects missing, invalid-snapshot, or concurrently changed updates', async () => {
      prisma.sportsRegistration.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sportsAdminRegistrationRecord())
        .mockResolvedValueOnce(sportsAdminRegistrationRecord());
      await expect(
        service.updateRegistration('missing', { expectedRevision: 1 }, actor as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateRegistration('registration-1', { expectedRevision: 2, formAnswers: [] }, actor as never),
      ).rejects.toBeInstanceOf(ConflictException);
      tx.sportsRegistration.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.updateRegistration('registration-1', { expectedRevision: 1 }, actor as never),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('category roles', () => {
    it.each([
      ['ACTIVE', SportsEligibilityStatus.ELIGIBLE],
      ['PENDING', SportsEligibilityStatus.PENDING],
    ])('assigns a role with participant status %s', async (participantStatus, eligibility) => {
      tx.sportsRegistration.findFirst.mockResolvedValue(sportsAdminRegistrationRecord());
      tx.sportsTeamMember.findFirst.mockResolvedValue(
        sportsAdminTeamMemberRecord({ participant: { status: participantStatus } }),
      );
      tx.sportsRegistrationMember.create.mockResolvedValue({
        id: 'assignment-1',
        registrationId: 'registration-1',
        teamMemberId: 'member-1',
        role: SportsRosterRole.PLAYER,
      });

      await service.assignCategoryRole(
        { registrationId: 'registration-1', teamMemberId: 'member-1', role: SportsRosterRole.PLAYER },
        actor as never,
      );

      expect(tx.sportsRegistrationMember.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ eligibility }) }),
      );
    });

    it('returns an existing role assignment without duplicating it', async () => {
      const existing = { id: 'assignment-1', role: SportsRosterRole.CAPTAIN };
      tx.sportsRegistration.findFirst.mockResolvedValue(sportsAdminRegistrationRecord());
      tx.sportsTeamMember.findFirst.mockResolvedValue(
        sportsAdminTeamMemberRecord({ participant: { status: 'ACTIVE' } }),
      );
      tx.sportsRegistrationMember.findFirst.mockResolvedValue(existing);

      await expect(
        service.assignCategoryRole(
          { registrationId: 'registration-1', teamMemberId: 'member-1', role: SportsRosterRole.CAPTAIN },
          actor as never,
        ),
      ).resolves.toEqual(existing);
      expect(tx.sportsRegistrationMember.count).not.toHaveBeenCalled();
      expect(tx.sportsRegistrationMember.create).not.toHaveBeenCalled();
    });

    it('updates the existing category assignment when its role changes', async () => {
      const existing = {
        id: 'assignment-1',
        registrationId: 'registration-1',
        teamMemberId: 'member-1',
        role: SportsRosterRole.PLAYER,
      };
      const updated = { ...existing, role: SportsRosterRole.CAPTAIN };
      tx.sportsRegistration.findFirst.mockResolvedValue(sportsAdminRegistrationRecord());
      tx.sportsTeamMember.findFirst.mockResolvedValue(
        sportsAdminTeamMemberRecord({ participant: { status: 'ACTIVE' } }),
      );
      tx.sportsRegistrationMember.findFirst.mockResolvedValue(existing);
      tx.sportsRegistrationMember.update.mockResolvedValue(updated);

      await expect(
        service.assignCategoryRole(
          { registrationId: 'registration-1', teamMemberId: 'member-1', role: SportsRosterRole.CAPTAIN },
          actor as never,
        ),
      ).resolves.toEqual(updated);

      expect(tx.sportsRegistrationMember.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { role: SportsRosterRole.CAPTAIN, updatedById: 'actor-1' },
      });
      expect(tx.sportsRegistrationMember.create).not.toHaveBeenCalled();
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.UPDATE }),
        tx,
      );
    });

    it('rejects missing scope/records or an exceeded category role limit', async () => {
      prisma.sportsRegistration.findFirst.mockResolvedValueOnce(null).mockResolvedValue({
        category: { eventGroupId: 'event-group-1' },
      });
      await expect(
        service.assignCategoryRole(
          { registrationId: 'missing', teamMemberId: 'member-1', role: SportsRosterRole.PLAYER },
          actor as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      tx.sportsRegistration.findFirst.mockResolvedValueOnce(null).mockResolvedValue(sportsAdminRegistrationRecord());
      await expect(
        service.assignCategoryRole(
          { registrationId: 'registration-1', teamMemberId: 'member-1', role: SportsRosterRole.PLAYER },
          actor as never,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      tx.sportsTeamMember.findFirst.mockResolvedValue(
        sportsAdminTeamMemberRecord({ participant: { status: 'ACTIVE' } }),
      );
      tx.sportsRegistrationMember.count.mockResolvedValue(1);
      await expect(
        service.assignCategoryRole(
          { registrationId: 'registration-1', teamMemberId: 'member-1', role: SportsRosterRole.CAPTAIN },
          actor as never,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('deletion', () => {
    it('soft-deletes a registration and all live category-role assignments', async () => {
      prisma.sportsRegistration.findFirst.mockResolvedValue(sportsAdminRegistrationRecord());

      await expect(service.deleteRegistration('registration-1', 2, actor as never)).resolves.toBeUndefined();

      expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SportsRegistrationStatus.WITHDRAWN, deletedAt: expect.any(Date) }),
        }),
      );
      expect(tx.sportsRegistrationMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
      );
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({ operation: AuditLogOperation.DELETE, force: true }),
        tx,
      );
    });

    it('rejects missing registrations, active-match dependencies, or concurrent deletion', async () => {
      prisma.sportsRegistration.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(sportsAdminRegistrationRecord())
        .mockResolvedValueOnce(sportsAdminRegistrationRecord());
      await expect(service.deleteRegistration('missing', 1, actor as never)).rejects.toBeInstanceOf(NotFoundException);
      tx.sportsMatch.findFirst.mockResolvedValueOnce({ id: 'match-active' }).mockResolvedValueOnce(null);
      await expect(service.deleteRegistration('registration-1', 2, actor as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
      tx.sportsRegistration.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.deleteRegistration('registration-1', 1, actor as never)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});

function prismaClient(tx: ReturnType<typeof transaction>) {
  return {
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    sportsCategory: { findFirst: jest.fn().mockResolvedValue({ eventGroupId: 'event-group-1' }) },
    sportsRegistration: {
      findFirst: jest.fn().mockResolvedValue({ category: { eventGroupId: 'event-group-1' } }),
    },
  };
}

function transaction() {
  return {
    sportsTeam: { findFirst: jest.fn().mockResolvedValue(sportsAdminTeamRecord()) },
    sportsCategory: { findFirst: jest.fn().mockResolvedValue(sportsAdminRegistrationCategory()) },
    sportsRegistration: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    sportsTeamMember: { findFirst: jest.fn() },
    sportsRegistrationMember: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(),
    },
    sportsMatch: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}
