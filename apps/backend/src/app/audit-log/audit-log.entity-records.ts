import { BadRequestException } from '@nestjs/common';
import { AuditLogEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getAuditLogRevertConfig } from './audit-log.revert-config';

export async function findCurrentAuditEntityRecord(
  prisma: PrismaService,
  entityType: AuditLogEntityType,
  entityId: string,
): Promise<Record<string, unknown> | null> {
  switch (entityType) {
    case AuditLogEntityType.PERSON:
      return prisma.people.findUnique({ where: { id: entityId }, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.EVENT:
      return prisma.event.findUnique({ where: { id: entityId }, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.MAJOR_EVENT:
      return prisma.majorEvent.findUnique({ where: { id: entityId }, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.EVENT_GROUP:
      return prisma.eventGroup.findUnique({ where: { id: entityId }, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.PLACE_PRESET:
      return prisma.placePreset.findUnique({ where: { id: entityId }, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.PERMISSION_GRANT:
      return prisma.eventManagerPermissionGrant.findUnique({
        where: { id: entityId },
        select: getAuditLogRevertConfig(entityType).select,
      });
    default:
      return null;
  }
}

export async function updateAuditEntityRecord(
  tx: Prisma.TransactionClient,
  entityType: AuditLogEntityType,
  entityId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (entityType) {
    case AuditLogEntityType.PERSON:
      return tx.people.update({ where: { id: entityId }, data, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.EVENT:
      return tx.event.update({ where: { id: entityId }, data, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.MAJOR_EVENT:
      return tx.majorEvent.update({ where: { id: entityId }, data, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.EVENT_GROUP:
      return tx.eventGroup.update({ where: { id: entityId }, data, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.PLACE_PRESET:
      return tx.placePreset.update({ where: { id: entityId }, data, select: getAuditLogRevertConfig(entityType).select });
    case AuditLogEntityType.PERMISSION_GRANT:
      return tx.eventManagerPermissionGrant.update({
        where: { id: entityId },
        data,
        select: getAuditLogRevertConfig(entityType).select,
      });
    default:
      throw new BadRequestException('Esse tipo de registro não pode ser desfeito automaticamente.');
  }
}
