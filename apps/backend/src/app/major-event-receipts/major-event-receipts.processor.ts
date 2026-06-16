import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ReceiptProcessingStatus } from '@prisma/client';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { recognize } from 'tesseract.js';
import { Readable } from 'stream';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { ReceiptAnalysisService } from './receipt-analysis.service';
import { MAJOR_EVENT_RECEIPTS_QUEUE, ReceiptProcessingJob } from './receipt.types';

const TESSERACT_COMPATIBLE_MIME_TYPES = new Set([
  'image/bmp',
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/pbm',
  'image/png',
  'image/webp',
  'image/x-portable-bitmap',
]);

@Processor(MAJOR_EVENT_RECEIPTS_QUEUE, {
  concurrency: 2,
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
      const originalBuffer = await this.streamToBuffer(storedFile.stream);
      const ocrBuffer = await this.prepareForOcr(originalBuffer, receipt.mimeType);
      const ocrResult = await recognize(ocrBuffer, 'por');
      const ocrText = ocrResult.data.text;
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
      this.logger.error(`Failed to process receipt ${receiptId}`, error);
      await this.prisma.majorEventReceipt.update({
        where: {
          id: receiptId,
        },
        data: {
          processingStatus: ReceiptProcessingStatus.FAILED,
          processingError: error instanceof Error ? error.message : 'Unknown receipt processing error.',
          processedAt: new Date(),
        },
      });
      throw error;
    }
  }

  private async prepareForOcr(buffer: Buffer, mimeType: string): Promise<Buffer> {
    const metadata = await sharp(buffer, { animated: false }).metadata();
    if (this.isTesseractCompatible(mimeType, metadata.pages ?? 1)) {
      return buffer;
    }

    return sharp(buffer, { animated: false }).png().toBuffer();
  }

  private isTesseractCompatible(mimeType: string, pages: number): boolean {
    if (mimeType.toLowerCase() === 'image/gif' && pages > 1) {
      return false;
    }

    return TESSERACT_COMPATIBLE_MIME_TYPES.has(mimeType.toLowerCase());
  }

  private async convertReceiptToAvif(
    receiptId: string,
    previousObjectKey: string,
    originalBuffer: Buffer,
    expiresAt: Date,
  ): Promise<void> {
    const avifBuffer = await sharp(originalBuffer, { animated: false })
      .rotate()
      .avif({
        quality: 62,
        effort: 4,
      })
      .toBuffer();
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

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }
}
