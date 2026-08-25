import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { SportsReviewMutationsResolver } from './sports-review-mutations.resolver';

describe('SportsReviewMutationsResolver uncovered review operations', () => {
  it('declares scoped approval permission metadata for review-data updates and occurrence corrections', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        SportsReviewMutationsResolver.prototype.updatePlayerApplicationReviewData,
      ),
    ).toEqual([Permission.SportsRegistration.Approve]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsReviewMutationsResolver.prototype.correctMatchOccurrence),
    ).toEqual([Permission.SportsMatch.Review]);
  });

  it('updates pending application review data with category-scoped permission, frozen-major-event protection, and actor attribution', async () => {
    const harness = createHarness();
    harness.prisma.sportsPlayerApplication.findUnique.mockResolvedValue({
      tournament: { majorEventId: 'major-1' },
      categoryChoices: [{ categoryId: 'category-1' }],
    });
    harness.applications.updatePendingApplication.mockResolvedValue({ id: 'application-1' });
    const input = {
      applicationId: 'application-1',
      requestedTeamId: 'team-1',
      categoryIds: ['category-1', 'category-2'],
      paymentTier: 'student',
    };

    await expect(
      harness.resolver.updatePlayerApplicationReviewData(input as never, harness.context as never),
    ).resolves.toBe('application-1');

    expect(harness.policy.assertPermissions).toHaveBeenNthCalledWith(
      1,
      harness.actor,
      [Permission.SportsRegistration.Approve],
      { sportsPlayerApplicationId: 'application-1' },
    );
    expect(harness.policy.assertPermissions).toHaveBeenNthCalledWith(
      2,
      harness.actor,
      [Permission.SportsRegistration.Approve],
      { sportsCategoryId: 'category-1' },
    );
    expect(harness.frozen.assertMajorEventMutable).toHaveBeenCalledWith('major-1', harness.actor, 'edit');
    expect(harness.applications.updatePendingApplication).toHaveBeenCalledWith(
      'application-1',
      {
        requestedTeamId: 'team-1',
        categoryIds: ['category-1', 'category-2'],
        paymentTier: 'student',
      },
      harness.actor,
    );
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('APPLICATION', 'application-1', false);
  });

  it('does not update review data when scoped approval permission is denied', async () => {
    const harness = createHarness();
    const failure = new ForbiddenException('Approval permission required.');
    harness.policy.assertPermissions.mockRejectedValueOnce(failure);

    await expect(
      harness.resolver.updatePlayerApplicationReviewData(
        { applicationId: 'application-1', categoryIds: [] } as never,
        harness.context as never,
      ),
    ).rejects.toBe(failure);

    expect(harness.applications.updatePendingApplication).not.toHaveBeenCalled();
    expect(harness.mutationEvents.publishForEntity).not.toHaveBeenCalled();
  });

  it('corrects an approved match occurrence with parsed payload and frozen-event review authorization', async () => {
    const harness = createHarness();
    harness.prisma.sportsMatchAction.findUnique.mockResolvedValue({ matchId: 'match-1' });
    harness.prisma.sportsMatch.findUnique.mockResolvedValue({ eventId: 'event-1' });
    harness.operations.correctApprovedOccurrence.mockResolvedValue({ id: 'correction-1' });
    const input = {
      actionId: 'action-1',
      correctedPayloadJson: '{"score":2,"period":3}',
    };

    await expect(harness.resolver.correctMatchOccurrence(input as never, harness.context as never)).resolves.toBe(
      'correction-1',
    );

    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(harness.actor, [Permission.SportsMatch.Review], {
      sportsMatchActionId: 'action-1',
    });
    expect(harness.frozen.assertEventMutable).toHaveBeenCalledWith('event-1', harness.actor, 'edit');
    expect(harness.operations.correctApprovedOccurrence).toHaveBeenCalledWith(
      'action-1',
      { score: 2, period: 3 },
      harness.actor,
    );
  });

  it('rejects malformed occurrence corrections before calling the operation service', async () => {
    const harness = createHarness();
    harness.prisma.sportsMatchAction.findUnique.mockResolvedValue({ matchId: 'match-1' });
    harness.prisma.sportsMatch.findUnique.mockResolvedValue({ eventId: 'event-1' });

    await expect(
      harness.resolver.correctMatchOccurrence(
        { actionId: 'action-1', correctedPayloadJson: '{broken' } as never,
        harness.context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.operations.correctApprovedOccurrence).not.toHaveBeenCalled();
  });

  it('does not correct an occurrence when the event is frozen', async () => {
    const harness = createHarness();
    harness.prisma.sportsMatchAction.findUnique.mockResolvedValue({ matchId: 'match-1' });
    harness.prisma.sportsMatch.findUnique.mockResolvedValue({ eventId: 'event-1' });
    const failure = new ForbiddenException('Event is frozen.');
    harness.frozen.assertEventMutable.mockRejectedValue(failure);

    await expect(
      harness.resolver.correctMatchOccurrence(
        { actionId: 'action-1', correctedPayloadJson: '{"score":2}' } as never,
        harness.context as never,
      ),
    ).rejects.toBe(failure);
    expect(harness.operations.correctApprovedOccurrence).not.toHaveBeenCalled();
  });
});

function createHarness() {
  const actor = { sub: 'reviewer-1', token: 'token', permissionSet: new Set<string>() };
  const context = { req: { user: actor } };
  const policy = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const frozen = {
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    sportsPlayerApplication: { findUnique: jest.fn().mockResolvedValue(null) },
    sportsMatchAction: { findUnique: jest.fn().mockResolvedValue(null) },
    sportsMatch: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const currentUser = { getAuthenticatedUser: jest.fn().mockReturnValue(actor) };
  const applications = {
    updatePendingApplication: jest.fn(),
  };
  const operations = {
    correctApprovedOccurrence: jest.fn(),
  };
  const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
  const resolver = new SportsReviewMutationsResolver(
    policy as never,
    frozen as never,
    prisma as never,
    currentUser as never,
    {} as never,
    {} as never,
    {} as never,
    applications as never,
    {} as never,
    operations as never,
    {} as never,
    {} as never,
    mutationEvents as never,
  );

  return { resolver, actor, context, policy, frozen, prisma, applications, operations, mutationEvents };
}
