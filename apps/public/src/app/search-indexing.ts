export const NOINDEX_HEADERS = { 'X-Robots-Tag': 'noindex, nofollow' };

/** Shared by SSR responses and the static sitemap; paths are relative to /app. */
export function shouldNoindexPublicPath(path: string): boolean {
  const normalizedPath = path.split(/[?#]/, 1)[0].replace(/^\/+|\/+$/g, '');
  const query = new URLSearchParams(path.split('#', 1)[0].split('?')[1]);
  return (
    /^(?:profile|preferences|preview|attendance|draws|dev-tools|auth|error|api)(?:\/|$)/.test(normalizedPath) ||
    /^(?:menu|sports|notifications|my-day|index\.html|index\.csr\.html)$/.test(normalizedPath) ||
    /^(?:validate|validar)\/.+/.test(normalizedPath) ||
    (/^(?:validate|validar)$/.test(normalizedPath) && (query.has('certificateId') || query.has('invalidId'))) ||
    (normalizedPath === 'map' && ['participacao', 'periodo', 'evento'].some((key) => query.has(key))) ||
    /^major-event\/[^/]+\/(?:subscription|ranked-subscription|payment)(?:\/|$)/.test(normalizedPath) ||
    /^tournament\/[^/]+\/subscribe(?:\/|$)/.test(normalizedPath) ||
    /^sports\/(?:operate|team)(?:\/|$)/.test(normalizedPath)
  );
}
