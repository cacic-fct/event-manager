import { ConflictException } from '@nestjs/common';
import {
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { SportsTeamChangeService } from './sports-team-change.service';

describe('SportsTeamChangeService member lifecycle', () => {
  const identities = {
    protect: jest.fn((type: SportsIdentityType, value: string) => ({
      encryptedValue: `encrypted:${type}:${value}`,
      lookupHash: `hash:${type}:${value}`,
      displayHint: type === SportsIdentityType.EMAIL ? 'ma***@example.com' : '••••1234',
    })),
    reveal: jest.fn(),
  };
  const payments = {
    ensureParticipant: jest.fn(),
  };
  const auditLog = {
    record: jest.fn().mockResolvedValue(undefined),
  };

  let tx: ReturnType<typeof createTransaction>;
  let prisma: {
    $transaction: jest.Mock;
    sportsTeamChangeRequest: typeof tx.sportsTeamChangeRequest;
  };
  let service: SportsTeamChangeService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = {
      $transaction: jest.fn((callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
      sportsTeamChangeRequest: tx.sportsTeamChangeRequest,
    };
    service = new SportsTeamChangeService(prisma as never, identities as never, payments as never, auditLog as never);
  });
  it('updates a member with child revision CAS and makes suspended assignments ineligible', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        type: SportsTeamChangeRequestType.MEMBER_UPDATE,
        delta: {
          memberChanges: [
            {
              teamMemberId: 'member-1',
              expectedRevision: 3,
              status: SportsTeamMemberStatus.SUSPENDED,
            },
          ],
        },
      }),
    );
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce(lifecycleMember({ revision: 3 }));

    await service.review('request-1', 'APPROVE', adminActor(), {
      expectedRequestRevision: 1,
    });

    expect(tx.sportsTeamMember.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'member-1',
        teamId: 'team-1',
        revision: 3,
        deletedAt: null,
      },
      data: expect.objectContaining({
        status: SportsTeamMemberStatus.SUSPENDED,
        revision: { increment: 1 },
        updatedById: 'admin-1',
      }),
    });
    expect(tx.sportsRegistrationMember.updateMany).toHaveBeenCalledWith({
      where: {
        teamMemberId: 'member-1',
        deletedAt: null,
      },
      data: {
        eligibility: 'INELIGIBLE',
        rejectionReason: 'Integrante suspenso.',
        updatedById: 'admin-1',
      },
    });
  });

  it('soft-removes a member and only removes their future roster entries', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        type: SportsTeamChangeRequestType.MEMBER_REMOVE,
        delta: {
          memberChanges: [
            {
              teamMemberId: 'member-1',
              expectedRevision: 3,
            },
          ],
        },
      }),
    );
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce(lifecycleMember({ revision: 3 }));

    await service.review('request-1', 'APPROVE', adminActor());

    expect(tx.sportsTeamMember.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'member-1',
          revision: 3,
        }),
        data: expect.objectContaining({
          status: SportsTeamMemberStatus.WITHDRAWN,
          deletedAt: expect.any(Date),
          revision: { increment: 1 },
        }),
      }),
    );
    expect(tx.sportsMatchRosterEntry.updateMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        registrationMember: { teamMemberId: 'member-1' },
        roster: {
          match: {
            state: { in: ['SCHEDULED', 'CHECK_IN'] },
          },
        },
      },
      data: {
        deletedAt: expect.any(Date),
        updatedById: 'admin-1',
      },
    });
  });

  it('rejects a stale member child revision even when the team revision still matches', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        type: SportsTeamChangeRequestType.MEMBER_UPDATE,
        delta: {
          memberChanges: [
            {
              teamMemberId: 'member-1',
              expectedRevision: 2,
              status: SportsTeamMemberStatus.APPROVED,
            },
          ],
        },
      }),
    );
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce(lifecycleMember({ revision: 3 }));
    tx.sportsTeamMember.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.review('request-1', 'APPROVE', adminActor())).rejects.toThrow(ConflictException);

    expect(tx.sportsRegistrationMember.updateMany).not.toHaveBeenCalled();
  });
});

function createTransaction() {
  const now = new Date('2026-07-29T12:00:00.000Z');
  const representativeResult = {
    id: 'request-new',
    teamId: 'team-1',
    type: SportsTeamChangeRequestType.MEMBER_ADD,
    status: SportsTeamChangeRequestStatus.PENDING,
    requestRevision: 1,
    baseRevision: 7,
    delta: { categoryIds: ['category-1'] },
    reviewMessage: null,
    createdAt: now,
    updatedAt: now,
    identityClaims: [
      {
        id: 'claim-1',
        clientKey: 'person_local_01',
        type: SportsIdentityType.EMAIL,
        displayHint: 'ma***@example.com',
        status: SportsIdentityClaimStatus.PENDING,
      },
    ],
  };

  return {
    sportsTeam: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'team-1',
        name: 'Equipe A',
        revision: 7,
        fieldRevisions: { name: 7, institution: 6 },
        tournament: {
          id: 'tournament-1',
          majorEventId: 'major-event-1',
          status: SportsTournamentStatus.REGISTRATION_OPEN,
          finishedAt: null,
          deletedAt: null,
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sportsTournament: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'tournament-1',
        allowPlayerMultipleTeams: true,
      }),
    },
    sportsTeamChangeRequest: {
      findUnique: jest.fn().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(representativeResult),
      create: jest.fn().mockResolvedValue({
        id: 'request-new',
        teamId: 'team-1',
        type: SportsTeamChangeRequestType.MEMBER_ADD,
        status: SportsTeamChangeRequestStatus.PENDING,
        requestRevision: 1,
        baseRevision: 7,
        delta: { categoryIds: ['category-1'] },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'request-1',
        ...data,
      })),
    },
    sportsIdentityClaim: {
      upsert: jest.fn().mockResolvedValue({ id: 'claim-1' }),
      update: jest.fn(),
    },
    sportsCategory: {
      findMany: jest.fn(),
    },
    sportsTeamMember: {
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sportsRegistration: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sportsRegistrationMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    sportsMatchRosterEntry: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    people: {
      findMany: jest.fn(),
    },
  };
}

function reviewRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    teamId: 'team-1',
    type: SportsTeamChangeRequestType.TEAM_DETAILS,
    status: SportsTeamChangeRequestStatus.PENDING,
    requestRevision: 1,
    baseRevision: 1,
    baseFieldRevisions: { name: 1, institution: 1 },
    delta: { set: { name: 'Nome solicitado' } },
    pendingKey: 'team-1:person-1:TEAM_DETAILS',
    identityClaims: [],
    team: {
      id: 'team-1',
      name: 'Equipe A',
      tournamentId: 'tournament-1',
      revision: 1,
      fieldRevisions: { name: 1, institution: 1 },
      tournament: {
        id: 'tournament-1',
        majorEvent: { id: 'major-event-1' },
      },
    },
    ...overrides,
  };
}

function lifecycleMember(overrides: Record<string, unknown> = {}) {
  return {
    id: 'member-1',
    teamId: 'team-1',
    revision: 3,
    status: SportsTeamMemberStatus.APPROVED,
    approvedAt: new Date('2026-07-01T00:00:00.000Z'),
    approvedById: 'admin-original',
    participant: {
      status: SportsParticipantStatus.ACTIVE,
      paymentStatus: SportsPaymentStatus.PAID,
    },
    ...overrides,
  };
}

function adminActor() {
  return {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
}
