import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PassThrough, Readable } from 'stream';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom, take } from 'rxjs';
import { MajorEventReceiptsController } from './major-event-receipts.controller';
import { RECEIPT_ADMIN_PERMISSION, CurrentUserReceiptResponse } from './receipt.types';
import { IS_PUBLIC_KEY, REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { RATE_LIMIT_METADATA_KEY } from '../rate-limit/rate-limit.decorator';
import { RATE_LIMIT_POLICIES } from '../rate-limit/rate-limit.policies';

describe('MajorEventReceiptsController', () => {
  let receipts: {
    uploadReceipt: jest.Mock;
    listPendingValidationQueue: jest.Mock;
    getReceiptImage: jest.Mock;
  };
  let replay: {
    scope: jest.Mock;
    replay: jest.Mock;
  };
  let controller: MajorEventReceiptsController;

  beforeEach(() => {
    receipts = {
      uploadReceipt: jest.fn(),
      listPendingValidationQueue: jest.fn(),
      getReceiptImage: jest.fn(),
    };
    replay = {
      scope: jest.fn().mockReturnValue('receipt-scope'),
      replay: jest.fn((_scope: string, _lastEventId: string | undefined, source: unknown) => source),
    };
    controller = new MajorEventReceiptsController(receipts as never, replay as never);
  });

  it('exposes the three receipt routes with protected defaults and the expected SSE permission/rate-limit metadata', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, MajorEventReceiptsController)).toBeUndefined();
    expect(Reflect.getMetadata(PATH_METADATA, MajorEventReceiptsController)).toBe('major-event-receipts');
    expect(Reflect.getMetadata(PATH_METADATA, MajorEventReceiptsController.prototype.uploadReceipt)).toBe(
      'major-events/:majorEventId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, MajorEventReceiptsController.prototype.uploadReceipt)).toBe(1);
    expect(
      Reflect.getMetadata(PATH_METADATA, MajorEventReceiptsController.prototype.streamPendingValidationQueue),
    ).toBe('admin/queue/events');
    expect(
      Reflect.getMetadata(METHOD_METADATA, MajorEventReceiptsController.prototype.streamPendingValidationQueue),
    ).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, MajorEventReceiptsController.prototype.getReceiptImage)).toBe(
      ':receiptId/image',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, MajorEventReceiptsController.prototype.getReceiptImage)).toBe(0);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        MajorEventReceiptsController.prototype.streamPendingValidationQueue,
      ),
    ).toEqual([RECEIPT_ADMIN_PERMISSION]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, MajorEventReceiptsController.prototype.uploadReceipt),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, MajorEventReceiptsController.prototype.getReceiptImage),
    ).toBeUndefined();
    expect(Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, MajorEventReceiptsController.prototype.uploadReceipt)).toEqual({
      policy: RATE_LIMIT_POLICIES.receiptUpload,
      resources: [{ source: 'params', path: 'majorEventId' }],
    });
  });

  it('forwards authenticated uploads, including the multipart file and actor identity, unchanged', async () => {
    const user = { sub: 'person-user' };
    const file = {
      buffer: Buffer.from('receipt'),
      mimetype: 'image/png',
      originalname: 'receipt.png',
      size: 7,
    };
    const result: CurrentUserReceiptResponse = {
      id: 'receipt-1',
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedAt: new Date(publicFixtureDateFromNow(-1)),
      expiresAt: new Date(publicFixtureDateFromNow(1)),
      imageUrl: '/api/major-event-receipts/receipt-1/image',
      processingStatus: 'PENDING',
      amountMatched: null,
      nameMatched: null,
    };
    receipts.uploadReceipt.mockResolvedValue(result);

    await expect(controller.uploadReceipt('major-1', file, { user } as never)).resolves.toBe(result);

    expect(receipts.uploadReceipt).toHaveBeenCalledWith('major-1', file, user);
  });

  it('rejects uploads without an authenticated actor before touching storage services', async () => {
    await expect(
      Promise.resolve().then(() => controller.uploadReceipt('major-1', undefined, {} as never)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(receipts.uploadReceipt).not.toHaveBeenCalled();
  });

  it('normalizes the optional SSE filter, wraps queue snapshots, and preserves the replay cursor', async () => {
    const queue = { pendingCount: 1, items: [] };
    receipts.listPendingValidationQueue.mockResolvedValue(queue);

    const stream = controller.streamPendingValidationQueue('  major-1  ', 'cursor-7');
    const message = await firstValueFrom(stream.pipe(take(1)));

    expect(replay.scope).toHaveBeenCalledWith('receipt-validation-queue', 'major-1');
    expect(replay.replay).toHaveBeenCalledWith('receipt-scope', 'cursor-7', expect.anything());
    expect(receipts.listPendingValidationQueue).toHaveBeenCalledWith('major-1');
    expect(message).toEqual({
      data: {
        type: 'receipt-validation-queue',
        queue,
      },
    });
  });

  it('uses an unfiltered replay scope when the SSE filter is blank', () => {
    controller.streamPendingValidationQueue('  ', undefined);

    expect(replay.scope).toHaveBeenCalledWith('receipt-validation-queue', undefined);
    expect(replay.replay).toHaveBeenCalledWith('receipt-scope', undefined, expect.anything());
  });

  it('shares one queue poll across live clients and releases the scope after disconnect', async () => {
    const queue = { pendingCount: 1, items: [] };
    receipts.listPendingValidationQueue.mockResolvedValue(queue);
    const first = controller.streamPendingValidationQueue('major-1', undefined).pipe(take(1));
    const second = controller.streamPendingValidationQueue('major-1', undefined).pipe(take(1));

    await Promise.all([firstValueFrom(first), firstValueFrom(second)]);

    expect(receipts.listPendingValidationQueue).toHaveBeenCalledTimes(1);
    expect((controller as unknown as { sharedQueueSnapshots: Map<string, unknown> }).sharedQueueSnapshots.size).toBe(0);
  });

  it('propagates queue refresh failures through the SSE source', async () => {
    const failure = new Error('Queue unavailable.');
    receipts.listPendingValidationQueue.mockRejectedValue(failure);

    await expect(
      firstValueFrom(controller.streamPendingValidationQueue(undefined, undefined).pipe(take(1))),
    ).rejects.toBe(failure);
  });

  it('streams protected receipt images with content metadata and the owning actor', async () => {
    const user = { sub: 'person-user' };
    const response = Object.assign(new PassThrough(), { type: jest.fn(), setHeader: jest.fn() });
    const image = {
      stream: Readable.from(['receipt']),
      contentType: 'image/png',
      contentLength: 123,
    };
    receipts.getReceiptImage.mockResolvedValue(image);

    await expect(
      controller.getReceiptImage('receipt-1', { user } as never, response as never),
    ).resolves.toBeUndefined();

    expect(receipts.getReceiptImage).toHaveBeenCalledWith('receipt-1', user);
    expect(response.type).toHaveBeenCalledWith('image/png');
    expect(response.setHeader).toHaveBeenCalledWith('Content-Length', '123');
    expect(response.read()?.toString()).toBe('receipt');
  });

  it('does not set a forged content length when storage omits it', async () => {
    const response = Object.assign(new PassThrough(), { type: jest.fn(), setHeader: jest.fn() });
    receipts.getReceiptImage.mockResolvedValue({
      stream: Readable.from(['receipt']),
      contentType: 'image/jpeg',
      contentLength: undefined,
    });

    await controller.getReceiptImage('receipt-1', { user: { sub: 'person-user' } } as never, response as never);

    expect(response.type).toHaveBeenCalledWith('image/jpeg');
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('destroys the S3 stream when the receipt client disconnects', async () => {
    const source = new PassThrough();
    const response = Object.assign(new PassThrough(), { type: jest.fn(), setHeader: jest.fn() });
    receipts.getReceiptImage.mockResolvedValue({
      stream: source,
      contentType: 'image/png',
      contentLength: undefined,
    });

    const pending = controller.getReceiptImage(
      'receipt-1',
      { user: { sub: 'person-user' } } as never,
      response as never,
    );
    await Promise.resolve();
    response.emit('close');
    await pending;

    expect(source.destroyed).toBe(true);
  });

  it('maps missing actors and service authorization failures without leaking image data', async () => {
    await expect(controller.getReceiptImage('receipt-1', {} as never, {} as never)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(receipts.getReceiptImage).not.toHaveBeenCalled();

    const failure = new ForbiddenException('Receipt access denied.');
    receipts.getReceiptImage.mockRejectedValue(failure);
    await expect(
      controller.getReceiptImage('receipt-1', { user: { sub: 'person-user' } } as never, {} as never),
    ).rejects.toBe(failure);
  });

  it('does not overlap slow queue polls when the interval ticks again', async () => {
    jest.useFakeTimers();
    let subscription: { unsubscribe: () => void } | undefined;
    try {
      let resolveFirst!: (value: { pendingCount: number; items: never[] }) => void;
      const firstPoll = new Promise<{ pendingCount: number; items: never[] }>((resolve) => {
        resolveFirst = resolve;
      });
      receipts.listPendingValidationQueue
        .mockReturnValueOnce(firstPoll)
        .mockResolvedValue({ pendingCount: 0, items: [] });
      subscription = controller.streamPendingValidationQueue(undefined, undefined).subscribe();
      await Promise.resolve();

      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
      expect(receipts.listPendingValidationQueue).toHaveBeenCalledTimes(1);

      resolveFirst({ pendingCount: 1, items: [] });
      await Promise.resolve();
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
      expect(receipts.listPendingValidationQueue).toHaveBeenCalledTimes(2);
    } finally {
      subscription?.unsubscribe();
      jest.useRealTimers();
    }
  });
});
