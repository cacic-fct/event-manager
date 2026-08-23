import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { SportsParticipantStatus, SportsPaymentStatus, SubscriptionStatus } from '@prisma/client';
import sharp from 'sharp';
import { Readable } from 'stream';
import { RECEIPT_ADMIN_PERMISSION, RECEIPT_PROCESSING_ATTEMPTS } from '../receipt.types';
import { ReceiptUploadService } from './receipt-upload.service';
import * as receiptPdfProcessing from '../utils/receipt-pdf-processing.utils';

let validPngBuffer: Buffer;

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
    deleteFile: jest.fn(),
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
  const authorizationPolicy = {
    assertPermissions: jest.fn(),
  };
  const receiptQueue = {
    add: jest.fn(),
  };
  let service: ReceiptUploadService;

  beforeAll(async () => {
    validPngBuffer = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    s3.deleteFile.mockResolvedValue(undefined);
    service = new ReceiptUploadService(
      prisma as never,
      s3 as never,
      currentUserContext as never,
      attendanceCategories as never,
      dashboardInsights as never,
      authorizationPolicy as never,
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

    await expect(service.uploadReceipt('major-1', createValidFile(), user)).rejects.toThrow(NotFoundException);

    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      majorEvent: {
        isPaymentRequired: false,
        subscriptionEndDate: null,
      },
    });

    await expect(service.uploadReceipt('major-1', createInvalidFile(), user)).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid receipt images before mutable checks, user lookup, or storage writes', async () => {
    const frozenResources = {
      assertMajorEventMutable: jest.fn(),
    };
    service = new ReceiptUploadService(
      prisma as never,
      s3 as never,
      currentUserContext as never,
      attendanceCategories as never,
      dashboardInsights as never,
      authorizationPolicy as never,
      receiptQueue as never,
      frozenResources as never,
    );

    await expect(service.uploadReceipt('major-1', createInvalidFile(), user)).rejects.toThrow(BadRequestException);

    expect(frozenResources.assertMajorEventMutable).not.toHaveBeenCalled();
    expect(currentUserContext.requireCurrentPerson).not.toHaveBeenCalled();
    expect(prisma.majorEventSubscription.findFirst).not.toHaveBeenCalled();
    expect(s3.uploadFile).not.toHaveBeenCalled();
  });

  it('returns the PDF page-limit feedback before storing the file', async () => {
    const frozenResources = {
      assertMajorEventMutable: jest.fn(),
    };
    service = new ReceiptUploadService(
      prisma as never,
      s3 as never,
      currentUserContext as never,
      attendanceCategories as never,
      dashboardInsights as never,
      authorizationPolicy as never,
      receiptQueue as never,
      frozenResources as never,
    );
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      majorEvent: { isPaymentRequired: true },
    });
    jest
      .spyOn(receiptPdfProcessing, 'assertReceiptPdfPageCountWithinLimit')
      .mockRejectedValue(new receiptPdfProcessing.ReceiptPdfProcessingError('Envie um arquivo com no máximo 10 páginas.'));

    await expect(service.uploadReceipt('major-1', createPdfFile(), user)).rejects.toThrow(
      'Envie um arquivo com no máximo 10 páginas.',
    );

    expect(s3.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads, records, queues, and maps a receipt after the subscription window closes', async () => {
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      majorEvent: {
        isPaymentRequired: true,
        subscriptionEndDate: new Date('2000-01-01T00:00:00.000Z'),
      },
    });
    prisma.majorEventReceipt.findFirst.mockResolvedValue(null);
    s3.uploadFile.mockResolvedValue({ key: 'object-key', size: 123 });
    const tx = {
      majorEventReceipt: {
        create: jest.fn().mockResolvedValue(createReceipt()),
      },
      majorEventSubscription: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({
          subscriptionStatus: SubscriptionStatus.RECEIPT_UNDER_REVIEW,
          majorEvent: { isPaymentRequired: true },
          sportsTournamentParticipants: [
            {
              id: 'participant-1',
              tournamentId: 'tournament-1',
              personId: 'person-1',
              approvedAt: new Date(),
            },
          ],
        }),
      },
      sportsTournamentParticipant: {
        update: jest.fn(),
      },
      sportsRegistrationMember: {
        updateMany: jest.fn(),
      },
      sportsPlayerApplication: {
        updateMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    );

    await expect(service.uploadReceipt('major-1', createValidFile(), user)).resolves.toEqual(
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
        subscriptionId: 'subscription-1',
        personId: 'person-1',
        receiptId: expect.any(String),
        expiresAt: expect.any(String),
      }),
      expect.any(Date),
    );
    expect(receiptQueue.add).toHaveBeenCalledWith(
      'process',
      { receiptId: 'receipt-1' },
      expect.objectContaining({
        attempts: RECEIPT_PROCESSING_ATTEMPTS,
      }),
    );
    expect(tx.sportsTournamentParticipant.update).toHaveBeenCalledWith({
      where: { id: 'participant-1' },
      data: {
        status: SportsParticipantStatus.WAITING_PAYMENT,
        paymentStatus: SportsPaymentStatus.UNDER_REVIEW,
      },
    });
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
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'person-1' } });
    s3.downloadFile.mockResolvedValue({ stream, contentType: undefined, contentLength: 5 });

    await expect(service.getReceiptImage('receipt-1', user)).resolves.toEqual({
      stream,
      contentType: 'image/png',
      contentLength: 5,
    });
    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, [RECEIPT_ADMIN_PERMISSION], {
      receiptId: 'receipt-1',
    });
  });

  it('compensates the uploaded object when the receipt transaction rolls back', async () => {
    currentUserContext.requireCurrentPerson.mockResolvedValue({ id: 'person-1' });
    prisma.majorEventSubscription.findFirst.mockResolvedValue({
      id: 'subscription-1',
      subscriptionStatus: SubscriptionStatus.WAITING_RECEIPT_UPLOAD,
      majorEvent: { isPaymentRequired: true },
    });
    s3.uploadFile.mockResolvedValue({ key: 'orphaned-object', size: validPngBuffer.length });
    prisma.$transaction.mockRejectedValue(new Error('database unavailable'));

    await expect(service.uploadReceipt('major-1', createValidFile(), user)).rejects.toThrow('database unavailable');
    expect(s3.deleteFile).toHaveBeenCalledWith('orphaned-object');
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
    authorizationPolicy.assertPermissions.mockRejectedValue(new ForbiddenException());
    currentUserContext.resolveCurrentUserContext.mockResolvedValue({ person: { id: 'other-person' } });
    await expect(service.getReceiptImage('receipt-1', user)).rejects.toThrow(ForbiddenException);
  });

  it('serves receipt images to scoped receipt admins', async () => {
    const stream = Readable.from(['image']);
    prisma.majorEventReceipt.findUnique.mockResolvedValue({
      id: 'receipt-1',
      personId: 'person-1',
      objectKey: 'object-key',
      mimeType: 'image/png',
      expiresAt: new Date('2100-01-01T00:00:00.000Z'),
    });
    authorizationPolicy.assertPermissions.mockResolvedValue(undefined);
    s3.downloadFile.mockResolvedValue({ stream, contentType: 'image/jpeg', contentLength: 5 });

    await expect(service.getReceiptImage('receipt-1', user)).resolves.toEqual({
      stream,
      contentType: 'image/jpeg',
      contentLength: 5,
    });
    expect(currentUserContext.resolveCurrentUserContext).not.toHaveBeenCalled();
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

function createValidFile() {
  return {
    buffer: validPngBuffer,
    mimetype: 'image/png',
    originalname: 'receipt.png',
    size: validPngBuffer.length,
  };
}

function createInvalidFile() {
  return createFile();
}

function createPdfFile() {
  return {
    buffer: Buffer.from('%PDF-1.7\nunverified PDF contents'),
    mimetype: 'application/pdf',
    originalname: 'receipt.pdf',
    size: 32,
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
