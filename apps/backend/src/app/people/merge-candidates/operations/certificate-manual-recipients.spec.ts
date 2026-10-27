import { moveManualRecipients, restoreManualRecipients } from './certificate-manual-recipients';
import { parseMovedRelations } from './snapshots';
const { jest } = import.meta;

function fixture() {
  const recipient = {
    findMany: jest.fn().mockResolvedValue([{ configId: 'new' }, { configId: 'shared' }, { configId: 'removed' }]),
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  return { recipient, tx: { certificateManualRecipient: recipient } };
}

describe('manual certificate recipients during people merges', () => {
  it('transfers unissued selections, coalesces duplicates, and restores removed target selections on undo', async () => {
    const { tx, recipient } = fixture();
    const removedAt = new Date(Date.now() - 60_000);
    recipient.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ removedAt: null })
      .mockResolvedValueOnce({ removedAt });
    const snapshot = await moveManualRecipients(tx as never, 'source', 'target');
    expect(snapshot).toEqual({
      movedConfigIds: ['new'],
      reactivated: [{ configId: 'removed', removedAt: removedAt.toISOString() }],
    });
    expect(recipient.update).toHaveBeenNthCalledWith(1, {
      where: { configId_personId: { configId: 'new', personId: 'source' } },
      data: { personId: 'target' },
    });
    expect(recipient.update).toHaveBeenNthCalledWith(2, {
      where: { configId_personId: { configId: 'removed', personId: 'target' } },
      data: { removedAt: null },
    });
    expect(recipient.update).toHaveBeenCalledTimes(2);
    await restoreManualRecipients(tx as never, 'source', 'target', snapshot);
    expect(recipient.updateMany).toHaveBeenNthCalledWith(1, {
      where: { configId: 'new', personId: 'target', removedAt: null },
      data: { personId: 'source' },
    });
    expect(recipient.updateMany).toHaveBeenNthCalledWith(2, {
      where: { configId: 'removed', personId: 'target', removedAt: null },
      data: { removedAt },
    });
  });

  it('rejects undo if a transferred selection was subsequently removed', async () => {
    const { tx, recipient } = fixture();
    recipient.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      restoreManualRecipients(tx as never, 'source', 'target', {
        movedConfigIds: ['config'],
        reactivated: [],
      }),
    ).rejects.toThrow('changed after the merge');
  });

  it('round-trips membership snapshots and accepts historical merge snapshots', () => {
    const historical = {
      sourceAttendances: [],
      sourceLectures: [],
      insertedAttendanceEventIds: [],
      insertedLectureEventIds: [],
      movedEventSubscriptionIds: [],
      movedMajorEventSubscriptionIds: [],
    };
    const manualRecipients = {
      movedConfigIds: ['config'],
      reactivated: [{ configId: 'other', removedAt: new Date().toISOString() }],
    };
    expect(parseMovedRelations(historical).manualRecipients).toBeUndefined();
    expect(parseMovedRelations({ ...historical, manualRecipients }).manualRecipients).toEqual(manualRecipients);
  });
});
