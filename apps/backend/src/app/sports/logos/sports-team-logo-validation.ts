import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import type { SportsTeamLogoUploadFile } from './sports-team-logo.service';

const MAX_SIZE_BYTES = 15 * 1024 * 1024;
const MIN_DIMENSION = 16;
const OUTPUT_DIMENSION = 1600;
const MAX_PIXELS = 64 * 1024 * 1024;
const METADATA_TIMEOUT_SECONDS = 3;
const LOGO_FORMATS = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' },
  avif: { mimeType: 'image/avif', extension: 'avif' },
  svg: { mimeType: 'image/svg+xml', extension: 'svg' },
} as const;
type SportsTeamLogoFormat = keyof typeof LOGO_FORMATS;

export async function validateSportsTeamLogoImage(file: SportsTeamLogoUploadFile | undefined): Promise<{
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
}> {
  if (!file?.buffer?.length) {
    throw new BadRequestException('O arquivo de logo da equipe é obrigatório.');
  }
  if (file.size !== file.buffer.length || file.buffer.length > MAX_SIZE_BYTES) {
    throw new BadRequestException('O logo da equipe deve ter no máximo 15 MiB.');
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: MAX_PIXELS,
      pages: 1,
      sequentialRead: true,
      unlimited: false,
    })
      .timeout({ seconds: METADATA_TIMEOUT_SECONDS })
      .metadata();
  } catch {
    throw new BadRequestException('O logo deve ser uma imagem PNG, JPEG, WebP, AVIF ou SVG válida.');
  }

  const detectedFormat =
    metadata.format === 'heif' && file.mimetype.toLowerCase() === 'image/avif' ? 'avif' : metadata.format;
  if (!detectedFormat || !(detectedFormat in LOGO_FORMATS)) {
    throw new BadRequestException('O logo deve ser uma imagem PNG, JPEG, WebP, AVIF ou SVG.');
  }
  const format = detectedFormat as SportsTeamLogoFormat;
  const formatDetails = LOGO_FORMATS[format];
  if (file.mimetype.toLowerCase() !== formatDetails.mimeType) {
    throw new BadRequestException('O tipo declarado do arquivo não corresponde ao conteúdo da imagem.');
  }
  if (!metadata.width || !metadata.height) {
    throw new BadRequestException('Não foi possível determinar as dimensões do logo.');
  }
  if (
    metadata.width < MIN_DIMENSION ||
    metadata.height < MIN_DIMENSION ||
    metadata.width * metadata.height > MAX_PIXELS
  ) {
    throw new BadRequestException(`O logo deve ter ao menos ${MIN_DIMENSION}px por lado e no máximo 64 megapixels.`);
  }
  if (metadata.pages && metadata.pages > 1) {
    throw new BadRequestException('O logo não pode ser animado ou ter várias páginas.');
  }

  if (format === 'svg') {
    const source = file.buffer.toString('utf8');
    if (
      /<!DOCTYPE|<!ENTITY|<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|data:|\/\/)/iu.test(
        source,
      )
    ) {
      throw new BadRequestException('O SVG contém recursos externos ou conteúdo executável.');
    }
  }
  const normalizedBuffer = await sharp(file.buffer, {
    animated: false,
    failOn: 'warning',
    limitInputPixels: MAX_PIXELS,
    pages: 1,
    sequentialRead: true,
    unlimited: false,
  })
    .rotate()
    .resize({
      width: OUTPUT_DIMENSION,
      height: OUTPUT_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .avif({ quality: 82, effort: 4 })
    .toBuffer();
  const normalizedMetadata = await sharp(normalizedBuffer).metadata();
  const normalized = {
    buffer: normalizedBuffer,
    mimeType: 'image/avif',
    extension: 'avif',
  };
  return {
    ...normalized,
    width: normalizedMetadata.width ?? metadata.width,
    height: normalizedMetadata.height ?? metadata.height,
  };
}
