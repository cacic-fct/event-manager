import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, SportsReviewStatus, SportsTeamChangeRequestStatus } from '@prisma/client';
import { sportsTestDate } from './testing/sports-backend.fixtures';
import { SportsMatchAdminMutationsResolver } from './sports-match-admin-mutations.resolver';
import { SportsReviewMutationsResolver } from './sports-review-mutations.resolver';

describe('specialized sports mutation resolvers', () => {
  const actor = { sub: 'admin-1' };
  const context = { req: { user: actor } };
  const policy = { assertPermissions: jest.fn() };
  const frozen = { assertEventMutable: jest.fn(), assertMajorEventMutable: jest.fn() };
  const prisma = {
    sportsVenue: { findFirst: jest.fn() },
    sportsTeamChangeRequest: { findUnique: jest.fn() },
    sportsPlayerApplication: { findUnique: jest.fn() },
    sportsMatchAction: { findUnique: jest.fn() },
    sportsMatchRoster: { findUnique: jest.fn() },
    sportsMatch: { findUnique: jest.fn() },
  };
  const currentUser = { getAuthenticatedUser: jest.fn() };
  const admin = {
    createVenue: jest.fn(),
    updateVenue: jest.fn(),
    createMatch: jest.fn(),
    updateMatch: jest.fn(),
    assignOfficial: jest.fn(),
    updateOfficial: jest.fn(),
    getMatchEventId: jest.fn(),
  };
  const teamChanges = { review: jest.fn() };
  const applications = { review: jest.fn() };
  const rosters = { review: jest.fn(), upsert: jest.fn() };
  const operations = { review: jest.fn() };
  const brackets = { generate: jest.fn(), generateNextSwissRound: jest.fn() };
  const mutationEvents = { publishForEntity: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    currentUser.getAuthenticatedUser.mockReturnValue(actor);
    policy.assertPermissions.mockResolvedValue(undefined);
    frozen.assertEventMutable.mockResolvedValue(undefined);
    frozen.assertMajorEventMutable.mockResolvedValue(undefined);
    mutationEvents.publishForEntity.mockResolvedValue(undefined);
    prisma.sportsTeamChangeRequest.findUnique.mockResolvedValue(null);
    prisma.sportsPlayerApplication.findUnique.mockResolvedValue(null);
    prisma.sportsMatchAction.findUnique.mockResolvedValue(null);
    prisma.sportsMatchRoster.findUnique.mockResolvedValue(null);
    prisma.sportsMatch.findUnique.mockResolvedValue(null);
  });

  it('generates brackets and Swiss rounds only after category-scoped authorization', async () => {
    brackets.generate.mockResolvedValue([{ id: 'stage-1' }, { id: 'stage-2' }]);
    brackets.generateNextSwissRound.mockResolvedValue([{ id: 'match-1' }]);
    const resolver = reviewResolver();

    await expect(resolver.generateBracket({ categoryId: 'category-1' } as never, context as never)).resolves.toEqual([
      'stage-1',
      'stage-2',
    ]);
    await expect(resolver.generateNextSwissRound('category-1', context as never)).resolves.toEqual(['match-1']);
    expect(policy.assertPermissions).toHaveBeenCalledTimes(2);
    expect(brackets.generate).toHaveBeenCalledWith({ categoryId: 'category-1' }, actor);
  });

  it.each([
    [SportsTeamChangeRequestStatus.APPROVED, 'APPROVE', true],
    [SportsTeamChangeRequestStatus.REJECTED, 'REJECT', false],
    [SportsTeamChangeRequestStatus.CHANGES_REQUESTED, 'REQUEST_CHANGES', false],
  ])('maps team-change decision %s and publishes only approvals publicly', async (decision, mapped, publicEvent) => {
    teamChanges.review.mockResolvedValue({ id: 'change-1' });
    const resolver = reviewResolver();
    const input = {
      requestId: 'change-1',
      decision,
      expectedRequestRevision: 2,
      reviewMessage: 'Revisado',
      resolvedDeltaJson: '{"set":{"name":"Nova"}}',
      forceConflicts: true,
    };

    await expect(resolver.reviewTeamChange(input as never, context as never)).resolves.toBe('change-1');
    expect(teamChanges.review).toHaveBeenCalledWith('change-1', mapped, actor, {
      expectedRequestRevision: 2,
      message: 'Revisado',
      resolvedDelta: { set: { name: 'Nova' } },
      forceConflicts: true,
    });
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM_CHANGE', 'change-1', publicEvent);
  });

  it('maps application and action review decisions, corrected JSON, and rejects invalid action decisions', async () => {
    applications.review.mockResolvedValue({ id: 'application-1' });
    operations.review.mockResolvedValue({ id: 'action-1' });
    const resolver = reviewResolver();

    await expect(
      resolver.reviewPlayerApplication(
        { applicationId: 'application-1', decision: 'APPROVED', reviewMessage: null } as never,
        context as never,
      ),
    ).resolves.toBe('application-1');
    expect(applications.review).toHaveBeenCalledWith('application-1', 'APPROVE', actor, undefined);

    await expect(
      resolver.reviewMatchAction(
        {
          actionId: 'action-1',
          decision: 'CHANGES_REQUESTED',
          reviewMessage: 'Corrija',
          correctedPayloadJson: '{"amount":2}',
        } as never,
        context as never,
      ),
    ).resolves.toBe('action-1');
    expect(operations.review).toHaveBeenCalledWith('action-1', SportsReviewStatus.CHANGES_REQUESTED, actor, {
      reviewMessage: 'Corrija',
      correctedPayload: { amount: 2 },
    });

    await expect(
      resolver.reviewMatchAction({ actionId: 'action-1', decision: 'UNKNOWN' } as never, context as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['REJECTED', 'REJECT'],
    ['CHANGES_REQUESTED', 'REQUEST_CHANGES'],
  ])('maps the remaining application decision %s', async (decision, mapped) => {
    applications.review.mockResolvedValue({ id: 'application-1' });
    await reviewResolver().reviewPlayerApplication(
      { applicationId: 'application-1', decision, reviewMessage: 'Mensagem' } as never,
      context as never,
    );
    expect(applications.review).toHaveBeenCalledWith('application-1', mapped, actor, 'Mensagem');
  });

  it.each([
    ['APPROVED', SportsReviewStatus.APPROVED],
    ['REJECTED', SportsReviewStatus.REJECTED],
  ])('maps the remaining action decision %s', async (decision, mapped) => {
    operations.review.mockResolvedValue({ id: 'action-1' });
    await reviewResolver().reviewMatchAction(
      { actionId: 'action-1', decision, reviewMessage: null, correctedPayloadJson: null } as never,
      context as never,
    );
    expect(operations.review).toHaveBeenCalledWith('action-1', mapped, actor, {
      reviewMessage: null,
      correctedPayload: undefined,
    });
  });

  it('requires a stable actor id for roster review and maps both decisions', async () => {
    rosters.review.mockResolvedValue({ id: 'roster-1' });
    const resolver = reviewResolver();
    await expect(resolver.reviewRoster('roster-1', true, context as never)).resolves.toBe('roster-1');
    await expect(resolver.reviewRoster('roster-1', false, context as never)).resolves.toBe('roster-1');
    expect(rosters.review).toHaveBeenNthCalledWith(1, 'roster-1', 'APPROVE', 'admin-1', actor);
    expect(rosters.review).toHaveBeenNthCalledWith(2, 'roster-1', 'REJECT', 'admin-1', actor);

    currentUser.getAuthenticatedUser.mockReturnValue({});
    await expect(resolver.reviewRoster('roster-1', true, context as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('validates match schedule before authentication and propagates scoped authorization failures', async () => {
    const resolver = adminResolver();
    await expect(
      resolver.createMatch({ categoryId: 'category-1', eventId: null } as never, context as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(currentUser.getAuthenticatedUser).not.toHaveBeenCalled();

    policy.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
    await expect(
      resolver.createVenue({ tournamentId: 'tournament-1' } as never, context as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(admin.createVenue).not.toHaveBeenCalled();
  });

  it('reports a missing venue and delegates all distinct admin mutation contexts', async () => {
    const resolver = adminResolver();
    prisma.sportsVenue.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ tournamentId: 'tournament-1' });
    await expect(resolver.updateVenue({ id: 'missing' } as never, context as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    admin.createVenue.mockResolvedValue({ id: 'venue-created' });
    admin.updateVenue.mockResolvedValue({ id: 'venue-updated' });
    admin.createMatch.mockResolvedValue({ id: 'match-created' });
    admin.updateMatch.mockResolvedValue({ id: 'match-updated' });
    admin.assignOfficial.mockResolvedValue({ id: 'official-created' });
    admin.updateOfficial.mockResolvedValue({ id: 'official-updated' });

    await expect(resolver.createVenue({ tournamentId: 'tournament-1' } as never, context as never)).resolves.toBe(
      'venue-created',
    );
    await expect(resolver.updateVenue({ id: 'venue-1' } as never, context as never)).resolves.toBe('venue-updated');
    await expect(
      resolver.createMatch(
        {
          categoryId: 'category-1',
          eventId: null,
          startDate: sportsTestDate(60_000),
          endDate: sportsTestDate(120_000),
        } as never,
        context as never,
      ),
    ).resolves.toBe('match-created');
    await expect(resolver.updateMatch({ id: 'match-1' } as never, context as never)).resolves.toBe('match-updated');
    await expect(
      resolver.assignOfficial(
        { tournamentId: 'tournament-1', categoryId: null, matchId: null } as never,
        context as never,
      ),
    ).resolves.toBe('official-created');
    await expect(resolver.updateOfficial({ id: 'official-1' } as never, context as never)).resolves.toBe(
      'official-updated',
    );
  });

  it('normalizes roster roles and role metadata after freeze validation', async () => {
    admin.getMatchEventId.mockResolvedValue('event-1');
    rosters.upsert.mockResolvedValue({ id: 'roster-1' });
    const resolver = adminResolver();

    const result = await resolver.upsertAdminRoster(
      {
        matchId: 'match-1',
        registrationId: 'registration-1',
        expectedRevision: 2,
        entries: [
          { registrationMemberId: 'member-1', role: null, shirtNumber: '10', roleMetadataJson: null },
          { registrationMemberId: 'member-2', role: 'CAPTAIN', shirtNumber: '7', roleMetadataJson: undefined },
          {
            registrationMemberId: 'member-3',
            role: 'PLAYER',
            shirtNumber: null,
            roleMetadataJson: '{"position":"GOALKEEPER"}',
          },
        ],
      } as never,
      context as never,
    );

    expect(result).toBe('roster-1');
    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(rosters.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({ role: 'PLAYER', roleMetadata: Prisma.DbNull }),
          expect.objectContaining({ role: 'CAPTAIN', roleMetadata: undefined }),
          expect.objectContaining({ roleMetadata: { position: 'GOALKEEPER' } }),
        ],
      }),
      'admin-1',
      actor,
      true,
    );
  });

  it('requires a stable actor id for admin roster writes after permission and freeze checks', async () => {
    currentUser.getAuthenticatedUser.mockReturnValue({});
    admin.getMatchEventId.mockResolvedValue('event-1');

    await expect(
      adminResolver().upsertAdminRoster(
        { matchId: 'match-1', registrationId: 'registration-1', entries: [] } as never,
        context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(frozen.assertEventMutable).toHaveBeenCalledWith('event-1', {}, 'edit');
    expect(rosters.upsert).not.toHaveBeenCalled();
  });

  function dependencies() {
    return [
      policy,
      frozen,
      prisma,
      currentUser,
      admin,
      {},
      teamChanges,
      applications,
      rosters,
      operations,
      brackets,
      {},
      mutationEvents,
    ] as const;
  }

  function reviewResolver(): SportsReviewMutationsResolver {
    return new SportsReviewMutationsResolver(...(dependencies() as never));
  }

  function adminResolver(): SportsMatchAdminMutationsResolver {
    return new SportsMatchAdminMutationsResolver(...(dependencies() as never));
  }
});
