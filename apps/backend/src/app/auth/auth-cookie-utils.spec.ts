import { readAuthCookie } from './auth-cookie-utils';

describe('readAuthCookie', () => {
  it('ignores malformed values and keeps reading matching cookies', () => {
    expect(
      readAuthCookie(
        { headers: { cookie: 'refresh=%E0%A4%A; refresh=valid%20value' } } as never,
        'refresh',
      ),
    ).toBe('valid value');
  });
});
