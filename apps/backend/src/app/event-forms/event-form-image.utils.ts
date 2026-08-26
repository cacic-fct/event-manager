import { BadRequestException } from '@nestjs/common';
import { FormImage } from '@cacic-fct/form-contracts';
import { assertSafeSvg, detectImageMimeType, UnsafeSvgError } from '@cacic-fct/shared-utils';
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
export const EVENT_FORM_IMAGE_FORMAT_ERROR =
  'A imagem precisa estar em um formato suportado: AVIF, BMP, GIF, HEIC, HEIF, JPEG, PNG, SVG, TIFF ou WebP.';

export function isAllowedEventFormImageMimeType(mimeType: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

export async function convertEventFormImageToAvif(file: UploadedEventFormImageFile | undefined): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
  originalMimeType: string;
}> {
  const { file: validFile, mimeType: originalMimeType } = assertValidImageUpload(file);

  if (originalMimeType === 'image/svg+xml') {
    try {
      assertSafeSvg(validFile.buffer);
    } catch (error: unknown) {
      if (error instanceof UnsafeSvgError) {
        throw new BadRequestException('O SVG não pode conter scripts, entidades, conteúdo HTML ou recursos externos.');
      }
      throw error;
    }
  }
  const metadata = await readProcessableImageMetadata(validFile.buffer, originalMimeType);
  const operation = createSharp(validFile.buffer, originalMimeType).rotate();
  if (originalMimeType === 'image/svg+xml') {
    const longEdge = Math.max(metadata.width, metadata.height);
    const targetLongEdge = Math.min(SVG_OUTPUT_MAXIMUM_LONG_EDGE, Math.max(SVG_OUTPUT_MINIMUM_LONG_EDGE, longEdge));
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

function assertValidImageUpload(file: UploadedEventFormImageFile | undefined): {
  file: UploadedEventFormImageFile;
  mimeType: string;
} {
  if (!file) {
    throw new BadRequestException('Selecione uma imagem para enviar.');
  }
  if (file.size > MAX_EVENT_FORM_IMAGE_FILE_SIZE_BYTES) {
    throw new BadRequestException('A imagem deve ter no máximo 15 MB.');
  }
  const detectedMimeType = detectImageMimeType(file.buffer);
  if (!detectedMimeType || !ALLOWED_IMAGE_MIME_TYPES.has(detectedMimeType)) {
    throw new BadRequestException(EVENT_FORM_IMAGE_FORMAT_ERROR);
  }
  return { file, mimeType: detectedMimeType };
}

export function toEventFormImageModel(image: { id: string; width: number; height: number }): FormImage {
  return {
    id: image.id,
    url: `/api/event-forms/images/${encodeURIComponent(image.id)}`,
    width: image.width,
    height: image.height,
  };
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
