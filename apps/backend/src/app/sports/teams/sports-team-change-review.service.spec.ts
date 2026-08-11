import { ConflictException } from '@nestjs/common';
import {
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { SportsTeamChangeService } from './sports-team-change.service';

describe('SportsTeamChangeService review concurrency', () => {
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
  const s3 = {
    deleteFile: jest.fn(),
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
    service = new SportsTeamChangeService(
      prisma as never,
      identities as never,
      payments as never,
      auditLog as never,
      s3 as never,
    );
  });
  it('detects targeted field drift during approval without treating unrelated fields as conflicts', async () => {
    let transactionCommitted = false;
    prisma.$transaction.mockImplementationOnce(async (callback: (transaction: typeof tx) => Promise<unknown>) => {
      const result = await callback(tx);
      transactionCommitted = true;
      return result;
    });
    const request = reviewRequest({
      baseFieldRevisions: { name: 1, institution: 1 },
      delta: { set: { name: 'Nome solicitado' } },
      team: {
        ...reviewRequest().team,
        revision: 3,
        fieldRevisions: { name: 3, institution: 2 },
      },
    });
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(request);

    await expect(
      service.review('request-1', 'APPROVE', adminActor(), {
        expectedRequestRevision: 1,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        conflictingFields: ['name'],
      }),
    });

    expect(tx.sportsTeam.updateMany).not.toHaveBeenCalled();
    expect(transactionCommitted).toBe(true);
    expect(tx.sportsTeamChangeRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: SportsTeamChangeRequestStatus.CONFLICT,
        }),
      }),
    );
  });

  it('uses a team revision CAS when an administrator approves a non-conflicting delta', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        baseFieldRevisions: { name: 1, institution: 1 },
        delta: { set: { institution: 'Nova instituição' } },
        team: {
          ...reviewRequest().team,
          revision: 3,
          fieldRevisions: { name: 3, institution: 1 },
        },
      }),
    );

    await service.review('request-1', 'APPROVE', adminActor(), {
      expectedRequestRevision: 1,
    });

    expect(tx.sportsTeam.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'team-1',
        revision: 3,
        deletedAt: null,
      },
      data: {
        institution: 'Nova instituição',
        revision: { increment: 1 },
        fieldRevisions: { name: 3, institution: 4 },
        updatedById: 'admin-1',
      },
    });
  });

  it('lets an administrator explicitly force a reviewed field conflict', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        baseFieldRevisions: { name: 1 },
        delta: { set: { name: 'Nome revisado' } },
        team: {
          ...reviewRequest().team,
          revision: 3,
          fieldRevisions: { name: 3 },
        },
      }),
    );

    await service.review('request-1', 'APPROVE', adminActor(), {
      expectedRequestRevision: 1,
      forceConflicts: true,
    });

    expect(tx.sportsTeam.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'team-1', revision: 3, deletedAt: null },
        data: expect.objectContaining({ name: 'Nome revisado' }),
      }),
    );
  });

  it('merges child deltas by explicit member ID without dropping other queued edits', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      teamId: 'team-1',
      submittedByPersonId: 'person-1',
      type: SportsTeamChangeRequestType.MEMBER_UPDATE,
      status: SportsTeamChangeRequestStatus.PENDING,
      requestRevision: 2,
      baseRevision: 7,
      delta: {
        memberChanges: [
          {
            teamMemberId: 'member-1',
            expectedRevision: 2,
            status: SportsTeamMemberStatus.SUSPENDED,
          },
        ],
      },
      pendingKey: 'team-1:person-1:MEMBER_UPDATE',
    });

    await service.submit('team-1', 'person-1', {
      type: SportsTeamChangeRequestType.MEMBER_UPDATE,
      baseRevision: 7,
      expectedRequestRevision: 2,
      delta: {
        memberChanges: [
          {
            teamMemberId: 'member-2',
            expectedRevision: 5,
            status: SportsTeamMemberStatus.WITHDRAWN,
          },
        ],
      },
    });

    expect(tx.sportsTeamChangeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          delta: expect.objectContaining({
            memberChanges: [
              {
                teamMemberId: 'member-1',
                expectedRevision: 2,
                status: SportsTeamMemberStatus.SUSPENDED,
              },
              {
                teamMemberId: 'member-2',
                expectedRevision: 5,
                status: SportsTeamMemberStatus.WITHDRAWN,
              },
            ],
          }),
        }),
      }),
    );
  });

  it('blocks new representative edits after the tournament is finished', async () => {
    tx.sportsTeam.findFirst.mockResolvedValueOnce({
      id: 'team-1',
      name: 'Equipe A',
      revision: 7,
      fieldRevisions: {},
      tournament: {
        id: 'tournament-1',
        majorEventId: 'major-event-1',
        status: SportsTournamentStatus.FINISHED,
        finishedAt: new Date('2026-07-29T12:00:00.000Z'),
        deletedAt: null,
      },
    });

    await expect(
      service.submit('team-1', 'person-1', {
        type: SportsTeamChangeRequestType.MEMBER_REMOVE,
        baseRevision: 7,
        delta: {
          memberChanges: [
            {
              teamMemberId: 'member-1',
              expectedRevision: 2,
            },
          ],
        },
      }),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsTeamChangeRequest.create).not.toHaveBeenCalled();
  });

  it('does not fail a reviewed logo decision when queued-object cleanup is unavailable', async () => {
    const sha256 = 'a'.repeat(64);
    const logo = {
      objectKey: `sports/tournaments/tournament-1/teams/team-1/logos/sha256/${sha256}.avif`,
      queuedObjectKey: `sports/private/team-logo-review/team-1/request-1/${sha256}.avif`,
      sha256,
      mimeType: 'image/avif',
      sizeBytes: 100,
    };
    const request = reviewRequest({
      type: SportsTeamChangeRequestType.LOGO,
      delta: { logo },
    });
    prisma.sportsTeamChangeRequest.findUnique.mockResolvedValue({
      type: SportsTeamChangeRequestType.LOGO,
      status: SportsTeamChangeRequestStatus.PENDING,
      delta: { logo },
    });
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(request);
    tx.sportsTeamChangeRequest.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'request-1',
      ...data,
    }));
    s3.deleteFile.mockRejectedValue(new Error('temporary storage failure'));

    await expect(service.review('request-1', 'REJECT', adminActor())).resolves.toBeDefined();

    expect(s3.deleteFile).toHaveBeenCalledWith(logo.queuedObjectKey);
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

function adminActor() {
  return {
    sub: 'admin-1',
    token: 'token',
    permissionSet: new Set<string>(),
  } as never;
}
