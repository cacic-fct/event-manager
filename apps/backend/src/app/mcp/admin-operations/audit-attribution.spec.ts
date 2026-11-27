import { BadRequestException } from '@nestjs/common';
import { AuditLogActorType, AuditLogEntityType, AuditLogOperation } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AUDIT_BATCH_TRANSACTION } from '../../audit-log/audit-transaction-context';
import { adminMcpExecution } from './execution-context';
const { jest } = import.meta;

function fixture() {
  const committed = { auditLogEntry: { create: jest.fn(), findUnique: jest.fn() }, user: { findUnique: jest.fn() } };
  const transaction = {
    // A batch transaction also ensures no uncommitted search publication is scheduled by this test.
    [AUDIT_BATCH_TRANSACTION]: 'batch-test',
    user: { findUnique: jest.fn(async () => ({ name: 'Current operator', email: null })) },
    auditLogEntry: {
      create: jest.fn(async () => ({ id: 'audit-1' })),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new AuditLogService(committed as never, {} as never, {} as never, {} as never, {} as never);
  const options = {
    entityType: AuditLogEntityType.EVENT,
    entityId: 'event-1',
    operation: AuditLogOperation.UPDATE,
    actor: { id: 'old-actor', name: 'Original caller', type: AuditLogActorType.USER },
    before: { name: 'Antes' },
    after: { name: 'Depois' },
    scope: { eventId: 'event-1', permission: Permission.Event.Update },
    summary: 'Nome alterado.',
    metadata: { domainNote: 'preserved' },
  };
  return { committed, transaction, service, options };
}

describe('administrative MCP owning-transaction audit attribution', () => {
  it('adds proposal attribution to the existing domain record inside the supplied transaction', async () => {
    const { committed, transaction, service, options } = fixture();
    const user = { sub: 'current-operator', claims: {} } as AuthenticatedUser;
    await adminMcpExecution.run(
      {
        request: {},
        user,
        phase: 'apply',
        proposalId: 'proposal-1',
        delegationId: 'delegation-1',
        clientId: 'client-1',
        operation: 'updateEvent',
        approvedByName: 'Current operator',
        inTransaction: true,
        beforeTransaction: async () => undefined,
      },
      () => service.record(options, transaction as never),
    );
    expect(committed.auditLogEntry.create).not.toHaveBeenCalled();
    expect(committed.user.findUnique).not.toHaveBeenCalled();
    expect(transaction.user.findUnique).not.toHaveBeenCalled();
    expect(transaction.auditLogEntry.create).toHaveBeenCalledTimes(1);
    expect(transaction.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: 'event-1',
        actorId: 'old-actor',
        actorName: 'Original caller',
        permission: Permission.Event.Update,
        eventId: 'event-1',
        metadata: expect.objectContaining({
          domainNote: 'preserved',
          source: 'mcp',
          approvedById: 'current-operator',
          approvedByName: 'Current operator',
          proposalId: 'proposal-1',
          delegationId: 'delegation-1',
          clientId: 'client-1',
          operation: 'updateEvent',
        }),
      }),
    });
    expect(options.actor.id).toBe('old-actor');
    expect(options.metadata).toEqual({ domainNote: 'preserved' });
  });

  it('rejects audit outside the owning transaction even when an apply capability exists', async () => {
    const { committed, transaction, service, options } = fixture();
    const user = { sub: 'current-operator', claims: {} } as AuthenticatedUser;
    const execution = {
      request: {},
      user,
      phase: 'apply' as const,
      proposalId: 'proposal-1',
      delegationId: 'delegation-1',
      clientId: 'client-1',
      operation: 'updateEvent',
      beforeTransaction: async () => undefined,
    };
    await expect(
      adminMcpExecution.run(execution, () => service.record(options, transaction as never)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      adminMcpExecution.run({ ...execution, inTransaction: true }, () => service.record(options)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.auditLogEntry.create).not.toHaveBeenCalled();
    expect(committed.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'distinguishes explicit unchanged snapshots from missing audit values: %s',
    async (snapshots) => {
      const { transaction, service, options } = fixture();
      const transactionAudit = { businessWrites: true, recorded: false };
      await adminMcpExecution.run(
        {
          request: {},
          user: { sub: 'operator' } as AuthenticatedUser,
          phase: 'apply',
          delegationId: 'delegation',
          clientId: 'client',
          operation: 'updateEvent',
          inTransaction: true,
          beforeTransaction: async () => undefined,
          transactionAudit,
        },
        () =>
          service.record(
            {
              ...options,
              before: snapshots ? { name: 'Same' } : undefined,
              after: snapshots ? { name: 'Same' } : undefined,
            },
            transaction as never,
          ),
      );
      expect(transactionAudit).toEqual(
        snapshots
          ? { businessWrites: true, recorded: false, validatedNoop: true }
          : { businessWrites: true, recorded: false },
      );
      expect(transaction.auditLogEntry.create).not.toHaveBeenCalled();
    },
  );

  it('does not squash distinct approved commands into a prior human update', async () => {
    const { transaction: tx, options } = fixture();
    // Avoid asynchronous synchronization without suppressing the actual squash branch under test.
    const root = new AuditLogService(
      tx as never,
      {} as never,
      {} as never,
      {
        upsertAuditLogEntry: jest.fn(async () => undefined),
      } as never,
      {} as never,
    );
    Reflect.deleteProperty(tx, AUDIT_BATCH_TRANSACTION);
    const user = { sub: 'current-operator', claims: {} } as AuthenticatedUser;
    await adminMcpExecution.run(
      {
        request: {},
        user,
        phase: 'apply',
        proposalId: 'proposal-2',
        delegationId: 'delegation-1',
        clientId: 'client-1',
        operation: 'updateEvent',
      },
      () => root.record(options, tx as never),
    );
    expect(tx.auditLogEntry.findFirst).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.update).not.toHaveBeenCalled();
    expect(tx.auditLogEntry.create).toHaveBeenCalledTimes(1);
  });

  it('preserves domain audit ownership outside an MCP apply context', async () => {
    const { transaction, service, options } = fixture();
    await service.record(options, transaction as never);
    expect(transaction.auditLogEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'old-actor',
        metadata: expect.objectContaining({ domainNote: 'preserved' }),
      }),
    });
    const call = transaction.auditLogEntry.create.mock.calls[0];
    expect(JSON.stringify(call)).not.toContain('proposalId');
  });
});
