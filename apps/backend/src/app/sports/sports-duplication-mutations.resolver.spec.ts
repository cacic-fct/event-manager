import { Permission } from '@cacic-fct/shared-permissions';
import { BadRequestException } from '@nestjs/common';
import { SportsDuplicationMutationsResolver } from './sports-duplication-mutations.resolver';
import { SportsMutationsResolverSupport } from './sports-mutations-resolver.support';

class TestSportsMutationsSupport extends SportsMutationsResolverSupport {
  teamChange(requestId: string, actor: unknown) {
    return this.assertTeamChangeReviewMutable(requestId, actor as never);
  }
  application(applicationId: string, actor: unknown) {
    return this.assertPlayerApplicationReviewMutable(applicationId, actor as never);
  }
  action(actionId: string, actor: unknown) {
    return this.assertMatchActionReviewMutable(actionId, actor as never);
  }
  roster(rosterId: string, actor: unknown) {
    return this.assertRosterReviewMutable(rosterId, actor as never);
  }
  publish(entity: never, mutation: Promise<{ id: string }>, includePublic: boolean) {
    return this.publishMutation(entity, mutation, includePublic);
  }
  matchId(input: unknown) {
    return this.singleMatchId(input as never);
  }
  json(value: string, label = 'campo') {
    return this.parseJson(value, label);
  }
  object(value: string, label = 'campo') {
    return this.parseObject(value, label);
  }
  timer(value?: string) {
    return this.parseTimerRules(value);
  }
  scoring(value?: string) {
    return this.parseOverallScoringRules(value);
  }
  string(value: unknown) {
    return this.readString(value);
  }
}

