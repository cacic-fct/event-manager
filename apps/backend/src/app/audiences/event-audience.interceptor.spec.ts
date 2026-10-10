import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { defer, firstValueFrom, of } from 'rxjs';
import { IS_PUBLIC_KEY, AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import { ANONYMOUS_AUDIENCE, audienceContext } from './audience-context';
import { EventAudienceInterceptor } from './event-audience.interceptor';
import { PAST_PARTICIPATION_ACCESS } from './past-participation.decorator';

describe('event audience request isolation', () => {
  const member = { ...ANONYMOUS_AUDIENCE, userId: 'user-1', personIds: ['person-1'], isUnesp: true };
  function setup(isPublic = true, historyAccess = false) {
    const audience = { principalForUser: jest.fn().mockResolvedValue(member) };
    const auth = { authenticateSession: jest.fn().mockResolvedValue({ sub: 'user-1' }) };
    const reflector = { getAllAndOverride: jest.fn((key: string) => key === IS_PUBLIC_KEY ? isPublic : key === PAST_PARTICIPATION_ACCESS ? historyAccess : []) };
    const authorization = { assertAudienceForPermissions: jest.fn().mockResolvedValue(undefined), buildResourceContext: jest.fn().mockReturnValue({}) };
    return { audience, auth, authorization, interceptor: new EventAudienceInterceptor(audience as never, auth as never, reflector as never, authorization as never) };
  }

  function graphqlContext(headers: Record<string, string> = {}, operation = 'query') {
    class PublicEventsResolver {}
    const request = { headers, cookies: { [AUTH_SESSION_COOKIE_NAME]: 'session-1' } };
    const context = new ExecutionContextHost([undefined, {}, { req: request }, { operation: { operation } }], PublicEventsResolver, () => undefined);
    context.setType('graphql');
    return context;
  }

  it('authenticates cookie-backed public queries and retains scope through deferred async execution', async () => {
    const { interceptor, auth } = setup();
    const output = await interceptor.intercept(graphqlContext(), { handle: () => defer(async () => {
      await Promise.resolve();
      return audienceContext.getStore();
    }) });
    expect(await firstValueFrom(output)).toEqual(member);
    expect(auth.authenticateSession).toHaveBeenCalledWith('session-1');
    expect(audienceContext.getStore()).toBeUndefined();
  });

  it('makes cacheable public requests anonymous even while a valid session cookie exists', async () => {
    const { interceptor, auth, audience } = setup();
    const output = await interceptor.intercept(graphqlContext({ 'x-event-audience': 'public' }), { handle: () => defer(() => of(audienceContext.getStore())) });
    expect(await firstValueFrom(output)).toEqual(ANONYMOUS_AUDIENCE);
    expect(auth.authenticateSession).not.toHaveBeenCalled();
    expect(audience.principalForUser).not.toHaveBeenCalled();
  });

  it('does not let the public-cache header bypass authorization on protected handlers', async () => {
    const { interceptor, auth, authorization } = setup(false);
    const output = await interceptor.intercept(graphqlContext({ 'x-event-audience': 'public' }), { handle: () => defer(() => of(audienceContext.getStore())) });
    expect(await firstValueFrom(output)).toEqual(member);
    expect(auth.authenticateSession).toHaveBeenCalled();
    expect(authorization.assertAudienceForPermissions).toHaveBeenCalledWith([], {}, member);
  });

  it('allows expired-session refresh and logout handlers to run without trying optional authentication', async () => {
    class AuthController {}
    const { interceptor, auth } = setup();
    const context = new ExecutionContextHost([{ headers: {}, cookies: { [AUTH_SESSION_COOKIE_NAME]: 'expired' } }], AuthController, () => undefined);
    const output = await interceptor.intercept(context, { handle: () => of('refreshed') });
    expect(await firstValueFrom(output)).toBe('refreshed');
    expect(auth.authenticateSession).not.toHaveBeenCalled();
  });

  it('limits the past-participation exception to marked reads without contaminating the request principal', async () => {
    const context = graphqlContext();
    const historyReader = setup(false, true).interceptor;
    const readScope = await firstValueFrom(await historyReader.intercept(context, { handle: () => defer(() => of(audienceContext.getStore())) }));
    expect(readScope).toEqual({ ...member, pastParticipationBefore: expect.any(Date) });
    const catalogReader = setup().interceptor;
    const catalogScope = await firstValueFrom(await catalogReader.intercept(context, { handle: () => defer(() => of(audienceContext.getStore())) }));
    expect(catalogScope).toEqual(member);
  });

  it('runs credential-free public reads with the anonymous audience and still asserts scope', async () => {
    const { interceptor, auth, audience, authorization } = setup();
    audience.principalForUser.mockResolvedValueOnce(ANONYMOUS_AUDIENCE as never);
    const context = graphqlContext();
    context.getArgByIndex(2).req.cookies = {};
    const output = await interceptor.intercept(context, { handle: () => defer(() => of(audienceContext.getStore())) });
    expect(await firstValueFrom(output)).toEqual(ANONYMOUS_AUDIENCE);
    expect(auth.authenticateSession).not.toHaveBeenCalled();
    expect(audience.principalForUser).toHaveBeenCalledWith(undefined);
    expect(authorization.assertAudienceForPermissions).toHaveBeenCalledWith([], {}, ANONYMOUS_AUDIENCE);
  });

  it('falls back to anonymous audience on invalid optional credentials for public routes', async () => {
    const { interceptor, auth, authorization } = setup();
    auth.authenticateSession.mockRejectedValueOnce(new UnauthorizedException('invalid credentials'));
    const handler = { handle: jest.fn(() => defer(() => of(audienceContext.getStore()))) };
    const output = await interceptor.intercept(graphqlContext(), handler);
    expect(await firstValueFrom(output)).toEqual(ANONYMOUS_AUDIENCE);
    expect(handler.handle).toHaveBeenCalled();
    expect(authorization.assertAudienceForPermissions).toHaveBeenCalledWith([], {}, ANONYMOUS_AUDIENCE);
  });

  it('rejects invalid supplied credentials on protected routes', async () => {
    const { interceptor, auth } = setup(false);
    auth.authenticateSession.mockRejectedValueOnce(new UnauthorizedException('invalid credentials'));
    const handler = { handle: jest.fn(() => of('content')) };
    await expect(interceptor.intercept(graphqlContext(), handler)).rejects.toThrow('invalid credentials');
    expect(handler.handle).not.toHaveBeenCalled();
  });

  it('propagates non-authentication failures while resolving optional credentials', async () => {
    const { interceptor, auth } = setup();
    auth.authenticateSession.mockRejectedValueOnce(new Error('key service unavailable'));
    await expect(interceptor.intercept(graphqlContext(), { handle: () => of('content') }))
      .rejects.toThrow('key service unavailable');
  });

  it('never applies historical access to mutations even if the handler is marked', async () => {
    const { interceptor } = setup(false, true);
    const output = await interceptor.intercept(graphqlContext({}, 'mutation'), { handle: () => defer(() => of(audienceContext.getStore())) });
    expect(await firstValueFrom(output)).toEqual(member);
  });
});
