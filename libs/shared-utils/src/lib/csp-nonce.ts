export function createCspNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes));
}

export function applyCspNonceToHtml(html: string, nonce: string): string {
  return html
    .replace(/<app-root\b([^>]*)>/i, (_match, attributes: string) =>
      withNonceAttribute('app-root', attributes, `ngCspNonce="${nonce}"`),
    )
    .replace(/<(script|style)\b([^>]*)>/gi, (_match, tagName: string, attributes: string) =>
      withNonceAttribute(tagName, attributes, `nonce="${nonce}"`),
    );
}

export async function applyCspToHtmlResponse(
  response: Response,
  contentSecurityPolicy: (nonce: string) => string,
  transformHtml: (html: string) => string = (html) => html,
): Promise<Response> {
  const nonce = createCspNonce();
  const headers = new Headers(response.headers);

  headers.delete('content-length');
  headers.set('Content-Security-Policy', contentSecurityPolicy(nonce));
  headers.set('Cache-Control', 'private, no-store, no-transform');
  headers.set('Cloudflare-CDN-Cache-Control', 'no-store, no-transform');

  return new Response(applyCspNonceToHtml(transformHtml(await response.text()), nonce), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withNonceAttribute(tagName: string, attributes: string, nonceAttribute: string): string {
  const attributesWithoutNonce = attributes
    .replace(/\snonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sngcspnonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  return `<${tagName}${attributesWithoutNonce} ${nonceAttribute}>`;
}
