import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { auditBatchId } from '../audit-log/audit-transaction-context';
import {
  assertJournalReferenceLimits,
  normalizeJournalRelationKeys,
  TransferJournalRecorder,
} from './transfer-journal-recorder';

function fixture(
  model = 'eventGroup',
  current: Record<string, unknown> | null = { id: 'group-1', name: 'Anterior', updatedAt: new Date() },
) {
  let row = current;
  const delegate = {
    findMany: jest.fn(async () => (row ? [{ ...row }] : [])),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      row = { ...row, ...data };
      return row;
    }),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      row = data;
      return row;
    }),
    delete: jest.fn(),
  };
  const client = { [model]: delegate, $executeRawUnsafe: jest.fn(), $queryRawUnsafe: jest.fn() };
  const recorder = new TransferJournalRecorder(client as unknown as Prisma.TransactionClient);
  recorder.setSource({ kind: 'group', id: 'group-1', data: { name: 'Importado' } }, 'update', {
    eventGroupId: 'group-1',
  });
  return { recorder, delegate, client };
}

describe('TransferJournalRecorder fail-closed backups', () => {
  it('records complete trusted scalar snapshots inside the original transaction', async () => {
    const now = new Date();
    const { recorder } = fixture('eventGroup', {
      id: 'group-1',
      name: 'Anterior',
      description: 'Preservada',
      updatedAt: now,
    });
    await recorder.tx.eventGroup.update({ where: { id: 'group-1' }, data: { name: 'Importado' } });
    expect(recorder.mutations).toEqual([
      {
        model: 'eventGroup',
        key: { id: 'group-1' },
        before: { id: 'group-1', name: 'Anterior', description: 'Preservada', updatedAt: now.toISOString() },
        after: { id: 'group-1', name: 'Importado', description: 'Preservada', updatedAt: now.toISOString() },
        source: expect.objectContaining({ kind: 'group', id: 'group-1' }),
      },
    ]);
  });

  it('uses the compound attendance key instead of requiring an invented row ID', async () => {
    const { recorder } = fixture('eventAttendance', { personId: 'person-1', eventId: 'event-1', status: 'PRESENT' });
    await recorder.tx.eventAttendance.update({
      where: { personId_eventId: { personId: 'person-1', eventId: 'event-1' } },
      data: { status: 'ABSENT' },
    });
    expect(recorder.mutations[0]?.key).toEqual({ personId: 'person-1', eventId: 'event-1' });
  });

  it('normalizes one-to-one, list, and compound-key relation references deterministically', () => {
    expect(normalizeJournalRelationKeys('ticketConfig', { id: 'ticket-config-1' })).toEqual([
      { id: 'ticket-config-1' },
    ]);
    expect(normalizeJournalRelationKeys('event', [{ id: 'event-2' }, { id: 'event-1' }])).toEqual([
      { id: 'event-1' },
      { id: 'event-2' },
    ]);
    expect(normalizeJournalRelationKeys('eventFormLinkPriceTier', { linkId: 'link-1', priceTierId: 'tier-1' })).toEqual(
      [{ linkId: 'link-1', priceTierId: 'tier-1' }],
    );
    expect(normalizeJournalRelationKeys('event', null)).toEqual([]);
  });

  it('fails closed when a relation target key is unknown or the reference snapshot exceeds its cap', () => {
    expect(() => normalizeJournalRelationKeys('eventFormLinkPriceTier', { linkId: 'link-1' })).toThrow(
      BadRequestException,
    );
    expect(() => normalizeJournalRelationKeys('missingModel', { id: 'row-1' })).toThrow(BadRequestException);
    expect(() => assertJournalReferenceLimits(1, 5001, 10)).toThrow(BadRequestException);
    expect(() => assertJournalReferenceLimits(1, 1, 20 * 1024 * 1024 + 1)).toThrow(BadRequestException);
  });

  it('rejects nested relation writes and unbacked cascading deletes before executing them', async () => {
    const { recorder, delegate } = fixture();
    await expect(
      recorder.tx.eventGroup.update({ where: { id: 'group-1' }, data: { events: { deleteMany: {} } } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(recorder.tx.eventGroup.delete({ where: { id: 'group-1' } })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(delegate.update).not.toHaveBeenCalled();
    expect(delegate.delete).not.toHaveBeenCalled();
  });

  it('rejects unrecognized raw writes and disguised SQL writes before calling Prisma', async () => {
    const { recorder, client } = fixture();
    await expect(recorder.tx.$executeRawUnsafe('DELETE FROM events')).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      recorder.tx.$queryRawUnsafe('WITH changed AS (DELETE FROM events RETURNING *) SELECT * FROM changed'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(recorder.tx.$queryRawUnsafe('SELECT 1; DELETE FROM events')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(client.$executeRawUnsafe).not.toHaveBeenCalled();
    expect(client.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('stops a write when its backup exceeds the bounded batch size', async () => {
    const { recorder, delegate } = fixture();
    delegate.findMany.mockResolvedValue(Array.from({ length: 5001 }, (_, index) => ({ id: String(index) })));
    await expect(
      recorder.tx.eventGroup.update({ where: { id: 'group-1' }, data: { name: 'Importado' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(delegate.update).not.toHaveBeenCalled();
  });

  it('exposes only an internal audit capability and tracks individual batch audit entries', async () => {
    const tx = { auditLogEntry: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) } };
    const recorder = new TransferJournalRecorder(tx as unknown as Prisma.TransactionClient);
    expect(auditBatchId(recorder.tx)).toBe(recorder.batchId);
    await recorder.tx.auditLogEntry.create({
      data: {
        entityType: 'SYSTEM',
        entityId: 'example',
        operation: 'IMPORT',
        actorType: 'SYSTEM',
        actorName: 'Sistema',
        changes: [],
        changedFields: [],
      },
    });
    expect(recorder.auditEntryIds).toEqual(['audit-1']);
    expect(recorder.mutations).toEqual([]);
  });
});
