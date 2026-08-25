export interface RateLimitPolicy {
  readonly name: string;
  readonly windowMs: number;
  readonly freeAttempts: number;
  readonly baseCooldownMs: number;
  readonly maxCooldownMs: number;
  readonly maxAttempts?: number;
}

const minute = 60_000;

export const RATE_LIMIT_POLICIES = {
  authPasswordLogin: {
    name: 'auth-password-login',
    windowMs: 15 * minute,
    freeAttempts: 5,
    baseCooldownMs: 30_000,
    maxCooldownMs: 15 * minute,
    maxAttempts: 20,
  },
  authCallback: {
    name: 'auth-callback',
    windowMs: 15 * minute,
    freeAttempts: 20,
    baseCooldownMs: 5_000,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
  authRefresh: {
    name: 'auth-refresh',
    windowMs: 15 * minute,
    freeAttempts: 30,
    baseCooldownMs: 5_000,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
  authLogout: {
    name: 'auth-logout',
    windowMs: 15 * minute,
    freeAttempts: 30,
    baseCooldownMs: 5_000,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
  onlineAttendanceConfirmation: {
    name: 'online-attendance-confirmation',
    windowMs: 15 * minute,
    freeAttempts: 0,
    baseCooldownMs: 2_000,
    maxCooldownMs: minute,
    maxAttempts: 3,
  },
  standaloneEventSubscription: {
    name: 'standalone-event-subscription',
    windowMs: 15 * minute,
    freeAttempts: 4,
    baseCooldownMs: 30_000,
    maxCooldownMs: 10 * minute,
  },
  majorEventSubscription: {
    name: 'major-event-subscription',
    windowMs: 15 * minute,
    freeAttempts: 4,
    baseCooldownMs: 30_000,
    maxCooldownMs: 10 * minute,
  },
  receiptUpload: {
    name: 'receipt-upload',
    windowMs: 2 * 60 * minute,
    freeAttempts: 1,
    baseCooldownMs: minute,
    maxCooldownMs: 30 * minute,
  },
  publicCertificateValidation: {
    name: 'public-certificate-validation',
    windowMs: minute,
    freeAttempts: 5,
    baseCooldownMs: minute,
    maxCooldownMs: minute,
    maxAttempts: 5,
  },
  publicCertificateDownload: {
    name: 'public-certificate-download',
    windowMs: minute,
    freeAttempts: 10,
    baseCooldownMs: minute,
    maxCooldownMs: minute,
    maxAttempts: 10,
  },
  currentUserCertificateArchive: {
    name: 'current-user-certificate-archive',
    windowMs: 15 * minute,
    freeAttempts: 2,
    baseCooldownMs: 15 * minute,
    maxCooldownMs: 15 * minute,
    maxAttempts: 2,
  },
  publicEvents: {
    name: 'public-events',
    windowMs: minute,
    freeAttempts: 60,
    baseCooldownMs: minute,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
  publicAnalytics: {
    name: 'public-analytics-tunnel',
    windowMs: minute,
    freeAttempts: 30,
    baseCooldownMs: 5_000,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
  publicWeather: {
    name: 'public-weather',
    windowMs: minute,
    freeAttempts: 30,
    baseCooldownMs: 5_000,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
  currentUserMyDay: {
    name: 'current-user-my-day',
    windowMs: 5 * minute,
    freeAttempts: 30,
    baseCooldownMs: 5_000,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
} as const satisfies Record<string, RateLimitPolicy>;
