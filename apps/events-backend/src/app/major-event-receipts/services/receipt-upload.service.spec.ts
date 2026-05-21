import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { Readable } from 'stream';
import { ReceiptUploadService } from './receipt-upload.service';

describe('ReceiptUploadService', () => {
  const user = { sub: 'user-1', token: 'token', permissionSet: new Set<string>() } as never;
  const prisma = {
    majorEventReceipt: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    majorEventSubscription: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const s3 = {
    uploadFile: jest.fn(),
    downloadFile: jest.fn(),
  };
  const currentUserContext = {
    requireCurrentPerson: jest.fn(),
    resolveCurrentUserContext: jest.fn(),
  };
  const attendanceCategories = {
    refreshForMajorEventPerson: jest.fn(),
  };
  const dashboardInsights = {
    invalidateCachedInsights: jest.fn(),
  };
  const keycloakAuthService = {
    evaluateAccessTokenPermissions: jest.fn(),
  };
  const receiptQueue = {
    add: jest.fn(),
  };
  let service: ReceiptUploadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReceiptUploadService(
      prisma as never,
      s3 as never,
      currentUserContext as never,
      attendanceCategories as never,
      dashboardInsights as never,
      keycloakAuthService as never,
      receiptQueue as never,
    );
  });

  it('returns the current user latest receipt when present', async () => {
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    prisma.majorEventReceipt.findFirst.mockResolvedValue(createReceipt());

    await expect(service.getCurrentReceipt('major-1', user)).resolves.toEqual(
      expect.objectContaining({
        id: 'receipt-1',
        imageUrl: '/api/major-event-receipts/receipt-1/image',
      }),
    );
  });

  it('rejects uploads when the subscription cannot receive receipts', async () => {
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    prisma.majorEventSubscription.findFirst.mockResolvedValue(null);

    await expect(service.uploadReceipt('major-1', createFile(), user)).rejects.toThrow(NotFoundException);

    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      majorEvent: {
        isPaymentRequired: false,
        subscriptionEndDate: null,
      },
    });

    await expect(service.uploadReceipt('major-1', createFile(), user)).rejects.toThrow(BadRequestException);
  });

  it('uploads, records, queues, and maps a receipt', async () => {
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      majorEvent: {
        isPaymentRequired: true,
        subscriptionEndDate: null,
      },
    });
    prisma.majorEventReceipt.findFirst.mockResolvedValue(null);
    s3.uploadFile.mockResolvedValue({ key: 'object-key', size: 123 });
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        majorEventReceipt: {
          create: jest.fn().mockResolvedValue(createReceipt()),
        },
        majorEventSubscription: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      }),
    );

    await expect(service.uploadReceipt('major-1', createFile(), user)).resolves.toEqual(
      expect.objectContaining({
        id: 'receipt-1',
      }),
    );

    expect(s3.uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('major-events/major-1/subscriptions/subscription-1/receipts/'),
      expect.any(Buffer),
      'image/png',
      expect.objectContaining({
        majorEventId: 'major-1',
      }),
      expect.any(Date),
    );
    expect(receiptQueue.add).toHaveBeenCalledWith('process', { receiptId: 'receipt-1' }, expect.any(Object));
    expect(dashboardInsights.invalidateCachedInsights).toHaveBeenCalled();
  });

  it('serves receipt images to the owning person', async () => {
    const stream = Readable.from(['image']);
    prisma.majorEventReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      personId: 'person-1',
      objectKey: 'object-key',
      mimeType: 'image/png',
      expiresAt: new Date('2100-01-01T00:00:00.000Z'),
    });
    keycloakAuthService.evaluateAccessTokenPermissions.mockResolvedValue([]);
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    s3.downloadFile.mockResolvedValue({ stream, contentType: undefined, contentLength: 5 });

    await expect(service.getReceiptImage('receipt-1', user)).resolves.toEqual({
      stream,
      contentType: 'image/png',
      contentLength: 5,
    });
  });

  it('rejects image reads for missing, expired, and unauthorized receipts', async () => {
    prisma.majorEventReceipt.findUnique.mockResolvedValue(null);
    await expect(service.getReceiptImage('receipt-1', user)).rejects.toThrow(NotFoundException);

    prisma.majorEventReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      personId: 'person-1',
      objectKey: 'object-key',
      mimeType: 'image/png',
      expiresAt: new Date('2000-01-01T00:00:00.000Z'),
    });
    await expect(service.getReceiptImage('receipt-1', user)).rejects.toThrow(GoneException);

    prisma.majorEventReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      personId: 'person-1',
      objectKey: 'object-key',
      mimeType: 'image/png',
      expiresAt: new Date('2100-01-01T00:00:00.000Z'),
    });
    keycloakAuthService.evaluateAccessTokenPermissions.mockResolvedValue([]);
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'other-person' } });
    await expect(service.getReceiptImage('receipt-1', user)).rejects.toThrow(ForbiddenException);
  });
});

function createFile() {
  return {
    buffer: Buffer.from('image'),
    mimetype: 'image/png',
    originalname: 'receipt.png',
    size: 123,
  };
}

function createReceipt() {
  return {
    id: 'receipt-1',
    fileName: 'receipt.png',
    mimeType: 'image/png',
    sizeBytes: 123,
    uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
    expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    processingStatus: 'PENDING',
    amountMatched: null,
    nameMatched: null,
  };
}
