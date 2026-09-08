import { ConflictException } from '@nestjs/common';
import { moveSportsPersonRelations, moveSportsTeamRepresentatives } from './sports-representatives';

describe('sports representative merge relations', () => {
  it('moves a source-only representative to the target person without changing rights', async () => {
    const tx = createTransaction();
    const source = representative({ active: false, revokedAt: new Date(Date.now() - 1_000), revokedById: 'admin-1' });
    tx.sportsTeamRepresentative.findMany
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([]);

    const result = await moveSportsTeamRepresentatives(tx as never, 'target-person', 'source-person');

    expect(result.movedSportsTeamRepresentativeIds).toEqual([source.id]);
    expect(result.revokedSportsTeamRepresentativeIds).toEqual([]);
    expect(result.sportsTeamRepresentativeSnapshots[0]).toEqual(
      expect.objectContaining({
        id: source.id,
        personId: 'source-person',
        active: false,
        revokedById: 'admin-1',
        mergeRevokedAt: null,
        mergeRevokedById: null,
        mergeTargetRepresentativeId: null,
      }),
    );
    expect(tx.sportsTeamRepresentative.update).toHaveBeenCalledWith({
      where: { id: source.id },
      data: { personId: 'target-person' },
    });
  });

  it('keeps the target active role and revokes the duplicate source role', async () => {
    const tx = createTransaction();
    const source = representative();
    const target = representative({ id: 'target-representative', personId: 'target-person' });
    tx.sportsTeamRepresentative.findMany
      .mockResolvedValueOnce([source])
      .mockResolvedValueOnce([target]);

    const result = await moveSportsTeamRepresentatives(tx as never, 'target-person', 'source-person', 'merge-actor');

    expect(result.movedSportsTeamRepresentativeIds).toEqual([]);
    expect(result.revokedSportsTeamRepresentativeIds).toEqual([source.id]);
    expect(result.sportsTeamRepresentativeSnapshots[0]).toEqual(
      expect.objectContaining({
        id: source.id,
        active: true,
        mergeRevokedById: 'merge-actor',
        mergeRevokedAt: expect.any(String),
      }),
    );
    expect(tx.sportsTeamRepresentative.update).toHaveBeenCalledWith({
      where: { id: source.id },
      data: {
        active: false,
        revokedAt: expect.any(Date),
        revokedById: 'merge-actor',
      },
    });
  });

  it('rejects an active source role when the target has a revoked role for the same team', async () => {
    const tx = createTransaction();
    tx.sportsTeamRepresentative.findMany
      .mockResolvedValueOnce([representative()])
      .mockResolvedValueOnce([
        representative({
          id: 'target-representative',
          personId: 'target-person',
          active: false,
          revokedAt: new Date(Date.now() - 1_000),
          revokedById: 'admin-1',
        }),
      ]);

    await expect(moveSportsTeamRepresentatives(tx as never, 'target-person', 'source-person')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.sportsTeamRepresentative.update).not.toHaveBeenCalled();
  });

  it('moves a source-only tournament participant and official assignment with stable ids', async () => {
    const tx = createTransaction();
    const participant = {
      id: 'participant-1',
      tournamentId: 'tournament-1',
      personId: 'source-person',
      deletedAt: null,
    };
    const assignment = officialAssignment();
    tx.sportsTournamentParticipant.findMany
      .mockResolvedValueOnce([participant])
      .mockResolvedValueOnce([]);
    tx.sportsOfficialAssignment.findMany
      .mockResolvedValueOnce([assignment])
      .mockResolvedValueOnce([]);

    const result = await moveSportsPersonRelations(tx as never, 'target-person', 'source-person');

    expect(result.movedSportsTournamentParticipantIds).toEqual([participant.id]);
    expect(result.movedSportsOfficialAssignmentIds).toEqual([assignment.id]);
    expect(tx.sportsTournamentParticipant.update).toHaveBeenCalledWith({
      where: { id: participant.id },
      data: { personId: 'target-person' },
    });
    expect(tx.sportsOfficialAssignment.update).toHaveBeenCalledWith({
      where: { id: assignment.id },
      data: { personId: 'target-person' },
    });
  });

  it('rejects a source participant that conflicts with an existing target participant', async () => {
    const tx = createTransaction();
    tx.sportsTournamentParticipant.findMany
      .mockResolvedValueOnce([{ id: 'source-participant', tournamentId: 'tournament-1', personId: 'source-person', deletedAt: null }])
      .mockResolvedValueOnce([{ tournamentId: 'tournament-1' }]);

    await expect(moveSportsPersonRelations(tx as never, 'target-person', 'source-person')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.sportsTournamentParticipant.update).not.toHaveBeenCalled();
  });

  it('rejects an active source official assignment when the target scope is revoked', async () => {
    const tx = createTransaction();
    tx.sportsOfficialAssignment.findMany
      .mockResolvedValueOnce([officialAssignment()])
      .mockResolvedValueOnce([
        officialAssignment({
          id: 'target-assignment',
          personId: 'target-person',
          active: false,
          revokedAt: new Date(Date.now() - 1_000),
          revokedById: 'admin-1',
        }),
      ]);

    await expect(moveSportsPersonRelations(tx as never, 'target-person', 'source-person')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(tx.sportsOfficialAssignment.update).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked first', false],
    ['active first', true],
  ])('handles mixed target official history regardless of row order (%s)', async (_label, activeFirst) => {
    const tx = createTransaction();
    const activeTarget = officialAssignment({ id: 'target-active', personId: 'target-person' });
    const revokedTarget = officialAssignment({
      id: 'target-revoked',
      personId: 'target-person',
      active: false,
      revokedAt: new Date(Date.now() - 1_000),
      revokedById: 'admin-1',
    });
    tx.sportsOfficialAssignment.findMany
      .mockResolvedValueOnce([officialAssignment()])
      .mockResolvedValueOnce(activeFirst ? [activeTarget, revokedTarget] : [revokedTarget, activeTarget]);

    await expect(moveSportsPersonRelations(tx as never, 'target-person', 'source-person')).resolves.toEqual(
      expect.objectContaining({ movedSportsOfficialAssignmentIds: ['source-assignment'] }),
    );
  });
});

function createTransaction() {
  return {
    sportsTeamRepresentative: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    sportsTournamentParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    sportsOfficialAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  };
}

function representative(
  overrides: Partial<{
    id: string;
    teamId: string;
    personId: string;
    active: boolean;
    assignedAt: Date;
    assignedById: string;
    revokedAt: Date | null;
    revokedById: string | null;
    createdAt: Date;
  }> = {},
) {
  const now = new Date();
  return {
    id: 'source-representative',
    teamId: 'team-1',
    personId: 'source-person',
    active: true,
    assignedAt: now,
    assignedById: 'admin-1',
    revokedAt: null,
    revokedById: null,
    createdAt: now,
    ...overrides,
  };
}

function officialAssignment(
  overrides: Partial<{
    id: string;
    tournamentId: string;
    categoryId: string | null;
    matchId: string | null;
    personId: string;
    role: string;
    active: boolean;
    assignedAt: Date;
    assignedById: string;
    revokedAt: Date | null;
    revokedById: string | null;
    revision: number;
    createdAt: Date;
  }> = {},
) {
  const now = new Date();
  return {
    id: 'source-assignment',
    tournamentId: 'tournament-1',
    categoryId: 'category-1',
    matchId: 'match-1',
    personId: 'source-person',
    role: 'REFEREE',
    active: true,
    assignedAt: now,
    assignedById: 'admin-1',
    revokedAt: null,
    revokedById: null,
    revision: 1,
    createdAt: now,
    ...overrides,
  };
}
