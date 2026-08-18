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
  let adminPrisma: {
    $transaction: jest.Mock;
    sportsRegistrationMember: { findFirst: jest.Mock };
  };
  let frozenResource: { assertEventGroupMutable: jest.Mock };
  let service: SportsRegistrationAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = transaction();
    frozenResource = { assertEventGroupMutable: jest.fn().mockResolvedValue(undefined) };
    adminPrisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      sportsRegistrationMember: { findFirst: jest.fn() },
    };
    service = new SportsRegistrationAdminService(
      adminPrisma as never,
      frozenResource as never,
      auditLog as never,
      {} as never,
    );
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

  it('lets an administrator update the shirt number and each game identity field independently', async () => {
    const member = athleteMember();
    adminPrisma.sportsRegistrationMember.findFirst.mockResolvedValue({
      category: { eventGroupId: 'event-group-1' },
    });
    tx.sportsRegistrationMember.findFirst.mockResolvedValue(member);
    tx.sportsRegistrationMember.updateMany.mockResolvedValue({ count: 1 });
    tx.sportsRegistrationMember.findUniqueOrThrow.mockResolvedValue({
      ...member,
      shirtNumber: '10',
      gameNickname: 'Fênix',
      gameAccountName: 'fenix#BR1',
      gameAccountUrl: 'https://example.com/fenix',
    });

    await expect(
      service.updateAthleteProfile(
        member.id,
        {
          shirtNumber: ' 10 ',
          gameNickname: ' Fênix ',
          gameAccountName: ' fenix#BR1 ',
          gameAccountUrl: ' https://example.com/fenix ',
        },
        actor as never,
      ),
    ).resolves.toEqual(expect.objectContaining({ id: member.id, shirtNumber: '10' }));

    expect(adminPrisma.sportsRegistrationMember.findFirst).toHaveBeenCalledWith({
      where: { id: member.id, deletedAt: null },
      select: { category: { select: { eventGroupId: true } } },
    });
    expect(frozenResource.assertEventGroupMutable).toHaveBeenCalledWith('event-group-1', actor, 'edit');
    expect(tx.sportsRegistrationMember.updateMany).toHaveBeenCalledWith({
      where: { id: member.id, deletedAt: null },
      data: {
        shirtNumber: '10',
        gameNickname: 'Fênix',
        gameAccountName: 'fenix#BR1',
        gameAccountUrl: 'https://example.com/fenix',
        updatedById: 'user-1',
      },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: member.id, operation: AuditLogOperation.UPDATE }),
      tx,
    );
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
    shirtNumber: null,
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
