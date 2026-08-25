import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  SportsAdminReadResolver,
  SportsCurrentUserReadResolver,
  SportsPublicReadResolver,
} from './sports-read.resolver';
import { IS_PUBLIC_KEY } from '../../auth/auth.constants';
import { RATE_LIMIT_METADATA_KEY } from '../../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';

describe('sports read resolvers', () => {
  it('marks only public sports reads as public and rate-limits both public operations', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SportsPublicReadResolver)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SportsAdminReadResolver)).toBeUndefined();
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, SportsCurrentUserReadResolver)).toBeUndefined();

    for (const method of [
      SportsPublicReadResolver.prototype.publicSportsTournamentDetail,
      SportsPublicReadResolver.prototype.publicSportsMatchDetail,
    ]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, method)).toEqual([RateLimitGuard]);
      expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, method)).toEqual({
        policy: RATE_LIMIT_POLICIES.publicEvents,
        resources: [],
      });
    }
  });

  it('forwards every admin read operation with the resolved actor and exact arguments', async () => {
    const harness = createHarness();
    const context = { request: { user: harness.user } };
    const operations = [
      [
        'tournament list',
        () => harness.admin.adminSportsTournamentList(context as never, '  cup  ', 2, 20),
        harness.sportsRead.adminTournamentList,
        [harness.user, { query: '  cup  ', skip: 2, take: 20 }],
      ],
      [
        'tournament',
        () => harness.admin.adminSportsTournamentRead('tournament-1', context as never),
        harness.sportsRead.adminTournament,
        [harness.user, 'tournament-1'],
      ],
      [
        'category',
        () => harness.admin.adminSportsCategoryRead('category-1', context as never),
        harness.sportsRead.adminCategory,
        [harness.user, 'category-1'],
      ],
      [
        'team',
        () => harness.admin.adminSportsTeamRead('team-1', context as never),
        harness.sportsRead.adminTeam,
        [harness.user, 'team-1'],
      ],
      [
        'registration',
        () => harness.admin.adminSportsRegistrationRead('registration-1', context as never),
        harness.sportsRead.adminRegistration,
        [harness.user, 'registration-1'],
      ],
      [
        'match review',
        () => harness.admin.adminSportsMatchReviewRead('match-1', context as never),
        harness.sportsRead.adminMatchReview,
        [harness.user, 'match-1'],
      ],
      [
        'match action queue',
        () => harness.admin.adminSportsMatchActionReviewQueue('tournament-1', context as never),
        harness.sportsRead.adminMatchActionReviewQueue,
        [harness.user, 'tournament-1'],
      ],
    ] as const;

    for (const [_name, invoke, service, expectedArgs] of operations) {
      const result = { operation: _name };
      service.mockResolvedValueOnce(result);
      await expect(invoke()).resolves.toBe(result);
      expect(service).toHaveBeenLastCalledWith(...expectedArgs);
    }
  });

  it('passes an absent admin actor through for scoped service authorization instead of inventing identity', async () => {
    const harness = createHarness();
    const result = [];
    harness.sportsRead.adminTournamentList.mockResolvedValue(result);

    await expect(harness.admin.adminSportsTournamentList({ req: {} } as never)).resolves.toBe(result);

    expect(harness.sportsRead.adminTournamentList).toHaveBeenCalledWith(undefined, {
      query: undefined,
      skip: undefined,
      take: undefined,
    });
  });

  it('propagates an admin not-found result without changing its privacy/error semantics', async () => {
    const harness = createHarness();
    const failure = new NotFoundException('Sports team was not found.');
    harness.sportsRead.adminTeam.mockRejectedValue(failure);

    await expect(harness.admin.adminSportsTeamRead('team-404', { req: { user: harness.user } } as never)).rejects.toBe(
      failure,
    );
  });

  it('forwards both public read operations without requiring a user identity', async () => {
    const harness = createHarness();
    const tournament = { id: 'tournament-1', matches: [] };
    const match = { id: 'match-1', privacyLimited: true };
    harness.sportsRead.publicTournament.mockResolvedValue(tournament);
    harness.sportsRead.publicMatch.mockResolvedValue(match);

    await expect(harness.public.publicSportsTournamentDetail('tournament-1', 'major-1')).resolves.toBe(tournament);
    await expect(harness.public.publicSportsMatchDetail('match-1')).resolves.toBe(match);

    expect(harness.sportsRead.publicTournament).toHaveBeenCalledWith({
      tournamentId: 'tournament-1',
      majorEventId: 'major-1',
    });
    expect(harness.sportsRead.publicMatch).toHaveBeenCalledWith('match-1');
  });

  it('preserves public empty and not-found outcomes without adding private fields', async () => {
    const harness = createHarness();
    const failure = new NotFoundException('Public match was not found.');
    harness.sportsRead.publicTournament.mockResolvedValue({ id: 'tournament-1', matches: [] });
    harness.sportsRead.publicMatch.mockRejectedValue(failure);

    await expect(harness.public.publicSportsTournamentDetail()).resolves.toEqual({ id: 'tournament-1', matches: [] });
    await expect(harness.public.publicSportsMatchDetail('missing-match')).rejects.toBe(failure);
  });

  it('resolves current-user tournament identity and trims an explicitly requested team', async () => {
    const harness = createHarness();
    const tournament = { id: 'tournament-1', matches: [] };
    const result = { tournament, requestedTeamId: 'team-1' };
    harness.currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    harness.sportsRead.currentUserTournament.mockResolvedValue(result);

    await expect(
      harness.current.currentUserSportsTournamentDetail(
        { req: { user: harness.user } } as never,
        'tournament-1',
        'major-1',
        '  team-1  ',
      ),
    ).resolves.toBe(result);

    expect(harness.currentUser.requireCurrentPerson).toHaveBeenCalledWith({ req: { user: harness.user } });
    expect(harness.sportsRead.currentUserTournament).toHaveBeenCalledWith(
      { tournamentId: 'tournament-1', majorEventId: 'major-1' },
      'person-1',
      'team-1',
    );
  });

  it('keeps omitted and null requested-team semantics distinct for self-subscription filtering', async () => {
    const harness = createHarness();
    harness.currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    harness.sportsRead.currentUserTournament.mockResolvedValue({ id: 'result' });

    await harness.current.currentUserSportsTournamentDetail({ req: { user: harness.user } } as never, 'tournament-1');
    await harness.current.currentUserSportsTournamentDetail(
      { req: { user: harness.user } } as never,
      'tournament-1',
      undefined,
      null,
    );

    expect(harness.sportsRead.currentUserTournament).toHaveBeenNthCalledWith(
      1,
      { tournamentId: 'tournament-1', majorEventId: undefined },
      'person-1',
    );
    expect(harness.sportsRead.currentUserTournament).toHaveBeenNthCalledWith(
      2,
      { tournamentId: 'tournament-1', majorEventId: undefined },
      'person-1',
      null,
    );
  });

  it('requires a representative before returning the team workspace', async () => {
    const harness = createHarness();
    harness.access.requireTeamRepresentativeReader.mockResolvedValue({ actor: { id: 'representative-1' } });
    const workspace = { teamId: 'team-1', registrations: [] };
    harness.sportsRead.representativeTeamWorkspace.mockResolvedValue(workspace);

    await expect(
      harness.current.currentUserSportsTeamWorkspace({ req: { user: harness.user } } as never, 'team-1'),
    ).resolves.toBe(workspace);

    expect(harness.access.requireTeamRepresentativeReader).toHaveBeenCalledWith(
      { req: { user: harness.user } },
      'team-1',
    );
    expect(harness.sportsRead.representativeTeamWorkspace).toHaveBeenCalledWith('team-1', 'representative-1');
  });

  it('propagates representative authorization failures without exposing workspace data', async () => {
    const harness = createHarness();
    const failure = new ForbiddenException('Representative access required.');
    harness.access.requireTeamRepresentativeReader.mockRejectedValue(failure);

    await expect(
      harness.current.currentUserSportsTeamWorkspace({ req: { user: harness.user } } as never, 'team-1'),
    ).rejects.toBe(failure);
    expect(harness.sportsRead.representativeTeamWorkspace).not.toHaveBeenCalled();
  });

  it('checks match-operator access before both operational match reads and forwards exact ids', async () => {
    const harness = createHarness();
    const operations = { matchId: 'match-1', entries: [] };
    const detail = { id: 'match-1', privateOperationalField: true };
    harness.access.requireMatchOperator.mockResolvedValue({ actor: { id: 'official-1' } });
    harness.sportsRead.currentUserMatchOperations.mockResolvedValue(operations);
    harness.sportsRead.operationalMatch.mockResolvedValue(detail);

    await expect(
      harness.current.currentUserSportsMatchOperations({ req: { user: harness.user } } as never, 'match-1'),
    ).resolves.toBe(operations);
    await expect(
      harness.current.currentUserSportsOperationalMatchDetail({ req: { user: harness.user } } as never, 'match-1'),
    ).resolves.toBe(detail);

    expect(harness.access.requireMatchOperator).toHaveBeenNthCalledWith(1, { req: { user: harness.user } }, 'match-1');
    expect(harness.access.requireMatchOperator).toHaveBeenNthCalledWith(2, { req: { user: harness.user } }, 'match-1');
    expect(harness.sportsRead.currentUserMatchOperations).toHaveBeenCalledWith('match-1');
    expect(harness.sportsRead.operationalMatch).toHaveBeenCalledWith('match-1');
  });

  it('checks lineup-reader scope before returning a participant-scoped lineup', async () => {
    const harness = createHarness();
    const lineup = { matchId: 'match-1', registrationId: 'registration-1', entries: [] };
    harness.access.requireLineupReader.mockResolvedValue({ actor: { id: 'person-1' } });
    harness.sportsRead.currentUserLineup.mockResolvedValue(lineup);

    await expect(
      harness.current.currentUserSportsLineup({ req: { user: harness.user } } as never, 'match-1', 'registration-1'),
    ).resolves.toBe(lineup);

    expect(harness.access.requireLineupReader).toHaveBeenCalledWith({ req: { user: harness.user } }, 'registration-1');
    expect(harness.sportsRead.currentUserLineup).toHaveBeenCalledWith('match-1', 'registration-1');
  });

  it('propagates current-user identity and access failures before querying private sports reads', async () => {
    const harness = createHarness();
    const identityFailure = new NotFoundException('Current person was not found.');
    harness.currentUser.requireCurrentPerson.mockRejectedValue(identityFailure);
    await expect(
      harness.current.currentUserSportsTournamentDetail({ req: { user: harness.user } } as never),
    ).rejects.toBe(identityFailure);
    expect(harness.sportsRead.currentUserTournament).not.toHaveBeenCalled();

    const accessFailure = new ForbiddenException('Match operator access required.');
    harness.access.requireMatchOperator.mockRejectedValue(accessFailure);
    await expect(
      harness.current.currentUserSportsMatchOperations({ req: { user: harness.user } } as never, 'match-1'),
    ).rejects.toBe(accessFailure);
    expect(harness.sportsRead.currentUserMatchOperations).not.toHaveBeenCalled();
  });
});

function createHarness() {
  const user = { sub: 'user-1' };
  const sportsRead = {
    adminTournamentList: jest.fn(),
    adminTournament: jest.fn(),
    adminCategory: jest.fn(),
    adminTeam: jest.fn(),
    adminRegistration: jest.fn(),
    adminMatchReview: jest.fn(),
    adminMatchActionReviewQueue: jest.fn(),
    publicTournament: jest.fn(),
    publicMatch: jest.fn(),
    currentUserTournament: jest.fn(),
    representativeTeamWorkspace: jest.fn(),
    currentUserMatchOperations: jest.fn(),
    operationalMatch: jest.fn(),
    currentUserLineup: jest.fn(),
  };
  const currentUser = {
    requireCurrentPerson: jest.fn(),
  };
  const access = {
    requireTeamRepresentativeReader: jest.fn(),
    requireMatchOperator: jest.fn(),
    requireLineupReader: jest.fn(),
  };
  return {
    user,
    sportsRead,
    currentUser,
    access,
    admin: new SportsAdminReadResolver(sportsRead as never),
    public: new SportsPublicReadResolver(sportsRead as never),
    current: new SportsCurrentUserReadResolver(sportsRead as never, currentUser as never, access as never),
  };
}
