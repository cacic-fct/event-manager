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

function withNonceAttribute(tagName: string, attributes: string, nonceAttribute: string): string {
  const attributesWithoutNonce = attributes
    .replace(/\snonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sngcspnonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  return `<${tagName}${attributesWithoutNonce} ${nonceAttribute}>`;
}
