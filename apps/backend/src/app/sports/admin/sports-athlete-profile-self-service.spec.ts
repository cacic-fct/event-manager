import { NotFoundException } from '@nestjs/common';
import {
  AuditLogOperation,
  SportsAthleteIdentifierMode,
  SportsEligibilityStatus,
  SportsRegistrationStatus,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { SportsRegistrationAdminService } from './sports-registration-admin.service';

describe('SportsRegistrationAdminService athlete profile self-service', () => {
  const actor = { sub: 'user-1' };
  const auditLog = { record: jest.fn() };
  let tx: ReturnType<typeof transaction>;
  let service: SportsRegistrationAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = transaction();
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    service = new SportsRegistrationAdminService(prisma as never, {} as never, auditLog as never, {} as never);
  });

  it('updates only the signed-in athlete active game-account assignment and audits the change', async () => {
    const member = athleteMember();
    tx.sportsRegistrationMember.findFirst.mockResolvedValue(member);
    tx.sportsRegistrationMember.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsRegistrationMember.findUniqueOrThrow.mockResolvedValue({
      ...member,
      gameNickname: 'Fênix',
      gameAccountName: 'fenix#2026',
      gameAccountUrl: 'https://example.com/fenix',
    });

    await expect(
      service.updateOwnAthleteProfile(
        member.id,
        'person-1',
        {
          gameNickname: '  Fênix ',
          gameAccountName: ' fenix#2026 ',
          gameAccountUrl: ' https://example.com/fenix ',
        },
        actor as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: member.id, gameNickname: 'Fênix' }));

    expect(tx.sportsRegistrationMember.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: member.id,
          eligibility: SportsEligibilityStatus.ELIGIBLE,
          category: expect.objectContaining({
            athleteIdentifierMode: SportsAthleteIdentifierMode.GAME_ACCOUNT,
          }),
          registration: expect.objectContaining({
            status: { in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE] },
          }),
          teamMember: expect.objectContaining({
            status: SportsTeamMemberStatus.APPROVED,
            participant: expect.objectContaining({ personId: 'person-1', status: 'ACTIVE' }),
          }),
        }),
      }),
    );
    expect(tx.sportsRegistrationMember.updateMany).toHaveBeenCalledWith({
      where: { id: member.id, deletedAt: null },
      data: {
        gameNickname: 'Fênix',
        gameAccountName: 'fenix#2026',
        gameAccountUrl: 'https://example.com/fenix',
        updatedById: 'user-1',
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.UPDATE,
        entityId: member.id,
        scope: { majorEventId: 'major-event-1', eventGroupId: 'event-group-1' },
      }),
      tx,
    );
  });

  it('does not reveal whether an unavailable assignment belongs to someone else', async () => {
    tx.sportsRegistrationMember.findFirst.mockResolvedValue(null);

    await expect(
      service.updateOwnAthleteProfile(
        'registration-member-other',
        'person-1',
        { gameNickname: 'Fênix' },
        actor as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.sportsRegistrationMember.updateMany).not.toHaveBeenCalled();
  });
});

function transaction() {
  return {
    sportsRegistrationMember: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
  };
}

function athleteMember() {
  return {
    id: 'registration-member-1',
    registrationId: 'registration-1',
    categoryId: 'category-1',
    teamMemberId: 'team-member-1',
    gameNickname: null,
    gameAccountName: null,
    gameAccountUrl: null,
    registration: { id: 'registration-1', team: { name: 'Equipe A' } },
    category: {
      name: 'League of Legends',
      eventGroupId: 'event-group-1',
      tournament: { majorEventId: 'major-event-1' },
    },
    teamMember: { participant: { person: { name: 'Atleta A' } } },
  };
}
