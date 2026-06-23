export const TURNSTILE_ACTIONS = {
  certificateValidation: 'certificate_validation',
  majorEventSubscription: 'major_event_subscription',
  onlineAttendance: 'online_attendance',
  receiptUpload: 'receipt_upload',
  standaloneEventSubscription: 'standalone_event_subscription',
} as const;

export const TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS = '1x00000000000000000000AA';
export const TURNSTILE_TEST_SECRET_KEY_ALWAYS_PASS = '1x0000000000000000000000000000000AA';
export const TURNSTILE_TOKEN_HEADER = 'x-turnstile-token';

export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];
