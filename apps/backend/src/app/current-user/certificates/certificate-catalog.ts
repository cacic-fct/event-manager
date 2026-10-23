import type { CertificateCatalogPage } from '@cacic-fct/shared-utils';
import { Prisma } from '@prisma/client';

// Selection needs labels and ownership targets, never recipient PII or rendered snapshots.
export const CERTIFICATE_CATALOG_SELECT = {
  id: true,
  configId: true,
  issuedAt: true,
  certificateTemplate: { select: { id: true, name: true } },
  config: {
    select: {
      id: true,
      name: true,
      scope: true,
      certificateText: true,
      majorEventId: true,
      eventGroupId: true,
      eventId: true,
      folderId: true,
      certificateTemplate: { select: { id: true, name: true } },
      eventGroup: { select: { majorEventId: true } },
      event: {
        select: {
          majorEventId: true,
          eventGroupId: true,
          eventGroup: { select: { majorEventId: true } },
        },
      },
    },
  },
} satisfies Prisma.CertificateSelect;

type CatalogCertificate = Prisma.CertificateGetPayload<{ select: typeof CERTIFICATE_CATALOG_SELECT }>;

type CatalogTarget = Omit<CertificateCatalogPage['items'][number], 'certificate'>;

function certificateTarget(config: CatalogCertificate['config']): CatalogTarget {
  const majorEventId =
    config.majorEventId ??
    config.eventGroup?.majorEventId ??
    config.event?.majorEventId ??
    config.event?.eventGroup?.majorEventId;
  const eventGroupId = config.eventGroupId ?? config.event?.eventGroupId;

  if (config.scope === 'OTHER') {
    return { targetType: 'folder', targetId: config.folderId ?? config.id };
  }
  if (majorEventId) {
    return { targetType: 'major-event', targetId: majorEventId };
  }
  if (eventGroupId) {
    return { targetType: 'event-group', targetId: eventGroupId };
  }
  if (config.eventId) {
    return { targetType: 'event', targetId: config.eventId };
  }
  // Historical certificates remain downloadable even if their target was removed.
  return { targetType: 'folder', targetId: config.id };
}

export function toCertificateCatalogItem(certificate: CatalogCertificate): CertificateCatalogPage['items'][number] {
  const { config } = certificate;
  return {
    ...certificateTarget(config),
    certificate: {
      id: certificate.id,
      configId: certificate.configId,
      issuedAt: certificate.issuedAt.toISOString(),
      certificateTemplate: certificate.certificateTemplate,
      config: {
        id: config.id,
        name: config.name,
        scope: config.scope,
        certificateText: config.certificateText,
        certificateTemplate: config.certificateTemplate,
      },
    },
  };
}
