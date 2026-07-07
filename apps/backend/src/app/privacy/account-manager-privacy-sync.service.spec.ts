import { createEventManagerDefaultPrivacySettings } from './account-manager-privacy-sync.service';

describe('AccountManagerPrivacySyncService', () => {
  it('defaults analytics tracking on until Account Manager returns an explicit opt-out', () => {
    expect(createEventManagerDefaultPrivacySettings()).toEqual({
      analytics_tracking: true,
      cookie_banner_accepted: false,
      error_debugging: false,
      performance_monitoring: false,
    });
  });
});
