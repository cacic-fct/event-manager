import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogActorType, AuditLogEntityType, AuditLogOperation, AuditLogRevertMode } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';

describe('AuditLogService', () => {
  let prisma: ReturnType<typeof createPrisma>;
  let service: AuditLogService;

  beforeEach(() => {
    prisma = createPrisma();
    service = new AuditLogService(prisma as never, { assertPermissions: jest.fn() } as never);
  });

  it('records field-level changes while ignoring bookkeeping fields', async () => {
    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      entityLabel: 'Ana Silva',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        email: 'renan@example.com',
        type: AuditLogActorType.USER,
      },
      before: {
        name: 'Ana Silva',
        email: null,
        updatedAt: '2026-06-21T17:00:00.000Z',
        paymentInfo: {
          bankName: 'Banco A',
        },
      },
      after: {
        name: 'Ana Clara Silva',
        email: 'ana@unesp.br',
        updatedAt: '2026-06-21T17:10:00.000Z',
        paymentInfo: {
          bankName: 'Banco B',
        },
      },
      scope: {
        permission: Permission.Person.Update,
      },
      summary: 'Pessoa atualizada pelo painel administrativo.',
      squashWindowMs: 0,
    });

    expect(prisma.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: AuditLogEntityType.PERSON,
        entityId: 'person-1',
        actorId: 'admin-1',
        actorName: 'Renan Yudi',
        permission: Permission.Person.Update,
        changedFields: ['email', 'name', 'paymentInfo.bankName'],
      }),
    });
    expect(createdChanges(prisma)).toEqual([
      expect.objectContaining({ field: 'email', before: null, after: 'ana@unesp.br' }),
      expect.objectContaining({ field: 'name', before: 'Ana Silva', after: 'Ana Clara Silva' }),
      expect.objectContaining({ field: 'paymentInfo.bankName', before: 'Banco A', after: 'Banco B' }),
    ]);
    expect(createdChanges(prisma).some((change) => change.field === 'updatedAt')).toBe(false);
  });

  it('squashes consecutive updates for the same entity and actor inside the squash window', async () => {
    prisma.auditLogEntry.findFirst.mockResolvedValue({
      id: 'audit-1',
      entityLabel: 'Ana Silva',
      summary: 'Pessoa atualizada.',
      before: {
        name: 'Ana Silva',
        email: 'ana@example.com',
      },
    });

    await service.record({
      entityType: AuditLogEntityType.PERSON,
      entityId: 'person-1',
      entityLabel: 'Ana Clara Silva',
      operation: AuditLogOperation.UPDATE,
      actor: {
        id: 'admin-1',
        name: 'Renan Yudi',
        type: AuditLogActorType.USER,
      },
      before: {
        name: 'Ana Maria Silva',
        email: 'ana@example.com',
      },
      after: {
        name: 'Ana Clara Silva',
        email: 'ana@unesp.br',
      },
      scope: {
        permission: Permission.Person.Update,
      },
    });

    expect(prisma.auditLogEntry.create).not.toHaveBeenCalled();
    expect(prisma.auditLogEntry.update).toHaveBeenCalledWith({
      where: {
        id: 'audit-1',
      },
      data: expect.objectContaining({
        entityLabel: 'Ana Clara Silva',
        changedFields: ['email', 'name'],
        groupedCount: {
          increment: 1,
        },
      }),
    });
    expect(updatedChanges(prisma)).toEqual([
      expect.objectContaining({ field: 'email', before: 'ana@example.com', after: 'ana@unesp.br' }),
      expect.objectContaining({ field: 'name', before: 'Ana Silva', after: 'Ana Clara Silva' }),
    ]);
  });

  it('builds the same encoded composite ids used by attendance audit entries', () => {
    expect(service.buildCompositeEntityId(['person:1', 'event/2'])).toBe('person%3A1:event%2F2');
  });

  it('does not offer automatic reversal for multi-entity merge operations', async () => {
    prisma.auditLogEntry.findUnique.mockResolvedValue({
      id: 'audit-merge',
      operation: AuditLogOperation.MERGE,
      revertedAt: null,
    });

    await expect(
      service.revertEntry({ entryId: 'audit-merge', mode: AuditLogRevertMode.ENTRY_ONLY }, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createPrisma() {
  return {
    auditLogEntry: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function createdChanges(prisma: ReturnType<typeof createPrisma>): AuditChange[] {
  return prisma.auditLogEntry.create.mock.calls[0][0].data.changes;
}

function updatedChanges(prisma: ReturnType<typeof createPrisma>): AuditChange[] {
  return prisma.auditLogEntry.update.mock.calls[0][0].data.changes;
}

type AuditChange = {
  field: string;
  before: unknown;
  after: unknown;
};
