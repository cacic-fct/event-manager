import { SportsAutoroutingResolver } from './sports-autorouting.resolver';

describe('SportsAutoroutingResolver current-user boundary', () => {
  const context = { req: { user: { sub: 'user-1' } } };
  let currentUser: { requireCurrentPerson: jest.Mock };
  let autorouting: { resolveCurrentUserRoute: jest.Mock };
  let resolver: SportsAutoroutingResolver;

  beforeEach(() => {
    currentUser = { requireCurrentPerson: jest.fn() };
    autorouting = { resolveCurrentUserRoute: jest.fn() };
    resolver = new SportsAutoroutingResolver(currentUser as never, autorouting as never);
  });

  it('requires the current person and forwards only that stable identity to autorouting', async () => {
    const route = { matchId: 'match-1', mode: 'OPERATE' };
    currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    autorouting.resolveCurrentUserRoute.mockResolvedValue(route);

    await expect(resolver.currentUserSportsAutoroute(context as never)).resolves.toBe(route);

    expect(currentUser.requireCurrentPerson).toHaveBeenCalledWith(context);
    expect(autorouting.resolveCurrentUserRoute).toHaveBeenCalledWith('person-1');
  });

  it('preserves the public null route when no actionable sports assignment exists', async () => {
    currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    autorouting.resolveCurrentUserRoute.mockResolvedValue(null);

    await expect(resolver.currentUserSportsAutoroute(context as never)).resolves.toBeNull();
  });

  it('does not query autorouting when current-person resolution fails and preserves service errors', async () => {
    const identityFailure = new Error('Current person unavailable.');
    currentUser.requireCurrentPerson.mockRejectedValue(identityFailure);

    await expect(resolver.currentUserSportsAutoroute(context as never)).rejects.toBe(identityFailure);
    expect(autorouting.resolveCurrentUserRoute).not.toHaveBeenCalled();

    currentUser.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    const routeFailure = new Error('Autorouting unavailable.');
    autorouting.resolveCurrentUserRoute.mockRejectedValue(routeFailure);

    await expect(resolver.currentUserSportsAutoroute(context as never)).rejects.toBe(routeFailure);
  });
});
