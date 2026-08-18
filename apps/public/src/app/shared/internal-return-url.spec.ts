import { resolveInternalReturnUrl } from './internal-return-url';

describe('resolveInternalReturnUrl', () => {
  it('keeps an internal application route', () => {
    expect(resolveInternalReturnUrl('/tournament/tournament-1?tab=matches', '/calendar')).toBe(
      '/tournament/tournament-1?tab=matches',
    );
  });

  it.each(['https://example.com', '//example.com', '/\\example.com', 'calendar', null])(
    'rejects unsafe or non-internal return URL %s',
    (returnUrl) => {
      expect(resolveInternalReturnUrl(returnUrl, '/calendar')).toBe('/calendar');
    },
  );
});
