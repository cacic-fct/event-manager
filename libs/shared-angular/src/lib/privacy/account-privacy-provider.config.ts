import type { CacicAccountPrivacyProviderConfig } from '@cacic-fct/account-manager-privacy';

export const CACIC_ACCOUNT_PRIVACY_OPT_OUT_CONFIG = {
  requireCookieBannerAcceptance: false,
  initialPreferences: {
    analytics_tracking: true,
    error_debugging: true,
    performance_monitoring: true,
  },
  unavailablePreferences: {
    analytics_tracking: true,
    error_debugging: true,
    performance_monitoring: true,
  },
} satisfies CacicAccountPrivacyProviderConfig;
