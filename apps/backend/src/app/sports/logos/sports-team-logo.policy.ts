export const SPORTS_TEAM_LOGO_FORMATS = {
  jpeg: { mimeType: 'image/jpeg', extension: 'jpg' },
  png: { mimeType: 'image/png', extension: 'png' },
  webp: { mimeType: 'image/webp', extension: 'webp' },
  avif: { mimeType: 'image/avif', extension: 'avif' },
  svg: { mimeType: 'image/svg+xml', extension: 'svg' },
} as const;

export type SportsTeamLogoFormat = keyof typeof SPORTS_TEAM_LOGO_FORMATS;

export const SPORTS_TEAM_LOGO_POLICY = {
  maximumUploadBytes: 15 * 1024 * 1024,
  minimumDimension: 16,
  outputDimension: 1600,
  maximumPixels: 64 * 1024 * 1024,
  metadataTimeoutSeconds: 3,
  outputMimeType: 'image/avif',
  outputExtension: 'avif',
  acceptedInputDescription: 'PNG, JPEG, WebP, AVIF ou SVG',
  acceptedInputMimeTypes: Object.values(SPORTS_TEAM_LOGO_FORMATS).map((format) => format.mimeType),
} as const;
