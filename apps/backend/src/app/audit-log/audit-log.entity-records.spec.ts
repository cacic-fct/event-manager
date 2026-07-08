import { BadRequestException } from '@nestjs/common';
import { AuditLogEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { findCurrentAuditEntityRecord, updateAuditEntityRecord } from './audit-log.entity-records';
import { getAuditLogRevertConfig } from './audit-log.revert-config';

type AuditEntityDelegateName =
  | 'people'
  | 'event'
  | 'majorEvent'
  | 'eventGroup'
  | 'placePreset'
  | 'eventManagerPermissionGrant';

type AuditEntityDelegate = {
  findUnique: jest.Mock;
  update: jest.Mock;
};

const ENTITY_DELEGATES = [
  [AuditLogEntityType.PERSON, 'people'],
  [AuditLogEntityType.EVENT, 'event'],
  [AuditLogEntityType.MAJOR_EVENT, 'majorEvent'],
  [AuditLogEntityType.EVENT_GROUP, 'eventGroup'],
  [AuditLogEntityType.PLACE_PRESET, 'placePreset'],
  [AuditLogEntityType.PERMISSION_GRANT, 'eventManagerPermissionGrant'],
] as const satisfies readonly (readonly [AuditLogEntityType, AuditEntityDelegateName])[];

function createDelegate(): AuditEntityDelegate {
  return {
    findUnique: jest.fn().mockResolvedValue({ id: 'entity-1' }),
    update: jest.fn().mockResolvedValue({ id: 'entity-1', name: 'Updated entity' }),
  };
}

function createPrismaMock(): Record<AuditEntityDelegateName, AuditEntityDelegate> {
  return {
    people: createDelegate(),
    event: createDelegate(),
    majorEvent: createDelegate(),
    eventGroup: createDelegate(),
    placePreset: createDelegate(),
    eventManagerPermissionGrant: createDelegate(),
  };
}

describe('findCurrentAuditEntityRecord', () => {
  it.each(ENTITY_DELEGATES)('finds current %s records using the configured select', async (entityType, delegateName) => {
    const prisma = createPrismaMock();

    await expect(
      findCurrentAuditEntityRecord(prisma as unknown as PrismaService, entityType, 'entity-1'),
    ).resolves.toEqual({ id: 'entity-1' });

    expect(prisma[delegateName].findUnique).toHaveBeenCalledWith({
      where: { id: 'entity-1' },
      select: getAuditLogRevertConfig(entityType).select,
    });
  });

  it('returns null for unsupported entity types', async () => {
    const prisma = createPrismaMock();

    await expect(
      findCurrentAuditEntityRecord(
        prisma as unknown as PrismaService,
        AuditLogEntityType.EVENT_ATTENDANCE,
        'attendance-1',
      ),
    ).resolves.toBeNull();
  });
});

describe('updateAuditEntityRecord', () => {
  it.each(ENTITY_DELEGATES)('updates %s records using the configured select', async (entityType, delegateName) => {
    const tx = createPrismaMock();
    const data = { name: 'Updated entity' };

    await expect(
      updateAuditEntityRecord(tx as unknown as Prisma.TransactionClient, entityType, 'entity-1', data),
    ).resolves.toEqual({ id: 'entity-1', name: 'Updated entity' });

    expect(tx[delegateName].update).toHaveBeenCalledWith({
      where: { id: 'entity-1' },
      data,
      select: getAuditLogRevertConfig(entityType).select,
    });
  });

  it('rejects unsupported entity types', async () => {
    const tx = createPrismaMock();

    await expect(
      updateAuditEntityRecord(
        tx as unknown as Prisma.TransactionClient,
        AuditLogEntityType.EVENT_ATTENDANCE,
        'attendance-1',
        { deletedAt: new Date('2026-07-07T15:00:00.000Z') },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
