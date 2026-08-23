import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ReceiptProcessingStatus } from '@prisma/client';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ReceiptAnalysisService } from './receipt-analysis.service';
import {
  MAJOR_EVENT_RECEIPTS_QUEUE,
  MAX_RECEIPT_FILE_SIZE_BYTES,
  MAX_RECEIPT_OCR_IMAGE_DIMENSION_PIXELS,
  RECEIPT_IMAGE_CONVERSION_TIMEOUT_SECONDS,
  RECEIPT_OCR_TIMEOUT_MS,
  ReceiptProcessingJob,
  RECEIPT_PROCESSING_ATTEMPTS,
} from './receipt.types';
import {
  ReceiptImageProcessingLimitError,
  ReceiptImageProcessingTimeoutError,
  createReceiptSharp,
  isReceiptImageProcessingError,
  isSharpInputLimitError,
  isSharpTimeoutError,
  normalizeReceiptImageProcessingError,
  readProcessableReceiptImageMetadata,
} from './utils/receipt-image-processing.utils';
import { processReceiptPdf, ReceiptPdfProcessingError } from './utils/receipt-pdf-processing.utils';
import { isPdfReceiptMimeType } from './utils/receipt-file.utils';
import { buildBullMqJobId } from '../queues/bullmq-job-id';

const RECONCILE_PENDING_RECEIPTS_JOB = 'reconcile-pending-receipts';

sharp.cache({ files: 0, items: 0, memory: 32 });
sharp.concurrency(1);

