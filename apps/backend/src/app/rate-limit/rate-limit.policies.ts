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
  publicEvents: {
    name: 'public-events',
    windowMs: minute,
    freeAttempts: 60,
    baseCooldownMs: minute,
    maxCooldownMs: minute,
    maxAttempts: 60,
  },
} as const satisfies Record<string, RateLimitPolicy>;