describe('SportsMutationsResolverSupport', () => {
  const actor = { sub: 'actor-1' };
  const policy = { assertPermissions: jest.fn() };
  const frozen = { assertMajorEventMutable: jest.fn(), assertEventMutable: jest.fn() };
  const prisma = {
    sportsTeamChangeRequest: { findUnique: jest.fn() },
    sportsPlayerApplication: { findUnique: jest.fn() },
    sportsMatchAction: { findUnique: jest.fn() },
    sportsMatchRoster: { findUnique: jest.fn() },
    sportsMatch: { findUnique: jest.fn() },
  };
  const currentUser = { getAuthenticatedUser: jest.fn().mockReturnValue(actor) };
  const mutationEvents = { publishForEntity: jest.fn() };
  let service: TestSportsMutationsSupport;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TestSportsMutationsSupport(
      policy as never,
      frozen as never,
      prisma as never,
      currentUser as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      mutationEvents as never,
    );
  });

  it('enforces mutable scopes for review targets when they exist', async () => {
    prisma.sportsTeamChangeRequest.findUnique.mockResolvedValue({ team: { tournament: { majorEventId: 'major-1' } } });
    prisma.sportsPlayerApplication.findUnique.mockResolvedValue({
      tournament: { majorEventId: 'major-1' },
      categoryChoices: [{ categoryId: 'category-1' }, { categoryId: 'category-2' }],
    });
    prisma.sportsMatchAction.findUnique.mockResolvedValue({ matchId: 'match-1' });
    prisma.sportsMatchRoster.findUnique.mockResolvedValue({ matchId: 'match-2' });
    prisma.sportsMatch.findUnique
      .mockResolvedValueOnce({ eventId: 'event-1' })
      .mockResolvedValueOnce({ eventId: 'event-2' });

    await service.teamChange('request-1', actor);
    await service.application('application-1', actor);
    await service.action('action-1', actor);
    await service.roster('roster-1', actor);

    expect(policy.assertPermissions).toHaveBeenCalledTimes(2);
    expect(frozen.assertMajorEventMutable).toHaveBeenCalledTimes(2);
    expect(frozen.assertEventMutable).toHaveBeenNthCalledWith(1, 'event-1', actor, 'edit');
    expect(frozen.assertEventMutable).toHaveBeenNthCalledWith(2, 'event-2', actor, 'edit');
  });

  it('treats missing review targets and matches as no-op guards', async () => {
    prisma.sportsTeamChangeRequest.findUnique.mockResolvedValue(null);
    prisma.sportsPlayerApplication.findUnique.mockResolvedValue(null);
    prisma.sportsMatchAction.findUnique.mockResolvedValue(null);
    prisma.sportsMatchRoster.findUnique.mockResolvedValue(null);
    prisma.sportsMatch.findUnique.mockResolvedValue(null);

    await Promise.all([
      service.teamChange('missing', actor),
      service.application('missing', actor),
      service.action('missing', actor),
      service.roster('missing', actor),
    ]);
    prisma.sportsMatchAction.findUnique.mockResolvedValue({ matchId: 'missing-match' });
    await service.action('action-with-missing-match', actor);

    expect(frozen.assertMajorEventMutable).not.toHaveBeenCalled();
    expect(frozen.assertEventMutable).not.toHaveBeenCalled();
  });

  it('publishes successful mutations and tolerates publication failures', async () => {
    await expect(service.publish('TEAM' as never, Promise.resolve({ id: 'team-1' }), true)).resolves.toEqual({
      id: 'team-1',
    });
    mutationEvents.publishForEntity.mockRejectedValueOnce(new Error('broker unavailable'));
    await expect(service.publish('TEAM' as never, Promise.resolve({ id: 'team-2' }), false)).resolves.toEqual({
      id: 'team-2',
    });
    mutationEvents.publishForEntity.mockRejectedValueOnce('offline');
    await expect(service.publish('TEAM' as never, Promise.resolve({ id: 'team-3' }), false)).resolves.toEqual({
      id: 'team-3',
    });
  });

  it('extracts exactly one match id from an action batch', () => {
    expect(service.matchId({ actions: [{ matchId: 'match-1' }, { matchId: 'match-1' }] })).toBe('match-1');
    expect(() => service.matchId({ actions: [] })).toThrow(BadRequestException);
    expect(() => service.matchId({ actions: [{ matchId: 'match-1' }, { matchId: 'match-2' }] })).toThrow(
      BadRequestException,
    );
  });

  it('parses JSON objects and rejects malformed or non-object JSON', () => {
    expect(service.json('[1,2]')).toEqual([1, 2]);
    expect(service.object('{"enabled":true}')).toEqual({ enabled: true });
    expect(() => service.json('{', 'configuração')).toThrow('JSON inválido em configuração.');
    for (const value of ['null', '[]', '"text"']) {
      expect(() => service.object(value)).toThrow('campo deve ser um objeto JSON.');
    }
  });

  it('accepts empty and valid timer rules', () => {
    expect(service.timer()).toEqual({});
    expect(service.timer('  ')).toEqual({});
    expect(service.timer('{"overallEnabled":true}')).toEqual({ overallEnabled: true });
    expect(
      service.timer(
        JSON.stringify({
          overallEnabled: true,
          periodEnabled: false,
          allowOvertime: true,
          periodDurationMs: 0,
          periodStartOffsetsMs: [0, 60_000],
        }),
      ),
    ).toMatchObject({ periodDurationMs: 0 });
  });

  it.each([
    [{ unexpected: true }, 'Campos desconhecidos'],
    [{ overallEnabled: 'yes' }, 'overallEnabled deve ser booleano'],
    [{ periodEnabled: 1 }, 'periodEnabled deve ser booleano'],
    [{ allowOvertime: null }, 'allowOvertime deve ser booleano'],
    [{ periodDurationMs: -1 }, 'periodDurationMs'],
    [{ periodDurationMs: 86_400_001 }, 'periodDurationMs'],
    [{ periodDurationMs: 1.5 }, 'periodDurationMs'],
    [{ periodStartOffsetsMs: 'none' }, 'periodStartOffsetsMs'],
    [{ periodStartOffsetsMs: [-1] }, 'periodStartOffsetsMs'],
    [{ periodStartOffsetsMs: [604_800_001] }, 'periodStartOffsetsMs'],
  ])('rejects invalid timer rules %j', (rules, message) => {
    expect(() => service.timer(JSON.stringify(rules))).toThrow(message);
  });

  it('parses valid overall scoring rules and rejects invalid ones', () => {
    expect(service.scoring()).toEqual({});
    expect(service.scoring(' ')).toEqual({});
    expect(service.scoring(JSON.stringify({ mode: 'MATCH_RESULT', match: { win: 3, draw: 1, loss: 0 } }))).toMatchObject({
      mode: 'MATCH_RESULT',
    });
    expect(() => service.scoring('{"mode":"INVALID"}')).toThrow(BadRequestException);
  });

  it('normalizes non-empty strings only', () => {
    expect(service.string('  valor  ')).toBe('valor');
    expect(service.string('   ')).toBeNull();
    expect(service.string(1)).toBeNull();
  });
});

