import { AuditLogEntityType, Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { validateAttendancePriceTiers } from '../events/attendance-price-tier-policy';

export async function applyAuditLogRevertInvariants(
  tx: Prisma.TransactionClient,
  entityType: AuditLogEntityType,
  updated: Record<string, unknown>,
): Promise<void> {
  if (entityType === AuditLogEntityType.EVENT) {
    const eventGroupId = typeof updated['eventGroupId'] === 'string' ? updated['eventGroupId'] : null;
    const majorEventId = typeof updated['majorEventId'] === 'string' ? updated['majorEventId'] : null;
    if (eventGroupId && majorEventId) {
      await tx.eventGroup.updateMany({
        where: {
          id: eventGroupId,
          deletedAt: null,
          shouldIssueCertificateForEachEvent: true,
        },
        data: { shouldIssueCertificateForEachEvent: false },
      });
    }

    const regularAttendancePriceTierIds = updated['regularAttendancePriceTierIds'];
    if (regularAttendancePriceTierIds !== undefined) {
      if (
        !Array.isArray(regularAttendancePriceTierIds) ||
        !regularAttendancePriceTierIds.every((tierId): tierId is string => typeof tierId === 'string')
      ) {
        throw new BadRequestException('O estado de faixas de preço de presença do evento é inválido.');
      }
      await validateAttendancePriceTiers(tx, {
        majorEventId,
        regularAttendancePriceTierIds,
      });
    }
    return;
  }

  if (entityType !== AuditLogEntityType.EVENT_GROUP || typeof updated['id'] !== 'string') {
    return;
  }

  const shouldIssueCertificate = updated['shouldIssueCertificate'];
  const shouldIssueForNonPaying = updated['shouldIssueCertificateForNonPayingAttendees'];
  const shouldIssueForNonSubscribed = updated['shouldIssueCertificateForNonSubscribedAttendees'];
  if (shouldIssueCertificate !== false && shouldIssueForNonPaying !== false && shouldIssueForNonSubscribed !== false) {
    return;
  }

  await tx.event.updateMany({
    where: { eventGroupId: updated['id'], deletedAt: null },
    data: {
      ...(shouldIssueCertificate === false ? { shouldIssueCertificate: false } : {}),
      ...(shouldIssueCertificate === false || shouldIssueForNonPaying === false
        ? { shouldIssueCertificateForNonPayingAttendees: false }
        : {}),
      ...(shouldIssueCertificate === false || shouldIssueForNonSubscribed === false
        ? { shouldIssueCertificateForNonSubscribedAttendees: false }
        : {}),
    },
  });
}
