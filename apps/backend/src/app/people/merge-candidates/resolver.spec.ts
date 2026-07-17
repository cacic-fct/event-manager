import { MergeCandidatesResolver } from './resolver';

describe('MergeCandidatesResolver', () => {
  it('uses the authenticated user from either GraphQL request property for audit records', () => {
    const resolver = new MergeCandidatesResolver({} as never, {} as never);
    const requestUser = { sub: 'request-user' } as never;
    const reqUser = { sub: 'req-user' } as never;
    const getUser = (resolver as unknown as {
      getUser(context: { req?: { user?: typeof reqUser }; request?: { user?: typeof reqUser } }): typeof reqUser;
    }).getUser.bind(resolver);

    expect(getUser({ request: { user: requestUser } })).toBe(requestUser);
    expect(getUser({ req: { user: reqUser }, request: { user: requestUser } })).toBe(reqUser);
    expect(getUser({})).toBeUndefined();
  });
});
