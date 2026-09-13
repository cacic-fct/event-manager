import { EventInterestsResolver } from './interest.resolver';

describe('EventInterestsResolver', () => {
  it('uses the current person and publishes a realtime refresh after toggling interest', async () => {
    const interests = {
      setCurrentUserInterest: jest.fn().mockResolvedValue({ id: 'interest-1' }),
    };
    const currentUser = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
    };
    const realtime = { notifyPerson: jest.fn().mockResolvedValue(undefined) };
    const resolver = new EventInterestsResolver(interests as never, currentUser as never, realtime as never);
    const context = { req: { user: { sub: 'user-1' } } } as never;

    await expect(resolver.setCurrentUserInterest('EVENT', 'event-1', true, context)).resolves.toEqual({
      id: 'interest-1',
    });
    expect(interests.setCurrentUserInterest).toHaveBeenCalledWith(
      'person-1',
      { targetType: 'EVENT', targetId: 'event-1' },
      true,
      { sub: 'user-1' },
    );
    expect(realtime.notifyPerson).toHaveBeenCalledWith('person-1');
  });

  it('exposes the state query used by the public toggle', async () => {
    const state = { interest: null, subscribed: false, endsAt: new Date('2026-10-01T00:00:00.000Z'), enabled: true };
    const interests = { getCurrentUserInterestState: jest.fn().mockResolvedValue(state) };
    const currentUser = { requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }) };
    const resolver = new EventInterestsResolver(interests as never, currentUser as never, {} as never);

    await expect(
      resolver.currentUserInterestState('EVENT_GROUP', 'group-1', { req: {} } as never),
    ).resolves.toBe(state);
    expect(interests.getCurrentUserInterestState).toHaveBeenCalledWith('person-1', 'EVENT_GROUP', 'group-1');
  });
});
