import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

export async function findReceiptObjectKeys(prisma: PrismaService, personIds: readonly string[]): Promise<string[]> {
  if (personIds.length === 0) {
    return [];
  }

  const receipts = await prisma.majorEventReceipt.findMany({
    where: { personId: { in: [...personIds] } },
    select: { objectKey: true },
  });

  return receipts.map((receipt) => receipt.objectKey);
}

export async function deleteReceiptObjects(
  s3: S3Service,
  logger: { warn(message: string): void },
  objectKeys: readonly string[],
): Promise<void> {
  const uniqueObjectKeys = Array.from(new Set(objectKeys));
  const settledDeletions = await Promise.allSettled(uniqueObjectKeys.map((objectKey) => s3.deleteFile(objectKey)));

  const failedObjectKeys: string[] = [];
  settledDeletions.forEach((result, index) => {
    if (result.status === 'rejected') {
      const objectKey = uniqueObjectKeys[index];
      failedObjectKeys.push(objectKey);
      logger.warn(
        `Failed to delete LGPD receipt object ${objectKey}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      );
    }
  });

  if (failedObjectKeys.length > 0) {
    logger.warn(
      `LGPD receipt cleanup completed with ${failedObjectKeys.length} failed object deletion(s): ${failedObjectKeys.join(', ')}`,
    );
  }
}
