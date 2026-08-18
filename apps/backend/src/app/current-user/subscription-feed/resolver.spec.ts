import { CurrentUserSubscriptionFeedResolver } from './resolver';

describe('CurrentUserSubscriptionFeedResolver', () => {
  const authenticatedUser = { sub: 'user-1' };
  const getAuthenticatedUser = jest.fn(() => authenticatedUser);
  const resolveCurrentUserContext = jest.fn();
  const getCurrentUserSubscriptionFeed = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty feed without querying subscriptions when no person is linked', async () => {
    resolveCurrentUserContext.mockResolvedValue({ person: null });

    await expect(createResolver().currentUserSubscriptionFeed({} as never)).resolves.toEqual({ items: [] });
    expect(getCurrentUserSubscriptionFeed).not.toHaveBeenCalled();
  });

  it('loads the standalone subscription feed for the linked person only', async () => {
    const feed = { items: [{ id: 'subscription-1' }] };
    resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    getCurrentUserSubscriptionFeed.mockResolvedValue(feed);

    await expect(createResolver().currentUserSubscriptionFeed({} as never)).resolves.toBe(feed);
    expect(resolveCurrentUserContext).toHaveBeenCalledWith(authenticatedUser);
    expect(getCurrentUserSubscriptionFeed).toHaveBeenCalledWith('person-1');
  });

  function createResolver(): CurrentUserSubscriptionFeedResolver {
    return new CurrentUserSubscriptionFeedResolver(
      { getAuthenticatedUser, resolveCurrentUserContext } as never,
      { getCurrentUserSubscriptionFeed } as never,
    );
  }
});
