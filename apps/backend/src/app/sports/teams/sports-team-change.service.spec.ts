import { BadRequestException, ConflictException } from '@nestjs/common';
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

describe('SportsTeamChangeService representative queue', () => {
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
  let prisma: { $transaction: jest.Mock };
  let service: SportsTeamChangeService;

  beforeEach(() => {
    jest.clearAllMocks();
    tx = createTransaction();
    prisma = {
      $transaction: jest.fn(
        (callback: (transaction: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    service = new SportsTeamChangeService(
      prisma as never,
      identities as never,
      payments as never,
      auditLog as never,
    );
  });

  it('rejects approval when the tournament was finalized after submission', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue(
      reviewRequest({
        team: {
          ...reviewRequest().team,
          tournament: {
            ...reviewRequest().team.tournament,
            status: SportsTournamentStatus.FINISHED,
            finishedAt: new Date('2026-07-29T12:00:00.000Z'),
            deletedAt: null,
          },
        },
      }),
    );

    await expect(
      service.review('request-1', 'APPROVE', adminActor()),
    ).rejects.toThrow(
      'Solicitações de equipes não podem ser aprovadas em um torneio finalizado ou cancelado.',
    );
    expect(tx.sportsTeam.updateMany).not.toHaveBeenCalled();
  });

  it('rejects trusted logo metadata when the key digest differs from sha256', async () => {
    const keyDigest = 'a'.repeat(64);
    const declaredDigest = 'b'.repeat(64);

    await expect(
      service.submit(
        'team-1',
        'person-1',
        {
          type: SportsTeamChangeRequestType.TEAM_DETAILS,
          baseRevision: 7,
          delta: {
            logo: {
              objectKey: `sports/tournaments/tournament-1/teams/team-1/logos/sha256/${keyDigest}.png`,
              sha256: declaredDigest,
              mimeType: 'image/png',
              sizeBytes: 100,
            },
          },
        },
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects trusted logo metadata when the extension differs from its MIME type', async () => {
    const digest = 'a'.repeat(64);

    await expect(
      service.submit(
        'team-1',
        'person-1',
        {
          type: SportsTeamChangeRequestType.TEAM_DETAILS,
          baseRevision: 7,
          delta: {
            logo: {
              objectKey: `sports/tournaments/tournament-1/teams/team-1/logos/sha256/${digest}.jpg`,
              sha256: digest,
              mimeType: 'image/png',
              sizeBytes: 100,
            },
          },
        },
        true,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('merges new field deltas into the queued request with request-level CAS', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      teamId: 'team-1',
      submittedByPersonId: 'person-1',
      type: SportsTeamChangeRequestType.TEAM_DETAILS,
      status: SportsTeamChangeRequestStatus.PENDING,
      requestRevision: 2,
      baseRevision: 7,
      delta: {
        set: { name: 'Equipe Original' },
        categoryIds: ['category-1'],
      },
      pendingKey: 'team-1:person-1:TEAM_DETAILS',
    });

    await service.submit('team-1', 'person-1', {
      type: SportsTeamChangeRequestType.TEAM_DETAILS,
      baseRevision: 7,
      expectedRequestRevision: 2,
      delta: {
        set: { institution: 'Universidade Nova' },
      },
    });

    expect(tx.sportsTeamChangeRequest.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'request-1',
        requestRevision: 2,
        status: {
          in: [
            SportsTeamChangeRequestStatus.PENDING,
            SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
            SportsTeamChangeRequestStatus.CONFLICT,
          ],
        },
      },
      data: {
        delta: {
          set: {
            name: 'Equipe Original',
            institution: 'Universidade Nova',
          },
          categoryIds: ['category-1'],
        },
        status: SportsTeamChangeRequestStatus.PENDING,
        reviewMessage: null,
        requestRevision: { increment: 1 },
      },
    });
  });

  it('rejects a stale queued-form revision without overwriting newer edits', async () => {
    tx.sportsTeamChangeRequest.findUnique.mockResolvedValue({
      id: 'request-1',
      requestRevision: 4,
      delta: { set: { name: 'Versão mais nova' } },
    });

    await expect(
      service.submit('team-1', 'person-1', {
        type: SportsTeamChangeRequestType.TEAM_DETAILS,
        baseRevision: 7,
        expectedRequestRevision: 3,
        delta: { set: { institution: 'Valor antigo' } },
      }),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsTeamChangeRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.sportsIdentityClaim.upsert).not.toHaveBeenCalled();
  });

  it('rejects a stale team base revision before creating or merging a request', async () => {
    await expect(
      service.submit('team-1', 'person-1', {
        type: SportsTeamChangeRequestType.TEAM_DETAILS,
        baseRevision: 6,
        delta: { set: { name: 'Equipe antiga' } },
      }),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsTeamChangeRequest.findUnique).not.toHaveBeenCalled();
    expect(tx.sportsTeamChangeRequest.create).not.toHaveBeenCalled();
  });

  it('queues protected identity hints without resolving or exposing people to the representative', async () => {
    const result = await service.submit('team-1', 'person-1', {
      type: SportsTeamChangeRequestType.MEMBER_ADD,
      baseRevision: 7,
      delta: { categoryIds: ['category-1'] },
      identities: [
        {
          clientKey: 'person_local_01',
          type: SportsIdentityType.EMAIL,
          value: 'maria@example.com',
        },
      ],
    });

    expect(identities.protect).toHaveBeenCalledWith(
      SportsIdentityType.EMAIL,
      'maria@example.com',
    );
    expect(tx.sportsIdentityClaim.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          requestId: 'request-new',
          clientKey: 'person_local_01',
          encryptedValue: expect.stringContaining('encrypted:'),
          lookupHash: expect.stringContaining('hash:'),
          displayHint: 'ma***@example.com',
        }),
      }),
    );
    expect(tx.people.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'request-new',
      teamId: 'team-1',
      type: SportsTeamChangeRequestType.MEMBER_ADD,
      status: SportsTeamChangeRequestStatus.PENDING,
      requestRevision: 1,
      baseRevision: 7,
      delta: { categoryIds: ['category-1'] },
      reviewMessage: null,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
      identityClaims: [
        {
          id: 'claim-1',
          clientKey: 'person_local_01',
          type: SportsIdentityType.EMAIL,
          displayHint: 'ma***@example.com',
          status: SportsIdentityClaimStatus.PENDING,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('maria@example.com');
    expect(JSON.stringify(result)).not.toContain('encrypted');
    expect(JSON.stringify(result)).not.toContain('lookupHash');
  });

  it('detects targeted field drift during approval without treating unrelated fields as conflicts', async () => {
    let transactionCommitted = false;
    prisma.$transaction.mockImplementationOnce(
      async (callback: (transaction: typeof tx) => Promise<unknown>) => {
        const result = await callback(tx);
        transactionCommitted = true;
        return result;
      },
    );
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
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce(
      lifecycleMember({ revision: 3 }),
    );

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
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce(
      lifecycleMember({ revision: 3 }),
    );

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
    tx.sportsTeamMember.findFirst.mockResolvedValueOnce(
      lifecycleMember({ revision: 3 }),
    );
    tx.sportsTeamMember.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.review('request-1', 'APPROVE', adminActor()),
    ).rejects.toThrow(ConflictException);

    expect(tx.sportsRegistrationMember.updateMany).not.toHaveBeenCalled();
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
