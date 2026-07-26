import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';
import { deleteReceiptObjects, findReceiptObjectKeys } from './lgpd-receipts';

describe('LgpdService receipt cleanup', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('skips receipt storage lookup when there are no people to delete', async () => {
    const { prisma } = context;

    await expect(findReceiptObjectKeys(prisma, [])).resolves.toEqual([]);

    expect(prisma.majorEventReceipt.findMany).not.toHaveBeenCalled();
  });

  it('deduplicates receipt object cleanup and logs non-error deletion failures', async () => {
    const s3 = {
      deleteFile: jest.fn<Promise<void>, [string]>().mockRejectedValueOnce('access denied'),
    };
    const logger = {
      warn: jest.fn<void, [string]>(),
    };

    await expect(
      deleteReceiptObjects(s3, logger, ['receipts/duplicate.png', 'receipts/duplicate.png']),
    ).rejects.toThrow('Failed to delete LGPD receipt object(s): receipts/duplicate.png');

    expect(s3.deleteFile).toHaveBeenCalledTimes(1);
    expect(s3.deleteFile).toHaveBeenCalledWith('receipts/duplicate.png');
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to delete LGPD receipt object receipts/duplicate.png: access denied',
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'LGPD receipt cleanup completed with 1 failed object deletion(s): receipts/duplicate.png',
    );
  });

  it('only soft-deletes data when scheduling deletion so it can be cancelled', async () => {
    const { s3, tx, service } = context;

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 2,
    });

    expect(s3.deleteFile).not.toHaveBeenCalled();
    expect(tx.majorEventReceiptValidationAction.deleteMany).not.toHaveBeenCalled();
    expect(tx.majorEventReceipt.deleteMany).not.toHaveBeenCalled();
    expect(tx.eventDraft.update).not.toHaveBeenCalled();
    expect(tx.offlineEventAttendanceSubmission.update).not.toHaveBeenCalled();
  });

});
