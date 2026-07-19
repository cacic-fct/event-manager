import { describe, expect, it } from 'vitest';
import { assertTrustedExternalScriptUrl } from './trusted-types';

describe('assertTrustedExternalScriptUrl', () => {
  it('accepts only the external scripts declared in the Trusted Types policy', () => {
    expect(assertTrustedExternalScriptUrl('https://a.cacic.com.br/b.js')).toBe('https://a.cacic.com.br/b.js');
    expect(assertTrustedExternalScriptUrl('https://challenges.cloudflare.com/turnstile/v0/api.js')).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js',
    );
  });

  it('rejects a different path, origin, or protocol', () => {
    expect(() => assertTrustedExternalScriptUrl('https://a.cacic.com.br/other.js')).toThrow(
      'External script URL is not approved',
    );
    expect(() => assertTrustedExternalScriptUrl('https://example.com/b.js')).toThrow(
      'External script URL is not approved',
    );
    expect(() => assertTrustedExternalScriptUrl('http://a.cacic.com.br/b.js')).toThrow(
      'External script URL is not approved',
    );
  });
});
