import { Logger } from '@nestjs/common';
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

    await expect(deleteReceiptObjects(s3, logger, ['receipts/duplicate.png', 'receipts/duplicate.png'])).rejects.toThrow(
      'Failed to delete LGPD receipt object(s): receipts/duplicate.png',
    );

    expect(s3.deleteFile).toHaveBeenCalledTimes(1);
    expect(s3.deleteFile).toHaveBeenCalledWith('receipts/duplicate.png');
    expect(logger.warn).toHaveBeenCalledWith('Failed to delete LGPD receipt object receipts/duplicate.png: access denied');
    expect(logger.warn).toHaveBeenCalledWith(
      'LGPD receipt cleanup completed with 1 failed object deletion(s): receipts/duplicate.png',
    );
  });

  it('removes receipt storage and database rows when scheduling deletion', async () => {
    const { s3, tx, service } = context;

    tx.eventDraft.findMany.mockResolvedValueOnce([
      {
        id: 'draft-1',
        createdById: 'old-user',
        createdByEmail: 'old@example.com',
        updatedById: 'admin-user',
        updatedByEmail: 'admin@example.com',
      },
    ]);
    tx.offlineEventAttendanceSubmission.findMany.mockResolvedValueOnce([
      {
        id: 'offline-submission-1',
        personId: 'source-person',
        scannerCode: null,
        manualValue: 'old@example.com',
        authorUserId: null,
        authorName: 'Old User',
        authorEmail: 'old@example.com',
        submittedById: 'new-user',
        committedById: null,
        rejectedById: null,
      },
    ]);

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 4,
    });

    expect(tx.eventDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: {
        createdById: 'anonymized:schedule-1',
        createdByName: 'Usuário anonimizado',
        createdByEmail: null,
      },
    });
    expect(s3.deleteFile).toHaveBeenCalledWith('receipts/old.png');
    expect(tx.majorEventReceiptValidationAction.deleteMany).toHaveBeenCalledWith({
      where: { subscription: { personId: { in: ['source-person', 'target-person'] } } },
    });
    expect(tx.majorEventReceipt.deleteMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] } },
    });
    expect(tx.majorEventReceiptValidationAction.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.majorEventReceipt.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventSubscription.updateMany.mock.invocationCallOrder[0],
    );
    expect(s3.deleteFile.mock.invocationCallOrder[0]).toBeLessThan(
      tx.majorEventReceiptValidationAction.deleteMany.mock.invocationCallOrder[0],
    );
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-submission-1' },
      data: expect.objectContaining({
        personId: null,
        manualValue: '[ANONIMIZADO]',
        authorName: '[ANONIMIZADO]',
        authorEmail: null,
        submittedById: 'anonymized:schedule-1',
      }),
    });
  });

  it('fails before deleting receipt metadata when an S3 cleanup fails', async () => {
    const { prisma, s3, service } = context;
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    prisma.majorEventReceipt.findMany.mockResolvedValueOnce([
      { objectKey: 'receipts/old.png' },
      { objectKey: 'receipts/broken.png' },
      { objectKey: 'receipts/new.png' },
    ]);
    s3.deleteFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('s3 unavailable'))
      .mockResolvedValueOnce(undefined);

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).rejects.toThrow('Failed to delete LGPD receipt object(s): receipts/broken.png');

    expect(s3.deleteFile).toHaveBeenNthCalledWith(1, 'receipts/old.png');
    expect(s3.deleteFile).toHaveBeenNthCalledWith(2, 'receipts/broken.png');
    expect(s3.deleteFile).toHaveBeenNthCalledWith(3, 'receipts/new.png');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('receipts/broken.png'));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
