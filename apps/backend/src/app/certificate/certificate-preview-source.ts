import { createHash } from 'node:crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { ANONYMOUS_AUDIENCE, audienceContext } from '../audiences/audience-context';
import { publiclyValidCertificateWhere } from './public-certificate-visibility';

export const CERTIFICATE_PREVIEW_QUEUE = 'public-certificate-preview';
export const CERTIFICATE_PREVIEW_JOB = 'render';
export const CERTIFICATE_PREVIEW_SWEEP = 'expire';
export const CERTIFICATE_PREVIEW_MAX_AGE_MS = 22_000;
export const CERTIFICATE_PREVIEW_MAX_HTML_BYTES = 8 * 1024 * 1024;
export const CERTIFICATE_PREVIEW_MAX_BYTES = 64 * 1024;

export interface CertificatePreviewJob {
  certificateId: string;
  revision: string;
}

export function isCertificatePreviewId(value: string): boolean {
  // Current IDs are UUIDv7. Also accept URL-safe IDs for older records.
  return /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

export async function findCertificatePreviewSource(prisma: PrismaService, certificateId: string) {
  const source = await audienceContext.run({ ...ANONYMOUS_AUDIENCE, bypass: true }, () =>
    prisma.certificate.findFirst({
      where: publiclyValidCertificateWhere(certificateId),
      select: {
        issuedAt: true,
        updatedAt: true,
        config: { select: { updatedAt: true } },
        certificateTemplate: { select: { id: true, updatedAt: true, contentChecksum: true } },
      },
    }),
  );
  if (!source) {
    return null;
  }

  const revision = createHash('sha256')
    .update(
      JSON.stringify([
        'pdf-first-page-avif-v2',
        process.env.PUBLIC_APP_ORIGIN?.trim() || 'http://localhost:4200',
        certificateId,
        source,
      ]),
    )
    .digest('hex');
  return { revision, issuedAt: source.issuedAt };
}
