import { NotFoundException } from '@nestjs/common';
import { sportsPublicTeamRecord, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsReadRepresentativeService } from './sports-read-representative.service';

describe('SportsReadRepresentativeService', () => {
  const prisma = {
    sportsTeam: { findFirst: jest.fn() },
    sportsTeamMember: { findMany: jest.fn() },
    sportsRegistration: { findMany: jest.fn() },
    sportsMatch: { findMany: jest.fn() },
    sportsPlayerApplication: { count: jest.fn() },
  };
  const publicReader = { mapPublicTeam: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.sportsTeamMember.findMany.mockResolvedValue([]);
    prisma.sportsRegistration.findMany.mockResolvedValue([]);
    prisma.sportsMatch.findMany.mockResolvedValue([]);
  });

  it('returns only the count of organization-reviewable applications for the team', async () => {
    prisma.sportsTeam.findFirst.mockResolvedValue({
      id: 'team-1',
      name: 'Equipe 1',
      institution: null,
      logoSha256: null,
      revision: 3,
      changeRequests: [],
    });
    prisma.sportsPlayerApplication.count.mockResolvedValue(4);

    const service = new SportsReadRepresentativeService(prisma as never, publicReader as never);
    const result = await service.representativeTeamWorkspace('team-1', 'person-1');

    expect(prisma.sportsPlayerApplication.count).toHaveBeenCalledWith({
      where: {
        requestedTeamId: 'team-1',
        status: { in: ['PENDING', 'CHANGES_REQUESTED'] },
        deletedAt: null,
        tournament: { deletedAt: null },
        requestedTeam: { deletedAt: null },
        applicantPerson: { deletedAt: null },
      },
    });
    expect(result.joinQueueCount).toBe(4);
    expect(result).not.toHaveProperty('joinQueue');
  });

  it('reports a team that is missing or not actively represented as not found', async () => {
    prisma.sportsTeam.findFirst.mockResolvedValue(null);

    await expect(
      new SportsReadRepresentativeService(prisma as never, publicReader as never).representativeTeamWorkspace(
        'team-hidden',
        'person-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.sportsTeamMember.findMany).not.toHaveBeenCalled();
  });

  it('maps representative-safe workspace details and strips private logo delta fields', async () => {
    const startDate = sportsTestDate(60 * 60_000);
    const endDate = sportsTestDate(2 * 60 * 60_000);
    prisma.sportsTeam.findFirst.mockResolvedValue({
      ...sportsPublicTeamRecord({ id: 'team-1', logoSha256: 'public-sha' }),
      revision: 4,
      changeRequests: [
        {
          id: 'change-1',
          type: 'TEAM_DETAILS',
          status: 'PENDING',
          requestRevision: 2,
          baseRevision: 3,
          delta: {
            set: { name: 'Equipe renovada' },
            categoryIds: ['category-1'],
            memberChanges: [{ clientKey: 'member-1' }],
            categoryRoleChanges: [],
            logo: { sha256: 'new-sha', mimeType: 'image/png', sizeBytes: 123, privateObjectKey: 'secret' },
            internalNote: 'must not leak',
          },
          reviewMessage: null,
          updatedAt: sportsTestDate(-60_000),
          identityClaims: [{ clientKey: 'member-1', type: 'EMAIL', displayHint: 'a•••@example.com' }],
        },
      ],
    });
    prisma.sportsTeamMember.findMany.mockResolvedValue([
      {
        id: 'member-1',
        status: 'APPROVED',
        revision: 2,
        participant: { person: { name: 'Nome completo autorizado' } },
        categoryAssignments: [
          {
            registrationId: 'registration-1',
            categoryId: 'category-1',
            role: 'PLAYER',
            eligibility: 'ELIGIBLE',
            category: { name: 'Futsal' },
          },
        ],
      },
    ]);
    prisma.sportsRegistration.findMany.mockResolvedValue([
      {
        id: 'registration-1',
        categoryId: 'category-1',
        status: 'APPROVED',
        category: { name: 'Futsal', eventGroup: { emoji: '' } },
      },
    ]);
    prisma.sportsMatch.findMany.mockResolvedValue([
      {
        id: 'match-1',
        eventId: 'event-1',
        state: 'SCHEDULED',
        categoryId: 'category-1',
        category: { name: 'Futsal', eventGroup: { emoji: '' } },
        homeRegistrationId: 'registration-1',
        awayRegistrationId: null,
        homeRegistration: { team: sportsPublicTeamRecord({ id: 'team-1' }) },
        awayRegistration: null,
        event: { startDate, endDate },
      },
    ]);
    prisma.sportsPlayerApplication.count.mockResolvedValue(2);
    publicReader.mapPublicTeam.mockImplementation((team) => ({ id: team.id, name: team.name }));

    const result = await new SportsReadRepresentativeService(
      prisma as never,
      publicReader as never,
    ).representativeTeamWorkspace('team-1', 'person-1');

    expect(result.team.logoUrl).toBe('/api/sports/teams/team-1/logo/public-sha');
    expect(result.registrations[0]?.categoryEmoji).toBe('🏅');
    expect(result.matches[0]).toEqual(
      expect.objectContaining({ categoryEmoji: '🏅', homeTeam: expect.objectContaining({ id: 'team-1' }), awayTeam: null }),
    );
    expect(JSON.parse(result.queuedChanges[0]?.deltaJson ?? '{}')).toEqual({
      set: { name: 'Equipe renovada' },
      categoryIds: ['category-1'],
      memberChanges: [{ clientKey: 'member-1' }],
      categoryRoleChanges: [],
      logo: { sha256: 'new-sha', mimeType: 'image/png', sizeBytes: 123 },
    });
    expect(result.queuedChanges[0]?.deltaJson).not.toContain('privateObjectKey');
    expect(result.queuedChanges[0]?.deltaJson).not.toContain('internalNote');
  });

  it.each([null, 'invalid', [], 4])('serializes malformed representative deltas as an empty object', async (delta) => {
    prisma.sportsTeam.findFirst.mockResolvedValue({
      ...sportsPublicTeamRecord({ id: 'team-1', logoSha256: null }),
      revision: 1,
      changeRequests: [
        {
          id: 'change-1',
          type: 'TEAM_DETAILS',
          status: 'PENDING',
          requestRevision: 1,
          baseRevision: 1,
          delta,
          reviewMessage: null,
          updatedAt: sportsTestDate(),
          identityClaims: [],
        },
      ],
    });
    prisma.sportsPlayerApplication.count.mockResolvedValue(0);

    const result = await new SportsReadRepresentativeService(
      prisma as never,
      publicReader as never,
    ).representativeTeamWorkspace('team-1', 'person-1');
    expect(result.queuedChanges[0]?.deltaJson).toBe('{}');
  });
});
