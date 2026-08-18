import { GUARDS_METADATA } from '@nestjs/common/constants';
import { RATE_LIMIT_METADATA_KEY } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { CurrentUserMyDayResolver } from './resolver';

describe('CurrentUserMyDayResolver', () => {
  it('rate limits the authenticated user across all selected dates', () => {
    const handler = CurrentUserMyDayResolver.prototype.currentUserMyDay;

    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([RateLimitGuard]);
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, handler)).toEqual({
      policy: RATE_LIMIT_POLICIES.currentUserMyDay,
      resources: [],
    });
  });
});
