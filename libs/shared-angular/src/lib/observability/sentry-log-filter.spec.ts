import { filterCacicSentryLog } from './sentry-log-filter';

describe('filterCacicSentryLog', () => {
  it('keeps logs in production when diagnostics are enabled', () => {
    const log = { message: 'failure' };

    expect(filterCacicSentryLog(log, true, false)).toBe(log);
  });

  it('drops logs when diagnostics are disabled', () => {
    expect(filterCacicSentryLog({ message: 'failure' }, false, false)).toBeNull();
  });

  it('drops logs in development', () => {
    expect(filterCacicSentryLog({ message: 'failure' }, true, true)).toBeNull();
  });
});
