import type { Prisma } from '@prisma/client';

export function publicCertificateVisibilityWhere(certificateId: string): Prisma.CertificateWhereInput {
  return {
    id: certificateId,
    lgpdDeletionRequestId: null,
    person: { deletedAt: null },
    config: { deletedAt: null, isActive: true },
  };
}

export function publiclyValidCertificateWhere(certificateId: string): Prisma.CertificateWhereInput {
  return {
    ...publicCertificateVisibilityWhere(certificateId),
    deletedAt: null,
    revokedAt: null,
  };
}
