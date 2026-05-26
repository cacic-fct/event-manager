import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  AdminReceiptQueueItem,
  AdminReceiptQueueResponse,
  AdminReceiptValidationResult,
  CurrentUserReceiptResponse,
  ReceiptRejectionCode,
  UploadedReceiptFile,
} from './receipt.types';
import { ReceiptAdminQueueService } from './services/receipt-admin-queue.service';
import { ReceiptUploadService } from './services/receipt-upload.service';
import { ReceiptValidationService } from './services/receipt-validation.service';

@Injectable()
export class MajorEventReceiptsService {
  constructor(
    private readonly uploads: ReceiptUploadService,
    private readonly adminQueue: ReceiptAdminQueueService,
    private readonly validation: ReceiptValidationService,
  ) {}

  getCurrentReceipt(majorEventId: string, authenticatedUser: AuthenticatedUser): Promise<CurrentUserReceiptResponse | null> {
    return this.uploads.getCurrentReceipt(majorEventId, authenticatedUser);
  }

  getPendingValidationCount(): Promise<{ pendingCount: number }> {
    return this.adminQueue.getPendingValidationCount();
  }

  listPendingValidationQueue(majorEventId?: string): Promise<AdminReceiptQueueResponse> {
    return this.adminQueue.listPendingValidationQueue(majorEventId);
  }

  approveReceipt(
    subscriptionId: string,
    receiptId: string,
    selectedEventIds: string[] | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<AdminReceiptValidationResult> {
    return this.validation.approveReceipt(subscriptionId, receiptId, selectedEventIds, authenticatedUser);
  }

  rejectReceipt(
    subscriptionId: string,
    receiptId: string | undefined,
    rejectionCode: ReceiptRejectionCode,
    reason: string | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<AdminReceiptValidationResult> {
    return this.validation.rejectReceipt(subscriptionId, receiptId, rejectionCode, reason, authenticatedUser);
  }

  undoValidationAction(actionId: string, authenticatedUser: AuthenticatedUser): Promise<AdminReceiptQueueItem> {
    return this.validation.undoValidationAction(actionId, authenticatedUser);
  }

  uploadReceipt(
    majorEventId: string,
    file: UploadedReceiptFile | undefined,
    authenticatedUser: AuthenticatedUser,
  ): Promise<CurrentUserReceiptResponse> {
    return this.uploads.uploadReceipt(majorEventId, file, authenticatedUser);
  }

  getReceiptImage(
    receiptId: string,
    authenticatedUser: AuthenticatedUser,
  ): Promise<{
    stream: Readable;
    contentType: string;
    contentLength?: number;
  }> {
    return this.uploads.getReceiptImage(receiptId, authenticatedUser);
  }
}
