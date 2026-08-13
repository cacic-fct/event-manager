import { SportsReadPublicLoader } from './sports-read-public.loader';
import {
  sportsPublicOfficialAssignmentRecord,
  sportsPublicRosterRecord,
  sportsPublicTeamRecord,
} from '../testing/sports-backend.fixtures';

describe('SportsReadPublicLoader', () => {
  const prisma = {
    sportsMatchRoster: { findMany: jest.fn() },
    sportsCategory: { findUnique: jest.fn() },
    sportsOfficialAssignment: { findMany: jest.fn() },
  };
  const mapper = { mapPublicTeam: jest.fn((team) => ({ id: team.id, name: team.name })) };
  let loader: SportsReadPublicLoader;

  beforeEach(() => {
    jest.clearAllMocks();
    loader = new SportsReadPublicLoader(prisma as never, mapper as never);
  });

  it('avoids roster queries when no matches were requested', async () => {
    await expect(loader.loadPublicRosters([])).resolves.toEqual(new Map());
    expect(prisma.sportsMatchRoster.findMany).not.toHaveBeenCalled();
  });

  it('loads approved rosters, anonymizes player names, and groups teams by match', async () => {
    prisma.sportsMatchRoster.findMany.mockResolvedValue([
      sportsPublicRosterRecord({
        registration: { team: sportsPublicTeamRecord({ id: 'team-1', name: 'Equipe Azul' }) },
      }),
      sportsPublicRosterRecord({
        registration: { team: sportsPublicTeamRecord({ id: 'team-2', name: 'Equipe Verde' }) },
        entries: [
          {
            role: 'COACH',
            registrationMember: {
              category: { athleteIdentifierMode: 'NAME' },
              teamMember: { participant: { person: { name: 'Bruno Lima' } } },
            },
          },
        ],
      }),
    ]);

    const result = await loader.loadPublicRosters(['match-1']);

    expect(prisma.sportsMatchRoster.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ matchId: { in: ['match-1'] }, deletedAt: null }),
      }),
    );
    expect(result.get('match-1')).toEqual([
      {
        team: { id: 'team-1', name: 'Equipe Azul' },
        entries: [
          {
            name: 'Ana Souza',
            role: 'PLAYER',
            athleteIdentifierMode: 'NAME',
            shirtNumber: null,
            gameNickname: null,
            gameAccountName: null,
            gameAccountUrl: null,
          },
        ],
      },
      {
        team: { id: 'team-2', name: 'Equipe Verde' },
        entries: [
          {
            name: 'Bruno Lima',
            role: 'COACH',
            athleteIdentifierMode: 'NAME',
            shirtNumber: null,
            gameNickname: null,
            gameAccountName: null,
            gameAccountUrl: null,
          },
        ],
      },
    ]);
  });

  it('returns no officials when the category no longer exists', async () => {
    prisma.sportsCategory.findUnique.mockResolvedValue(null);

    await expect(loader.loadPublicOfficials('category-1', ['match-1'])).resolves.toEqual(new Map());
    expect(prisma.sportsOfficialAssignment.findMany).not.toHaveBeenCalled();
  });

  it('loads category officials through the owning tournament', async () => {
    prisma.sportsCategory.findUnique.mockResolvedValue({ tournamentId: 'tournament-1' });
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([]);

    await expect(loader.loadPublicOfficials('category-1', ['match-1'])).resolves.toEqual(
      new Map([['match-1', []]]),
    );
    expect(prisma.sportsOfficialAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tournamentId: 'tournament-1' }) }),
    );
  });

  it('avoids assignment queries when no matches were requested', async () => {
    await expect(loader.loadPublicOfficialsForTournament('tournament-1', [])).resolves.toEqual(new Map());
    expect(prisma.sportsOfficialAssignment.findMany).not.toHaveBeenCalled();
  });

  it('combines tournament, category, and match officials without leaking duplicates or unrelated scopes', async () => {
    prisma.sportsOfficialAssignment.findMany.mockResolvedValue([
      sportsPublicOfficialAssignmentRecord(),
      sportsPublicOfficialAssignmentRecord({ categoryId: 'category-1', role: 'TABLE', person: { name: 'Daniel Souza' } }),
      sportsPublicOfficialAssignmentRecord({ categoryId: 'category-2', role: 'TABLE', person: { name: 'Outra Pessoa' } }),
      sportsPublicOfficialAssignmentRecord({ categoryId: 'category-1', matchId: 'match-1' }),
      sportsPublicOfficialAssignmentRecord({ categoryId: 'category-1', matchId: 'match-2', person: { name: 'Elisa Rocha' } }),
    ]);

    const result = await loader.loadPublicOfficialsForTournament('tournament-1', [
      { id: 'match-1', categoryId: 'category-1' },
      { id: 'match-2', categoryId: 'category-2' },
    ]);

    expect(result.get('match-1')).toEqual([
      { name: 'Carlos S.', role: 'REFEREE' },
      { name: 'Daniel S.', role: 'TABLE' },
    ]);
    expect(result.get('match-2')).toEqual([
      { name: 'Carlos S.', role: 'REFEREE' },
      { name: 'Outra P.', role: 'TABLE' },
      { name: 'Elisa R.', role: 'REFEREE' },
    ]);
    expect(prisma.sportsOfficialAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tournamentId: 'tournament-1',
          active: true,
          revokedAt: null,
          OR: expect.any(Array),
        }),
      }),
    );
  });
});
