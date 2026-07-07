import { CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG } from './account-privacy-provider.config';

describe('CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG', () => {
  it('tracks analytics unless the user explicitly disables analytics tracking', () => {
    expect(CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG.requireCookieBannerAcceptance).toBe(false);
    expect(CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG.initialPreferences?.analytics_tracking).toBe(true);
    expect(CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG.unavailablePreferences?.analytics_tracking).toBe(true);
  });
});
