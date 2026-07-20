import { DefaultRedirectRoute } from '../models';
import { CurrentUserDefaultRedirectResolver } from './resolver';

describe('CurrentUserDefaultRedirectResolver', () => {
  it('resolves the authenticated person and returns only the selected route', async () => {
    const currentUserContext = {
      requireCurrentPerson: jest.fn().mockResolvedValue({ id: 'person-1' }),
    };
    const defaultRedirect = {
      resolve: jest.fn().mockResolvedValue(DefaultRedirectRoute.CALENDAR),
    };
    const resolver = new CurrentUserDefaultRedirectResolver(currentUserContext as never, defaultRedirect as never);

    await expect(resolver.currentUserDefaultRedirect({} as never)).resolves.toBe(DefaultRedirectRoute.CALENDAR);
    expect(defaultRedirect.resolve).toHaveBeenCalledWith('person-1');
  });
});
