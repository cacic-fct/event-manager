import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';
import type { SportsTeamLogoUploadFile } from './sports-team-logo.service';
import {
  SPORTS_TEAM_LOGO_FORMATS,
  SPORTS_TEAM_LOGO_POLICY,
  SportsTeamLogoFormat,
} from './sports-team-logo.policy';

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
  if (file.size !== file.buffer.length || file.buffer.length > SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes) {
    throw new BadRequestException('O logo da equipe deve ter no máximo 15 MB.');
  }

  let metadata;
  try {
    metadata = await sharp(file.buffer, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: SPORTS_TEAM_LOGO_POLICY.maximumPixels,
      pages: 1,
      sequentialRead: true,
      unlimited: false,
    })
      .timeout({ seconds: SPORTS_TEAM_LOGO_POLICY.metadataTimeoutSeconds })
      .metadata();
  } catch {
    throw new BadRequestException('O logo deve ser uma imagem PNG, JPEG, WebP, AVIF ou SVG válida.');
  }

  const detectedFormat =
    metadata.format === 'heif' && file.mimetype.toLowerCase() === 'image/avif' ? 'avif' : metadata.format;
  if (!detectedFormat || !(detectedFormat in SPORTS_TEAM_LOGO_FORMATS)) {
    throw new BadRequestException('O logo deve ser uma imagem PNG, JPEG, WebP, AVIF ou SVG.');
  }
  const format = detectedFormat as SportsTeamLogoFormat;
  const formatDetails = SPORTS_TEAM_LOGO_FORMATS[format];
  if (file.mimetype.toLowerCase() !== formatDetails.mimeType) {
    throw new BadRequestException('O tipo declarado do arquivo não corresponde ao conteúdo da imagem.');
  }
  if (!metadata.width || !metadata.height) {
    throw new BadRequestException('Não foi possível determinar as dimensões do logo.');
  }
  if (
    metadata.width < SPORTS_TEAM_LOGO_POLICY.minimumDimension ||
    metadata.height < SPORTS_TEAM_LOGO_POLICY.minimumDimension ||
    metadata.width * metadata.height > SPORTS_TEAM_LOGO_POLICY.maximumPixels
  ) {
    throw new BadRequestException(
      `O logo deve ter ao menos ${SPORTS_TEAM_LOGO_POLICY.minimumDimension}px por lado e no máximo 64 megapixels.`,
    );
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
    limitInputPixels: SPORTS_TEAM_LOGO_POLICY.maximumPixels,
    pages: 1,
    sequentialRead: true,
    unlimited: false,
  })
    .rotate()
    .resize({
      width: SPORTS_TEAM_LOGO_POLICY.outputDimension,
      height: SPORTS_TEAM_LOGO_POLICY.outputDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .avif({ quality: 82, effort: 4 })
    .toBuffer();
  const normalizedMetadata = await sharp(normalizedBuffer).metadata();
  const normalized = {
    buffer: normalizedBuffer,
    mimeType: SPORTS_TEAM_LOGO_POLICY.outputMimeType,
    extension: SPORTS_TEAM_LOGO_POLICY.outputExtension,
  };
  return {
    ...normalized,
    width: normalizedMetadata.width ?? metadata.width,
    height: normalizedMetadata.height ?? metadata.height,
  };
}
