import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTournamentStatus,
} from '@prisma/client';
import { SportsTeamChangeService } from './sports-team-change.service';

describe('SportsTeamChangeService submission queue', () => {
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

    await expect(service.review('request-1', 'APPROVE', adminActor())).rejects.toThrow(
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

    expect(identities.protect).toHaveBeenCalledWith(SportsIdentityType.EMAIL, 'maria@example.com');
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
