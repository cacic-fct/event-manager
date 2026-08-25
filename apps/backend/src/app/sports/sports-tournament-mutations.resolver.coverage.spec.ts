import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { SportsTournamentMutationsResolver } from './sports-tournament-mutations.resolver';

describe('SportsTournamentMutationsResolver category update boundary', () => {
  it('declares tournament category updates as a scoped category permission', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, SportsTournamentMutationsResolver.prototype.updateCategory),
    ).toEqual([Permission.SportsCategory.Update]);
  });

  it('parses category rule inputs, preserves ordinary fields, attributes the actor, and publishes publicly', async () => {
    const harness = createHarness();
    const input = {
      id: 'category-1',
      expectedRevision: 5,
      name: 'Futsal',
      scoreRulesJson: '{"periods":2}',
      overallScoringRulesJson: '{"mode":"MATCH_RESULT","match":{"win":3,"draw":1,"loss":0},"placement":{"1":5}}',
      timerRulesJson: '{"overallEnabled":true,"periodDurationMs":60000}',
      rosterRulesJson: '{"maximumPlayers":12}',
      bracketRulesJson: '{"format":"SINGLE_ELIMINATION"}',
      standingsRulesJson: '{"tieBreakers":["POINTS"]}',
    };
    harness.admin.updateCategory.mockResolvedValue({ id: 'category-1' });

    await expect(harness.resolver.updateCategory(input as never, harness.context as never)).resolves.toBe('category-1');

    expect(harness.policy.assertPermissions).toHaveBeenCalledWith(harness.actor, [Permission.SportsCategory.Update], {
      sportsCategoryId: 'category-1',
    });
    expect(harness.admin.updateCategory).toHaveBeenCalledWith(
      'category-1',
      {
        ...input,
        scoreRules: { periods: 2 },
        overallScoringRules: {
          mode: 'MATCH_RESULT',
          match: { win: 3, draw: 1, loss: 0 },
          placement: { '1': 5 },
        },
        timerRules: { overallEnabled: true, periodDurationMs: 60000 },
        rosterRules: { maximumPlayers: 12 },
        bracketRules: { format: 'SINGLE_ELIMINATION' },
        standingsRules: { tieBreakers: ['POINTS'] },
      },
      harness.actor,
    );
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('CATEGORY', 'category-1', true);
  });

  it('rejects malformed rules before category persistence and preserves authorization failures', async () => {
    const harness = createHarness();
    await expect(
      harness.resolver.updateCategory(
        { id: 'category-1', expectedRevision: 1, scoreRulesJson: '{broken' } as never,
        harness.context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.admin.updateCategory).not.toHaveBeenCalled();

    const failure = new ForbiddenException('Category permission denied.');
    harness.policy.assertPermissions.mockRejectedValue(failure);
    await expect(
      harness.resolver.updateCategory({ id: 'category-1', expectedRevision: 1 } as never, harness.context as never),
    ).rejects.toBe(failure);
    expect(harness.admin.updateCategory).not.toHaveBeenCalled();
    expect(harness.mutationEvents.publishForEntity).not.toHaveBeenCalled();
  });
});

function createHarness() {
  const actor = { sub: 'admin-user', token: 'token' };
  const context = { req: { user: actor } };
  const policy = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const admin = { updateCategory: jest.fn() };
  const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
  const resolver = new SportsTournamentMutationsResolver(
    policy as never,
    {} as never,
    {} as never,
    { getAuthenticatedUser: jest.fn().mockReturnValue(actor) } as never,
    admin as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    mutationEvents as never,
  );

  return { resolver, actor, context, policy, admin, mutationEvents };
}
