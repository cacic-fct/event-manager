import { applyCspNonceToHtml, createCspNonce } from './csp-nonce';

describe('CSP nonce helpers', () => {
  it('creates a unique base64 nonce from cryptographically secure random bytes', () => {
    const firstNonce = createCspNonce();
    const secondNonce = createCspNonce();

    expect(firstNonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(secondNonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(secondNonce).not.toBe(firstNonce);
  });

  it('replaces stale nonces on the Angular root, styles, and scripts', () => {
    const html = '<style nonce="stale"></style><script src="main.js"></script><app-root ngCspNonce="stale"></app-root>';

    expect(applyCspNonceToHtml(html, 'fresh')).toBe(
      '<style nonce="fresh"></style><script src="main.js" nonce="fresh"></script><app-root ngCspNonce="fresh"></app-root>',
    );
  });
});
