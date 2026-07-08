import {
  TURNSTILE_ACTIONS,
  TURNSTILE_TEST_SECRET_KEY_ALWAYS_PASS,
  TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS,
  type TurnstileAction,
} from './turnstile';

describe('Turnstile constants', () => {
  it('keeps the certificate validation action stable for frontend and backend verification', () => {
    const action: TurnstileAction = TURNSTILE_ACTIONS.certificateValidation;

    expect(action).toBe('certificate_validation');
  });

  it('exposes Cloudflare test keys for deterministic non-production validation', () => {
    expect(TURNSTILE_TEST_SITE_KEY_ALWAYS_PASS).toBe('1x00000000000000000000AA');
    expect(TURNSTILE_TEST_SECRET_KEY_ALWAYS_PASS).toBe('1x0000000000000000000000000000000AA');
  });
});