@Processor(MAJOR_EVENT_RECEIPTS_QUEUE, {
  concurrency: 1,
})
@Injectable()
export class MajorEventReceiptsProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MajorEventReceiptsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly analysis: ReceiptAnalysisService,
    @InjectQueue(MAJOR_EVENT_RECEIPTS_QUEUE)
    private readonly receiptQueue: Queue = { add: async () => undefined } as unknown as Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.receiptQueue.upsertJobScheduler(
      buildBullMqJobId('receipt-processing', 'reconcile-pending'),
      { pattern: '* * * * *' },
      {
        name: RECONCILE_PENDING_RECEIPTS_JOB,
        data: {},
        opts: {
          removeOnComplete: true,
          removeOnFail: 50,
        },
      },
    );
  }

  async process(job: Job<ReceiptProcessingJob | Record<string, never>>): Promise<void> {
    if (job.name === RECONCILE_PENDING_RECEIPTS_JOB) {
      await this.reconcilePendingReceipts();
      return;
    }
    const receiptJob = job.data as Partial<ReceiptProcessingJob>;
    if (job.name !== 'process' || typeof receiptJob.receiptId !== 'string' || !receiptJob.receiptId.trim()) {
      throw new UnrecoverableError(`Unsupported or malformed receipt job: ${job.name}.`);
    }
    await this.processReceipt(receiptJob.receiptId);
  }

  private async reconcilePendingReceipts(): Promise<void> {
    const receipts = await this.prisma.majorEventReceipt.findMany({
      where: {
        processingStatus: ReceiptProcessingStatus.PENDING,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
      orderBy: { uploadedAt: 'asc' },
      take: 100,
    });
    const results = await Promise.allSettled(
      receipts.map((receipt) => this.enqueuePendingReceipt(receipt.id)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Could not requeue pending receipt ${receipts[index]?.id ?? 'unknown'}: ${this.formatErrorMessage(result.reason)}`,
        );
      }
    });
  }

  private async enqueuePendingReceipt(receiptId: string): Promise<void> {
    const jobId = buildBullMqJobId('receipt-processing', receiptId);
    const queue = this.receiptQueue as Queue & {
      getJob?: (id: string) => Promise<{ getState: () => Promise<string>; remove: () => Promise<void>; retry: (state: 'failed') => Promise<void> } | undefined>;
    };
    const existing = await queue.getJob?.(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'failed') {
        try {
          await existing.remove();
        } catch {
          await existing.retry('failed');
          return;
        }
      } else if (state !== 'completed') {
        return;
      } else {
        await existing.remove();
      }
    }

    await this.receiptQueue.add(
      'process',
      { receiptId },
      {
        jobId,
        attempts: RECEIPT_PROCESSING_ATTEMPTS,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 365 * 24 * 60 * 60 },
        removeOnFail: 50,
      },
    );
  }

  private async processReceipt(receiptId: string): Promise<void> {
    const receipt = await this.prisma.majorEventReceipt.findUnique({
      where: {
        id: receiptId,
      },
      include: {
        subscription: {
          include: {
            person: true,
            majorEvent: {
              include: {
                majorEventPrices: {
                  include: {
                    tiers: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!receipt || receipt.expiresAt < new Date()) {
      return;
    }

    try {
      const storedFile = await this.s3.downloadFile(receipt.objectKey);
      this.assertStoredObjectSizeWithinLimit(storedFile.contentLength);
      const originalBuffer = await this.streamToBuffer(storedFile.stream, MAX_RECEIPT_FILE_SIZE_BYTES);
      const processedPdf = isPdfReceiptMimeType(receipt.mimeType) ? await processReceiptPdf(originalBuffer) : undefined;
      const receiptImageBuffer = processedPdf?.previewBuffer ?? originalBuffer;
      const receiptText = processedPdf
        ? processedPdf.text
        : await this.recognizeRasterReceiptText(receiptImageBuffer);
      const expectedAmountCents = this.resolveExpectedAmountCents(receipt.subscription);
      const analysis = this.analysis.analyze(receiptText, receipt.subscription.person.name, expectedAmountCents);

      await this.prisma.majorEventReceipt.update({
        where: {
          id: receipt.id,
        },
        data: {
          processingStatus: ReceiptProcessingStatus.OCR_DONE,
          processedAt: new Date(),
          processingError: null,
          ocrText: receiptText,
          expectedAmountCents: analysis.expectedAmountCents,
          matchedAmountCents: analysis.matchedAmountCents,
          amountMatched: analysis.amountMatched,
          matchedAmountText: analysis.matchedAmountText,
          nameMatched: analysis.nameMatched,
          matchedNameText: analysis.matchedNameText,
        },
      });

      await this.convertReceiptToAvif(receipt.id, receipt.objectKey, receiptImageBuffer, receipt.expiresAt);
    } catch (error: unknown) {
      const processingErrorMessage = error instanceof Error ? error.message : 'Unknown receipt processing error.';
      this.logger.error(`Failed to process receipt ${receiptId}`, error);
      try {
        await this.prisma.majorEventReceipt.update({
          where: {
            id: receiptId,
          },
          data: {
            processingStatus: ReceiptProcessingStatus.FAILED,
            processingError: processingErrorMessage,
            processedAt: new Date(),
          },
        });
      } catch (bookkeepingError: unknown) {
        this.logger.error(
          `Failed to persist FAILED status for receipt ${receiptId}; preserving the processing error.`,
          bookkeepingError instanceof Error ? bookkeepingError.stack : String(bookkeepingError),
        );
      }
      throw this.toBullProcessingError(error, processingErrorMessage);
    }
  }

  private async prepareForOcr(buffer: Buffer): Promise<Buffer> {
    return this.runReceiptImageOperation(
      createReceiptSharp(buffer)
        .rotate()
        .resize({
          width: MAX_RECEIPT_OCR_IMAGE_DIMENSION_PIXELS,
          height: MAX_RECEIPT_OCR_IMAGE_DIMENSION_PIXELS,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .grayscale()
        .png({
          adaptiveFiltering: true,
          compressionLevel: 9,
        })
        .timeout({ seconds: RECEIPT_IMAGE_CONVERSION_TIMEOUT_SECONDS })
        .toBuffer(),
      'Receipt OCR image preparation',
    );
  }

  private async recognizeRasterReceiptText(buffer: Buffer): Promise<string> {
    await readProcessableReceiptImageMetadata(buffer);
    return this.recognizeReceiptText(await this.prepareForOcr(buffer));
  }

  private async convertReceiptToAvif(
    receiptId: string,
    previousObjectKey: string,
    originalBuffer: Buffer,
    expiresAt: Date,
  ): Promise<void> {
    const avifBuffer = await this.runReceiptImageOperation(
      createReceiptSharp(originalBuffer)
        .rotate()
        .avif({
          quality: 62,
          effort: 4,
        })
        .timeout({ seconds: RECEIPT_IMAGE_CONVERSION_TIMEOUT_SECONDS })
        .toBuffer(),
      'Receipt AVIF conversion',
    );
    const avifObjectKey = previousObjectKey.replace(/\.[^.]+$/, '.avif');

    const uploadResult = await this.s3.uploadFile(
      avifObjectKey,
      avifBuffer,
      'image/avif',
      {
        receiptId,
        convertedFrom: previousObjectKey,
        expiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    );

    try {
      await this.prisma.majorEventReceipt.update({
        where: {
          id: receiptId,
        },
        data: {
          objectKey: uploadResult.key,
          mimeType: 'image/avif',
          sizeBytes: uploadResult.size,
          processingStatus: ReceiptProcessingStatus.CONVERTED,
          processingError: null,
          processedAt: new Date(),
        },
      });
    } catch (error: unknown) {
      // The derivative is not authoritative until the row points at it.
      // Compensate the newly uploaded object when that database step fails.
      if (uploadResult.key !== previousObjectKey) {
        await this.s3.deleteFile(uploadResult.key).catch((cleanupError: unknown) => {
          this.logger.warn(
            `Could not clean up orphaned receipt derivative ${uploadResult.key}: ${this.formatErrorMessage(cleanupError)}`,
          );
        });
      }
      throw error;
    }

    if (uploadResult.key !== previousObjectKey) {
      // Old-object deletion is derived cleanup. A failure here must not
      // rewrite a successfully converted receipt as FAILED.
      await this.s3.deleteFile(previousObjectKey).catch((error: unknown) => {
        this.logger.warn(
          `Could not delete superseded receipt object ${previousObjectKey}: ${this.formatErrorMessage(error)}`,
        );
      });
    }
  }

  private async recognizeReceiptText(ocrBuffer: Buffer): Promise<string> {
    const worker = await createWorker('por', undefined, {
      errorHandler: (error: unknown) => this.logger.warn(`Receipt OCR worker error: ${this.formatErrorMessage(error)}`),
      logger: () => undefined,
    });
    let terminatedByTimeout = false;

    try {
      const result = await this.withTimeout(
        worker.recognize(ocrBuffer, {}, { text: true }),
        RECEIPT_OCR_TIMEOUT_MS,
        'Receipt OCR',
        () => {
          terminatedByTimeout = true;
          return worker.terminate();
        },
      );

      return result.data.text;
    } finally {
      if (!terminatedByTimeout) {
        await worker.terminate().catch((error: unknown) => {
          this.logger.warn(`Failed to terminate receipt OCR worker: ${this.formatErrorMessage(error)}`);
        });
      }
    }
  }

  private async runReceiptImageOperation<T>(operation: Promise<T>, operationName: string): Promise<T> {
    try {
      return await operation;
    } catch (error: unknown) {
      if (isSharpTimeoutError(error)) {
        throw new ReceiptImageProcessingTimeoutError(
          `${operationName} timed out after ${RECEIPT_IMAGE_CONVERSION_TIMEOUT_SECONDS} seconds.`,
        );
      }

      if (isSharpInputLimitError(error)) {
        throw new ReceiptImageProcessingLimitError('Receipt image exceeds processing limits.');
      }

      throw normalizeReceiptImageProcessingError(error, `${operationName} failed.`);
    }
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName: string,
    onTimeout?: () => Promise<unknown> | unknown,
  ): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new ReceiptImageProcessingTimeoutError(`${operationName} timed out after ${timeoutMs} ms.`));
            Promise.resolve(onTimeout?.()).catch((error: unknown) => {
              this.logger.warn(`Failed to stop timed-out ${operationName}: ${this.formatErrorMessage(error)}`);
            });
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private assertStoredObjectSizeWithinLimit(contentLength: number | undefined): void {
    if (contentLength && contentLength > MAX_RECEIPT_FILE_SIZE_BYTES) {
      throw new ReceiptImageProcessingLimitError('Receipt image stored object exceeds the upload size limit.');
    }
  }

  private toBullProcessingError(error: unknown, message: string): Error {
    if (isReceiptImageProcessingError(error) || error instanceof ReceiptPdfProcessingError) {
      const unrecoverable = new UnrecoverableError(message);
      Object.defineProperty(unrecoverable, 'cause', { value: error, configurable: true });
      return unrecoverable;
    }

    return error instanceof Error ? error : new Error(message);
  }

  private resolveExpectedAmountCents(subscription: {
    amountPaid: number | null;
    paymentTier: string | null;
    createdByMethod: string;
    majorEvent: {
      majorEventPrices: Array<{
        tiers: Array<{
          name: string;
          value: number;
        }>;
      }>;
    };
  }): number | undefined {
    if (subscription.createdByMethod === 'SELF_SUBSCRIPTION') {
      return this.resolvePriceTierAmountCents(subscription) ?? subscription.amountPaid ?? undefined;
    }

    if (subscription.amountPaid != null) {
      return subscription.amountPaid;
    }

    return this.resolvePriceTierAmountCents(subscription);
  }

  private resolvePriceTierAmountCents(subscription: {
    paymentTier: string | null;
    majorEvent: {
      majorEventPrices: Array<{
        tiers: Array<{
          name: string;
          value: number;
        }>;
      }>;
    };
  }): number | undefined {
    const paymentTier = subscription.paymentTier?.trim().toLowerCase();
    const tiers = subscription.majorEvent.majorEventPrices.flatMap((price) => price.tiers);
    if (paymentTier) {
      return tiers.find((tier) => tier.name.trim().toLowerCase() === paymentTier)?.value;
    }

    return tiers.length === 1 ? tiers[0].value : undefined;
  }

  private async streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        throw new ReceiptImageProcessingLimitError('Receipt image stream exceeds the upload size limit.');
      }

      chunks.push(buffer);
    }

    return Buffer.concat(chunks);
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
