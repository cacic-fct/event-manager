import { CertificateScope } from '@cacic-fct/shared-data-types';
import { NovuNotificationsService } from '../notifications/novu-notifications.service';
import { CertificateConfigRecord, CertificateRecord } from './certificate.constants';

export async function notifyCertificateAvailable(
  notifications: NovuNotificationsService | undefined,
  certificate: CertificateRecord,
): Promise<void> {
  if (!notifications) return;

  await notifications.notifyCertificateAvailable({
    certificateId: certificate.id,
    configId: certificate.configId,
    certificateName: certificate.config.name,
    targetName: getCertificateTargetName(certificate.config),
    issuedAt: certificate.issuedAt,
    recipient: notifications.mapPersonToRecipient(certificate.person),
  });
}

function getCertificateTargetName(config: CertificateConfigRecord): string | null {
  switch (config.scope) {
    case CertificateScope.EVENT:
      return config.event?.name ?? null;
    case CertificateScope.EVENT_GROUP:
      return config.eventGroup?.name ?? null;
    case CertificateScope.MAJOR_EVENT:
      return config.majorEvent?.name ?? null;
    case CertificateScope.OTHER:
      return config.folder?.name ?? null;
  }
}
