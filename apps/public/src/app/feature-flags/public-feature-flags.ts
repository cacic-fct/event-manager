export const PUBLIC_FEATURE_FLAGS = {
  calendarTabEnabled: 'events-public-calendar-tab-enabled',
  majorEventTabEnabled: 'events-public-major-event-tab-enabled',
  notificationsTabEnabled: 'events-public-notifications-tab-enabled',
  defaultLoginRedirectPath: 'events-public-default-login-redirect-path',
  calendarDefaultView: 'events-public-calendar-default-view',
  onboardingEnforcementEnabled: 'events-public-onboarding-enforcement-enabled',
  cookieBannerEnabled: 'cookie-banner-enabled',
  undergraduateUnespRoleVerificationDisabled:
    'cacic-undergraduate-unesp-role-verification-disabled',
  interruptionsEnabled: 'events-public-interruptions-enabled',
} as const;

export type PublicFeatureFlagKey = keyof typeof PUBLIC_FEATURE_FLAGS;
export type PublicFeatureFlagName = (typeof PUBLIC_FEATURE_FLAGS)[PublicFeatureFlagKey];

export interface PublicFeatureFlagValues {
  calendarTabEnabled: boolean;
  majorEventTabEnabled: boolean;
  notificationsTabEnabled: boolean;
  defaultLoginRedirectPath: string;
  calendarDefaultView: string;
  onboardingEnforcementEnabled: boolean;
  cookieBannerEnabled: boolean;
  undergraduateUnespRoleVerificationDisabled: boolean;
  interruptionsEnabled: boolean;
}

export const PUBLIC_FEATURE_FLAG_DEFAULTS: PublicFeatureFlagValues = {
  calendarTabEnabled: true,
  majorEventTabEnabled: true,
  notificationsTabEnabled: true,
  defaultLoginRedirectPath: '/calendar',
  calendarDefaultView: 'list',
  onboardingEnforcementEnabled: true,
  cookieBannerEnabled: true,
  undergraduateUnespRoleVerificationDisabled: false,
  interruptionsEnabled: true,
};

export const PUBLIC_FEATURE_FLAG_BOOLEAN_KEYS = [
  'calendarTabEnabled',
  'majorEventTabEnabled',
  'notificationsTabEnabled',
  'onboardingEnforcementEnabled',
  'cookieBannerEnabled',
  'undergraduateUnespRoleVerificationDisabled',
  'interruptionsEnabled',
] as const satisfies readonly PublicFeatureFlagKey[];
