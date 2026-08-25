export type DetectedImageMimeType =
  | 'image/avif'
  | 'image/bmp'
  | 'image/gif'
  | 'image/heic'
  | 'image/heif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/svg+xml'
  | 'image/tiff'
  | 'image/webp';

export function detectImageMimeType(buffer: Uint8Array): DetectedImageMimeType | undefined {
  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  const prefix = decodeAscii(buffer.subarray(0, 12));
  if (prefix.startsWith('GIF87a') || prefix.startsWith('GIF89a')) return 'image/gif';
  if (prefix.startsWith('BM')) return 'image/bmp';
  if (startsWithBytes(buffer, [0x49, 0x49, 0x2a, 0x00]) || startsWithBytes(buffer, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'image/tiff';
  }
  if (prefix.startsWith('RIFF') && prefix.slice(8, 12) === 'WEBP') return 'image/webp';

  if (buffer.length >= 12 && decodeAscii(buffer.subarray(4, 8)) === 'ftyp') {
    const brands = decodeAscii(buffer.subarray(8, Math.min(buffer.length, 32)));
    if (containsIsoBmffBrand(brands, ['avif', 'avis'])) return 'image/avif';
    if (containsIsoBmffBrand(brands, ['heic', 'heix', 'hevc', 'hevx'])) return 'image/heic';
    if (containsIsoBmffBrand(brands, ['mif1', 'msf1'])) return 'image/heif';
  }

  const textPrefix = new TextDecoder().decode(buffer.subarray(0, Math.min(buffer.length, 4_096)));
  if (/^(?:\uFEFF)?\s*(?:<\?xml[^>]*>\s*)?<svg\b/i.test(textPrefix)) return 'image/svg+xml';
  return undefined;
}

export function assertSafeSvg(buffer: Uint8Array): void {
  const source = new TextDecoder().decode(buffer);
  if (
    /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\son\w+\s*=/iu.test(source) ||
    hasExternalSvgReference(source)
  ) {
    throw new UnsafeSvgError();
  }
}

function hasExternalSvgReference(source: string): boolean {
  const attributeReferences = source.matchAll(/\b(?:href|xlink:href|src)\s*=\s*(["'])(.*?)\1/giu);
  for (const match of attributeReferences) {
    if (!match[2].trimStart().startsWith('#')) return true;
  }

  const cssReferences = source.matchAll(/\burl\((.*?)\)/giu);
  for (const match of cssReferences) {
    const reference = match[1].trim().replace(/^(?:"(.*)"|'(.*)')$/u, '$1$2').trimStart();
    if (!reference.startsWith('#')) return true;
  }

  const cssImports = source.matchAll(/@import\s+(?:url\(\s*)?(["'])(.*?)\1\s*\)?/giu);
  for (const match of cssImports) {
    if (!match[2].trimStart().startsWith('#')) return true;
  }
  return false;
}

export class UnsafeSvgError extends Error {
  constructor() {
    super('SVG contains executable content or external resources.');
    this.name = 'UnsafeSvgError';
  }
}

function startsWithBytes(buffer: Uint8Array, signature: readonly number[]): boolean {
  return buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);
}

function decodeAscii(buffer: Uint8Array): string {
  return String.fromCharCode(...buffer);
}

function containsIsoBmffBrand(brands: string, candidates: readonly string[]): boolean {
  for (let offset = 0; offset + 4 <= brands.length; offset += 4) {
    if (candidates.includes(brands.slice(offset, offset + 4))) return true;
  }
  return false;
}
