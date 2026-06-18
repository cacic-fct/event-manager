import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ReceiptProcessingStatus } from '@prisma/client';
import { Job, UnrecoverableError } from 'bullmq';
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

sharp.cache({ files: 0, items: 0, memory: 32 });
sharp.concurrency(1);

@Processor(MAJOR_EVENT_RECEIPTS_QUEUE, {
  concurrency: 1,
})
export class MajorEventReceiptsProcessor extends WorkerHost {
  private readonly logger = new Logger(MajorEventReceiptsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly analysis: ReceiptAnalysisService,
  ) {
    super();
  }

  async process(job: Job<ReceiptProcessingJob>): Promise<void> {
    await this.processReceipt(job.data.receiptId);
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
      await readProcessableReceiptImageMetadata(originalBuffer);
      const ocrBuffer = await this.prepareForOcr(originalBuffer);
      const ocrText = await this.recognizeReceiptText(ocrBuffer);
      const expectedAmountCents = this.resolveExpectedAmountCents(receipt.subscription);
      const analysis = this.analysis.analyze(ocrText, receipt.subscription.person.name, expectedAmountCents);

      await this.prisma.majorEventReceipt.update({
        where: {
          id: receipt.id,
        },
        data: {
          processingStatus: ReceiptProcessingStatus.OCR_DONE,
          processedAt: new Date(),
          processingError: null,
          ocrText,
          expectedAmountCents: analysis.expectedAmountCents,
          matchedAmountCents: analysis.matchedAmountCents,
          amountMatched: analysis.amountMatched,
          matchedAmountText: analysis.matchedAmountText,
          nameMatched: analysis.nameMatched,
          matchedNameText: analysis.matchedNameText,
        },
      });

      await this.convertReceiptToAvif(receipt.id, receipt.objectKey, originalBuffer, receipt.expiresAt);
    } catch (error: unknown) {
      const processingErrorMessage = error instanceof Error ? error.message : 'Unknown receipt processing error.';
      this.logger.error(`Failed to process receipt ${receiptId}`, error);
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

    if (uploadResult.key !== previousObjectKey) {
      await this.s3.deleteFile(previousObjectKey);
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
            Promise.resolve(onTimeout?.())
              .catch((error: unknown) => {
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
    if (isReceiptImageProcessingError(error)) {
      return new UnrecoverableError(message);
    }

    return error instanceof Error ? error : new Error(message);
  }

  private resolveExpectedAmountCents(
    subscription: {
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
    },
  ): number | undefined {
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
