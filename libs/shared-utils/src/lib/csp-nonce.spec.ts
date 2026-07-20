import { applyCspNonceToHtml, applyCspToHtmlResponse, createCspNonce } from './csp-nonce';

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

  it('applies a fresh CSP nonce while preserving the response metadata', async () => {
    const response = await applyCspToHtmlResponse(
      new Response('<script nonce="stale"></script>', {
        status: 201,
        headers: { 'Content-Length': '31', 'X-Request-Id': 'request-id' },
      }),
      (nonce) => `script-src 'nonce-${nonce}'`,
      (html) => html.replace('<script', '<script data-transformed'),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Security-Policy')).toMatch(/^script-src 'nonce-[A-Za-z0-9+/]{22}=='$/);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, no-transform');
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store, no-transform');
    expect(response.headers.get('Content-Length')).toBeNull();
    expect(response.headers.get('X-Request-Id')).toBe('request-id');
    await expect(response.text()).resolves.toMatch(
      /^<script data-transformed nonce="[A-Za-z0-9+/]{22}=="><\/script>$/,
    );
  });
});
