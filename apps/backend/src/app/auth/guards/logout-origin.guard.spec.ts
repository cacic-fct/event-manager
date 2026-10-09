import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { LogoutOriginGuard } from './logout-origin.guard';

describe('LogoutOriginGuard', () => {
  const originalEnv = { ...process.env };
  let guard: LogoutOriginGuard;

  beforeEach(() => {
    process.env.KEYCLOAK_ALLOWED_POST_LOGOUT_REDIRECT_ORIGINS = 'https://events.example.com';
    guard = new LogoutOriginGuard();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows an exact configured frontend origin', () => {
    expect(guard.canActivate(contextWithOrigin('https://events.example.com'))).toBe(true);
  });

  it.each([undefined, 'null', 'https://events.example.com.evil.test', 'https://evil.example']) (
    'rejects missing or untrusted origin %s',
    (origin) => {
      expect(() => guard.canActivate(contextWithOrigin(origin))).toThrow(ForbiddenException);
    },
  );
});

function contextWithOrigin(origin: string | undefined): ExecutionContext {
  const request = {
    headers: origin === undefined ? {} : { origin },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