describe('SportsDuplicationMutationsResolver', () => {
  const actor = { sub: 'actor-1' };
  const policy = { assertPermissions: jest.fn() };
  const currentUser = { getAuthenticatedUser: jest.fn().mockReturnValue(actor) };
  const duplication = {
    cloneTournament: jest.fn().mockResolvedValue({ id: 'tournament-clone' }),
    cloneCategory: jest.fn().mockResolvedValue({ id: 'category-clone' }),
    cloneTeam: jest.fn().mockResolvedValue({ id: 'team-clone' }),
  };
  const mutationEvents = { publishForEntity: jest.fn() };
  let resolver: SportsDuplicationMutationsResolver;

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = new SportsDuplicationMutationsResolver(
      policy as never,
      {} as never,
      {} as never,
      currentUser as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      duplication as never,
      mutationEvents as never,
    );
  });

  it('clones a tournament with all default parts and scoped source/destination permissions', async () => {
    await expect(
      resolver.cloneTournament(
        { sourceTournamentId: 'source', destinationMajorEventId: 'major-destination' } as never,
        {} as never,
      ),
    ).resolves.toBe('tournament-clone');

    expect(policy.assertPermissions).toHaveBeenCalledTimes(4);
    expect(policy.assertPermissions).toHaveBeenCalledWith(
      actor,
      expect.arrayContaining([
        Permission.SportsCategory.Create,
        Permission.SportsTeam.Create,
        Permission.SportsRegistration.Create,
        Permission.SportsOfficial.Create,
      ]),
      { majorEventId: 'major-destination' },
    );
    expect(duplication.cloneTournament).toHaveBeenCalledWith(expect.anything(), actor);
  });

  it('clones a tournament with every optional part disabled', async () => {
    await resolver.cloneTournament(
      {
        sourceTournamentId: 'source',
        destinationMajorEventId: 'major-destination',
        parts: { categories: false, teams: false, registrations: false, venues: false, officials: false, rules: false },
      } as never,
      {} as never,
    );

    expect(policy.assertPermissions).toHaveBeenCalledTimes(2);
  });

  it.each([
    [true, true, 4],
    [false, false, 2],
  ])('clones a category with registrations=%s officials=%s', async (includeRegistrations, includeOfficials, calls) => {
    await expect(
      resolver.cloneCategory(
        { sourceCategoryId: 'source', destinationTournamentId: 'destination', includeRegistrations, includeOfficials } as never,
        {} as never,
      ),
    ).resolves.toBe('category-clone');
    expect(policy.assertPermissions).toHaveBeenCalledTimes(calls);
  });

  it.each([
    [true, true, 6],
    [false, false, 2],
  ])('clones a team with representatives=%s members=%s', async (includeRepresentatives, includeMembers, calls) => {
    await expect(
      resolver.cloneTeam(
        { sourceTeamId: 'source', destinationTournamentId: 'destination', includeRepresentatives, includeMembers } as never,
        {} as never,
      ),
    ).resolves.toBe('team-clone');
    expect(policy.assertPermissions).toHaveBeenCalledTimes(calls);
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM', 'team-clone', true);
  });
});
