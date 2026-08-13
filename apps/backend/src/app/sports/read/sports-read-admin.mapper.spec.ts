import { sportsAdminReadRecords, sportsTestDate } from '../testing/sports-backend.fixtures';
import { SportsReadAdminMapper } from './sports-read-admin.mapper';

describe('SportsReadAdminMapper', () => {
  const mapper = new SportsReadAdminMapper();

  it('maps category, team, registration, stage, and match JSON fields from shared records', () => {
    const records = sportsAdminReadRecords();

    expect(mapper.mapAdminCategory(records.category as never)).toEqual(
      expect.objectContaining({ emoji: '🏅', scoreRulesJson: '{"win":3}', rosterRulesJson: '{}' }),
    );
    expect(mapper.mapAdminTeam(records.team as never)).toEqual(
      expect.objectContaining({
        logoUrl: '/api/sports/admin/teams/team-1/logo/logo-sha',
        fieldRevisionsJson: '{"name":2}',
      }),
    );
    expect(mapper.mapAdminTeam({ ...records.team, logoSha256: null } as never).logoUrl).toBeNull();
    expect(mapper.mapAdminRegistration(records.registration as never)).toEqual(
      expect.objectContaining({ formAnswersJson: '{"captain":true}', formSchemaSnapshotJson: null }),
    );
    expect(mapper.mapAdminStage({ id: 'stage-1', settings: { rounds: 2 } } as never).settingsJson).toBe('{"rounds":2}');
    expect(mapper.mapAdminMatch(records.match as never)).toEqual(
      expect.objectContaining({
        scoreboard: expect.objectContaining({ homeScore: 2, awayScore: 1, activePeriod: null }),
        canonicalScoreboard: expect.objectContaining({ homeScore: 1, awayScore: 1 }),
        occurrencesJson: '[{"type":"GOAL"}]',
        timerStartedAtUnixMs: records.match.timerStartedAt.getTime(),
        timerPausedAtUnixMs: null,
      }),
    );
  });

  it('preserves an invalid scoreboard for diagnosis without throwing', () => {
    expect(mapper.mapAdminScoreboard({ periods: 'invalid' } as never)).toEqual({
      homeScore: 0,
      awayScore: 0,
      activePeriod: null,
      periods: [],
      metadataJson: '{"invalidScoreboard":{"periods":"invalid"}}',
    });
    expect(
      mapper.mapAdminScoreboard({
        home: 2,
        away: 1,
        activePeriodNumber: 1,
        periods: [{ number: 1, label: '1º tempo', home: 2, away: 1, closed: false }],
      }),
    ).toEqual(
      expect.objectContaining({
        periods: [{ number: 1, label: '1º tempo', homeScore: 2, awayScore: 1, completed: false }],
      }),
    );
  });

  it('anonymizes people and deduplicates member category assignments with emoji fallback', () => {
    const member = mapper.mapAdminTeamMember({
      id: 'member-1',
      teamId: 'team-1',
      participantId: 'participant-1',
      status: 'APPROVED',
      revision: 2,
      participant: { person: { id: 'person-1', name: 'Ana Beatriz de Souza' } },
      categoryAssignments: [
        {
          id: 'assignment-1',
          registrationId: 'registration-1',
          categoryId: 'category-1',
          category: { name: 'Futsal', eventGroup: { emoji: '' } },
        },
        {
          id: 'assignment-duplicate',
          registrationId: 'registration-2',
          categoryId: 'category-1',
          category: { name: 'Futsal', eventGroup: { emoji: '⚽' } },
        },
      ],
    } as never);

    expect(member.person.name).toBe('Ana Souza');
    expect(member.categoryAssignments).toEqual([
      expect.objectContaining({ registrationId: 'registration-1', categoryEmoji: '🏅' }),
    ]);
    expect(
      mapper.mapAdminRepresentative({
        id: 'representative-1',
        teamId: 'team-1',
        personId: 'person-2',
        person: { id: 'person-2', name: 'Carlos Eduardo Lima' },
        active: true,
        assignedAt: sportsTestDate(-60_000),
        revokedAt: null,
      } as never).person.name,
    ).toBe('Carlos Lima');
  });

  it('maps change requests, registration members, rosters, and actions without leaking raw JSON objects', () => {
    expect(
      mapper.mapAdminChangeRequest({
        id: 'change-1',
        baseFieldRevisions: { name: 1 },
        delta: { set: { name: 'Nova' } },
        resolvedDelta: null,
      } as never),
    ).toEqual(
      expect.objectContaining({
        baseFieldRevisionsJson: '{"name":1}',
        deltaJson: '{"set":{"name":"Nova"}}',
        resolvedDeltaJson: null,
      }),
    );
    expect(
      mapper.mapAdminRegistrationMember({
        id: 'registration-member-1',
        registrationId: 'registration-1',
        categoryId: 'category-1',
        teamMemberId: 'member-1',
        role: 'PLAYER',
        eligibility: 'ELIGIBLE',
        category: { athleteIdentifierMode: 'NAME' },
        teamMember: { participant: { person: { id: 'person-1', name: 'Mariana Clara dos Santos' } } },
      } as never).person.name,
    ).toBe('Mariana Santos');
    expect(
      mapper.mapAdminRoster({
        id: 'roster-1',
        entries: [
          { id: 'entry-1', roleMetadata: { position: 'GOALKEEPER' } },
          { id: 'entry-2', roleMetadata: null },
        ],
      } as never).entries,
    ).toEqual([
      expect.objectContaining({ roleMetadataJson: '{"position":"GOALKEEPER"}' }),
      expect.objectContaining({ roleMetadataJson: null }),
    ]);
    expect(mapper.mapAdminAction({ id: 'action-1', payload: { side: 'HOME' } } as never).payloadJson).toBe(
      '{"side":"HOME"}',
    );
  });

  it('censors identity documents while keeping only the final four digits', () => {
    expect(mapper.censorIdentityDocument('123.456.789-00')).toBe('•••••••8900');
    expect(mapper.censorIdentityDocument('letters only')).toBeNull();
    expect(mapper.censorIdentityDocument(null)).toBeNull();
  });

  it('maps standings and preserves already-safe records without rebuilding them', () => {
    const tournament = { id: 'tournament-1' };
    const placement = { id: 'placement-1' };
    const official = { id: 'official-1' };
    const scoreEntry = { id: 'score-1' };
    expect(mapper.mapAdminTournament(tournament as never)).toBe(tournament);
    expect(mapper.mapAdminPlacement(placement as never)).toBe(placement);
    expect(mapper.mapAdminOfficial(official as never)).toBe(official);
    expect(mapper.mapAdminScoreEntry(scoreEntry as never)).toBe(scoreEntry);
    expect(mapper.mapAdminStanding({ id: 'standing-1', tiebreakData: { goals: 4 } } as never)).toEqual(
      expect.objectContaining({ tiebreakDataJson: '{"goals":4}' }),
    );
    expect(
      mapper.mapAdminChangeRequest({
        id: 'change-resolved',
        baseFieldRevisions: {},
        delta: {},
        resolvedDelta: { set: { name: 'Resolvida' } },
      } as never).resolvedDeltaJson,
    ).toBe('{"set":{"name":"Resolvida"}}');
  });
});
