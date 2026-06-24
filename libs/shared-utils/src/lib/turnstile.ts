export const TURNSTILE_ACTIONS = {
  certificateValidation: 'certificate_validation',
} as const;

export const TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS = '1x00000000000000000000AA';
export const TURNSTILE_TEST_SECRET_KEY_ALWAYS_PASS = '1x0000000000000000000000000000000AA';

export type TurnstileAction = (typeof TURNSTILE_ACTIONS)[keyof typeof TURNSTILE_ACTIONS];
