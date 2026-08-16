import { CurrentUserProfileResolver } from './resolver';

describe('CurrentUserProfileResolver', () => {
  const authenticatedUser = { sub: 'user-1', email: 'ada@example.com', preferredUsername: 'ada' };
  const getAuthenticatedUser = jest.fn(() => authenticatedUser);
  const resolveCurrentUserContext = jest.fn();
  const mapUser = jest.fn((user) => ({ mappedUserId: user.id }));
  const mapPerson = jest.fn((person) => ({ mappedPersonId: person.id }));

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the authenticated identity and mapped user/person context', async () => {
    resolveCurrentUserContext.mockResolvedValue({ user: { id: 'user-db-1' }, person: { id: 'person-1' } });
    const resolver = createResolver();
    const context = { req: {} };

    await expect(resolver.currentUserProfileContext(context as never)).resolves.toEqual({
      sub: 'user-1',
      email: 'ada@example.com',
      preferredUsername: 'ada',
      authenticatedUser,
      user: { mappedUserId: 'user-db-1' },
      person: { mappedPersonId: 'person-1' },
    });
    expect(getAuthenticatedUser).toHaveBeenCalledWith(context);
    expect(resolveCurrentUserContext).toHaveBeenCalledWith(authenticatedUser, true);
  });

  it('omits database projections when no linked user or person exists', async () => {
    resolveCurrentUserContext.mockResolvedValue({ user: null, person: null });

    const result = await createResolver().currentUserProfileContext({} as never);

    expect(result.user).toBeUndefined();
    expect(result.person).toBeUndefined();
    expect(mapUser).not.toHaveBeenCalled();
    expect(mapPerson).not.toHaveBeenCalled();
  });

  function createResolver(): CurrentUserProfileResolver {
    return new CurrentUserProfileResolver(
      { getAuthenticatedUser, resolveCurrentUserContext } as never,
      { mapUser, mapPerson } as never,
    );
  }
});
