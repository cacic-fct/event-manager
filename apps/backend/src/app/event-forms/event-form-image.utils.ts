import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export type UploadedEventFormImageFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

export const MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_EVENT_FORM_IMAGE_DIMENSION_PIXELS = 12_000;
export const MAX_EVENT_FORM_IMAGE_DECODED_PIXELS = 40_000_000;
const IMAGE_METADATA_TIMEOUT_SECONDS = 5;
const IMAGE_CONVERSION_TIMEOUT_SECONDS = 15;
const SVG_OUTPUT_MINIMUM_LONG_EDGE = 1_200;
const SVG_OUTPUT_MAXIMUM_LONG_EDGE = 2_400;

const SHARP_INPUT_OPTIONS = {
  animated: false,
  failOn: 'warning',
  limitInputPixels: MAX_EVENT_FORM_IMAGE_DECODED_PIXELS,
  pages: 1,
  sequentialRead: true,
  unlimited: false,
} as const;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/bmp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/webp',
]);

export function isAllowedEventFormImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

export async function convertEventFormImageToAvif(file: UploadedEventFormImageFile | undefined): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  originalMimeType: string;
}> {
  assertValidImageUpload(file);
  const originalMimeType = detectImageMimeType(file.buffer);
  if (!originalMimeType) {
    throw new BadRequestException('A imagem precisa estar em um formato raster suportado.');
  }

  if (originalMimeType === 'image/svg+xml') assertSafeSvg(file.buffer);
  const metadata = await readProcessableImageMetadata(file.buffer, originalMimeType);
  const operation = createSharp(file.buffer, originalMimeType).rotate();
  if (originalMimeType === 'image/svg+xml') {
    const longEdge = Math.max(metadata.width, metadata.height);
    const targetLongEdge = Math.min(
      SVG_OUTPUT_MAXIMUM_LONG_EDGE,
      Math.max(SVG_OUTPUT_MINIMUM_LONG_EDGE, longEdge),
    );
    const scale = targetLongEdge / longEdge;
    operation.resize({
      width: Math.max(1, Math.round(metadata.width * scale)),
      height: Math.max(1, Math.round(metadata.height * scale)),
      fit: 'fill',
    });
  }
  const { data, info } = await runImageOperation(
    operation
      .avif({ quality: 62, effort: 4 })
      .timeout({ seconds: IMAGE_CONVERSION_TIMEOUT_SECONDS })
      .toBuffer({ resolveWithObject: true }),
    'Conversão da imagem para AVIF',
  );

  return {
    buffer: data,
    width: info.width || metadata.width,
    height: info.height || metadata.height,
    originalMimeType,
  };
}

export function buildEventFormImageObjectKey(formId: string, imageId: string): string {
  return `event-forms/${formId}/images/${imageId}.avif`;
}

function assertValidImageUpload(
  file: UploadedEventFormImageFile | undefined,
): asserts file is UploadedEventFormImageFile {
  if (!file) {
    throw new BadRequestException('Selecione uma imagem para enviar.');
  }
  if (file.size > MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES) {
    throw new BadRequestException('A imagem deve ter no máximo 15 MB.');
  }
  const detectedMimeType = detectImageMimeType(file.buffer);
  if (!detectedMimeType || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMimeType)) {
    throw new BadRequestException('A imagem precisa estar em um formato raster suportado.');
  }
  file.mimetype = detectedMimeType;
}

function createSharp(buffer: Buffer, mimeType?: string): ReturnType<typeof sharp> {
  return sharp(buffer, {
    ...SHARP_INPUT_OPTIONS,
    ...(mimeType === 'image/svg+xml' ? { density: 144 } : {}),
  });
}

async function readProcessableImageMetadata(
  buffer: Buffer,
  mimeType: string,
): Promise<{ width: number; height: number; pages?: number }> {
  const metadata = await runImageOperation(
    createSharp(buffer, mimeType).timeout({ seconds: IMAGE_METADATA_TIMEOUT_SECONDS }).metadata(),
    'Leitura da imagem',
  );
  if (!metadata.width || !metadata.height) {
    throw new BadRequestException('Não foi possível identificar as dimensões da imagem.');
  }
  if (metadata.pages && metadata.pages > 1) {
    throw new BadRequestException('Imagens animadas ou com múltiplas páginas não são aceitas.');
  }
  if (
    metadata.width > MAX_EVENT_FORM_IMAGE_DIMENSION_PIXELS ||
    metadata.height > MAX_EVENT_FORM_IMAGE_DIMENSION_PIXELS
  ) {
    throw new BadRequestException(`A imagem deve ter no máximo ${MAX_EVENT_FORM_IMAGE_DIMENSION_PIXELS}px por lado.`);
  }
  if (metadata.width * metadata.height > MAX_EVENT_FORM_IMAGE_DECODED_PIXELS) {
    throw new BadRequestException('A imagem tem pixels demais para ser processada com segurança.');
  }
  return { width: metadata.width, height: metadata.height, pages: metadata.pages };
}

async function runImageOperation<T>(operation: Promise<T>, operationName: string): Promise<T> {
  try {
    return await operation;
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('timeout')) {
      throw new BadRequestException(`${operationName} excedeu o tempo limite.`);
    }
    if (message.includes('pixel limit') || message.includes('memory limit') || message.includes('exceeds')) {
      throw new BadRequestException('A imagem excede os limites de processamento.');
    }
    throw new BadRequestException(`${operationName} falhou. Envie uma imagem válida.`);
  }
}

function detectImageMimeType(buffer: Buffer): string | undefined {
  if (buffer.length < 12) return undefined;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  if (buffer.subarray(0, 2).toString('ascii') === 'BM') return 'image/bmp';
  if (
    buffer.subarray(0, 4).equals(Buffer.from([0x49, 0x49, 0x2a, 0x00])) ||
    buffer.subarray(0, 4).equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))
  ) return 'image/tiff';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brands = buffer.subarray(8, Math.min(buffer.length, 32)).toString('ascii');
    if (/\b(?:avif|avis)\b/.test(brands)) return 'image/avif';
    if (/\b(?:heic|heix|hevc|hevx|mif1|msf1)\b/.test(brands)) {
      return brands.includes('mif1') || brands.includes('msf1') ? 'image/heif' : 'image/heic';
    }
  }
  const prefix = buffer.subarray(0, Math.min(buffer.length, 4_096)).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg\b/i.test(prefix)) return 'image/svg+xml';
  return undefined;
}

function assertSafeSvg(buffer: Buffer): void {
  const source = buffer.toString('utf8');
  if (
    /<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b/i.test(source) ||
    /\b(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|\/\/|data:)/i.test(source)
  ) {
    throw new BadRequestException('O SVG não pode conter scripts, entidades, conteúdo HTML ou recursos externos.');
  }
}
