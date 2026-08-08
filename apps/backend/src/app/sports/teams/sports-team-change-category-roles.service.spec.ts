import {
  SportsEligibilityStatus,
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { SportsTeamChangeService } from './sports-team-change.service';

describe('SportsTeamChangeService category roles and eligibility', () => {
  const identities = {
    protect: jest.fn(
      (type: SportsIdentityType, value: string) => ({
        encryptedValue: `encrypted:${type}:${value}`,
        lookupHash: `hash:${type}:${value}`,
        displayHint: type === SportsIdentityType.EMAIL ? 'ma***@example.com' : '••••1234',
      }),
    ),
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
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
      sportsTeamChangeRequest: tx.sportsTeamChangeRequest,
    };
    service = new SportsTeamChangeService(
      prisma as never,
      identities as never,
      payments as never,
      auditLog as never,
    );
  });
  it('enforces category captain limits against the final projected role set', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      categoryRoleRequest({
        categoryRoleChanges: [
          {
            registrationMemberId: null,
            registrationId: 'registration-1',
            teamMemberId: 'member-2',
            expectedRegistrationRevision: 4,
            expectedRole: null,
            expectedEligibility: null,
            role: SportsRosterRole.CAPTAIN,
          },
        ],
      }),
    );
    tx.sportsRegistration.findFirst.mockResolvedValueOnce(
      lifecycleRegistration({ maximumCaptains: 1 }),
    );
    tx.sportsTeamMember.findMany.mockResolvedValueOnce([
      lifecycleMember({ id: 'member-2' }),
    ]);
    tx.sportsRegistrationMember.findMany.mockResolvedValueOnce([
      lifecycleAssignment({
        id: 'assignment-1',
        teamMemberId: 'member-1',
        role: SportsRosterRole.CAPTAIN,
      }),
    ]);

    await expect(
      service.review('request-1', 'APPROVE', adminActor()),
    ).rejects.toThrow('limite de capitães');

    expect(tx.sportsRegistration.updateMany).not.toHaveBeenCalled();
    expect(tx.sportsRegistrationMember.create).not.toHaveBeenCalled();
  });

  it('applies category roles with registration and assignment CAS while preserving payment eligibility', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      categoryRoleRequest({
        categoryRoleChanges: [
          {
            registrationMemberId: 'assignment-1',
            registrationId: 'registration-1',
            teamMemberId: 'member-1',
            expectedRegistrationRevision: 4,
            expectedRole: SportsRosterRole.PLAYER,
            expectedEligibility: SportsEligibilityStatus.ELIGIBLE,
            role: SportsRosterRole.CAPTAIN,
          },
        ],
      }),
    );
    tx.sportsRegistration.findFirst.mockResolvedValueOnce(
      lifecycleRegistration(),
    );
    tx.sportsTeamMember.findMany.mockResolvedValueOnce([
      lifecycleMember({
        participant: {
          status: SportsParticipantStatus.WAITING_PAYMENT,
          paymentStatus: SportsPaymentStatus.WAITING_PAYMENT,
        },
      }),
    ]);
    tx.sportsRegistrationMember.findMany.mockResolvedValueOnce([
      lifecycleAssignment(),
    ]);

    await service.review('request-1', 'APPROVE', adminActor());

    expect(tx.sportsRegistration.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'registration-1',
        teamId: 'team-1',
        revision: 4,
        deletedAt: null,
      },
      data: {
        revision: { increment: 1 },
        updatedById: 'admin-1',
      },
    });
    expect(tx.sportsRegistrationMember.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'assignment-1',
        registrationId: 'registration-1',
        categoryId: 'category-1',
        teamMemberId: 'member-1',
        role: SportsRosterRole.PLAYER,
        eligibility: SportsEligibilityStatus.ELIGIBLE,
        deletedAt: null,
      },
      data: expect.objectContaining({
        role: SportsRosterRole.CAPTAIN,
        eligibility: SportsEligibilityStatus.PENDING,
        approvedById: 'admin-1',
      }),
    });
  });

  it('blocks member-add approval across teams for a restricted category before payment materialization', async () => {
    identities.reveal.mockReturnValueOnce('maria@example.com');
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        type: SportsTeamChangeRequestType.MEMBER_ADD,
        delta: { categoryIds: ['category-1'] },
        identityClaims: [
          {
            id: 'claim-1',
            type: SportsIdentityType.EMAIL,
            encryptedValue: 'encrypted-value',
          },
        ],
      }),
    );
    tx.sportsTournament.findFirst.mockResolvedValueOnce({
      id: 'tournament-1',
      allowPlayerMultipleTeams: true,
    });
    tx.sportsCategory.findMany.mockResolvedValueOnce([
      {
        id: 'category-1',
        allowPlayerMultipleTeams: false,
      },
    ]);
    tx.people.findMany.mockResolvedValueOnce([{ id: 'person-1' }]);
    tx.sportsRegistrationMember.findFirst.mockResolvedValueOnce({
      id: 'other-team-assignment',
    });

    await expect(
      service.review('request-1', 'APPROVE', adminActor()),
    ).rejects.toThrow('outra equipe');

    expect(payments.ensureParticipant).not.toHaveBeenCalled();
    expect(tx.sportsIdentityClaim.update).not.toHaveBeenCalled();
  });

  it('enforces the tournament-wide multiple-team toggle even when a category does not tighten it', async () => {
    identities.reveal.mockReturnValueOnce('maria@example.com');
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        type: SportsTeamChangeRequestType.MEMBER_ADD,
        delta: { categoryIds: ['category-1'] },
        identityClaims: [
          {
            id: 'claim-1',
            type: SportsIdentityType.EMAIL,
            encryptedValue: 'encrypted-value',
          },
        ],
      }),
    );
    tx.sportsTournament.findFirst.mockResolvedValueOnce({
      id: 'tournament-1',
      allowPlayerMultipleTeams: false,
    });
    tx.sportsCategory.findMany.mockResolvedValueOnce([
      {
        id: 'category-1',
        allowPlayerMultipleTeams: null,
      },
    ]);
    tx.people.findMany.mockResolvedValueOnce([{ id: 'person-1' }]);
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce({
      id: 'other-team-member',
    });

    await expect(
      service.review('request-1', 'APPROVE', adminActor()),
    ).rejects.toThrow('outra equipe');

    expect(tx.sportsTeamMember.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        teamId: { not: 'team-1' },
        participant: expect.objectContaining({ personId: 'person-1' }),
      }),
      select: { id: true },
    });
    expect(payments.ensureParticipant).not.toHaveBeenCalled();
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
      update: jest.fn().mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          id: 'request-1',
          ...data,
        }),
      ),
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

function categoryRoleRequest(delta: {
  categoryRoleChanges: Array<Record<string, unknown>>;
}) {
  return reviewRequest({
    type: SportsTeamChangeRequestType.CATEGORY_ROLE,
    delta,
  });
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

function lifecycleRegistration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'registration-1',
    teamId: 'team-1',
    categoryId: 'category-1',
    revision: 4,
    status: SportsRegistrationStatus.ACTIVE,
    category: {
      id: 'category-1',
      tournamentId: 'tournament-1',
      status: 'ACTIVE',
      finishedAt: null,
      maximumCaptains: 2,
      maximumCoaches: 1,
      ...overrides,
    },
  };
}

function lifecycleAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assignment-1',
    teamMemberId: 'member-1',
    role: SportsRosterRole.PLAYER,
    eligibility: SportsEligibilityStatus.ELIGIBLE,
    teamMember: {
      status: SportsTeamMemberStatus.APPROVED,
      deletedAt: null,
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

