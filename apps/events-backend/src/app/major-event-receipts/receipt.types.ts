import { Buffer } from 'buffer';

export const MAJOR_EVENT_RECEIPTS_QUEUE = 'major-event-receipts';
export const MAX_RECEIPT_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const RECEIPT_ADMIN_PERMISSION = 'validate-receipt:read';
export const RECEIPT_ADMIN_EDIT_PERMISSION = 'validate-receipt:edit';

export interface UploadedReceiptFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface CurrentUserReceiptResponse {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  expiresAt: Date;
  imageUrl: string;
  processingStatus: string;
  amountMatched?: boolean | null;
  nameMatched?: boolean | null;
}

export interface ReceiptProcessingJob {
  receiptId: string;
}

export type ReceiptRejectionCode = 'INVALID_RECEIPT' | 'NO_SLOTS' | 'SCHEDULE_CONFLICT' | 'GENERIC';

export interface AdminReceiptEventSummary {
  id: string;
  name: string;
  emoji: string;
  type: string;
  startDate: Date;
  endDate: Date;
  locationDescription?: string | null;
  slots?: number | null;
  slotsAvailable?: number | null;
  eventGroupId?: string | null;
  eventGroupName?: string | null;
  preferenceOrder?: number | null;
  autoSubscribe: boolean;
  selectedForConfirmation: boolean;
  hasScheduleConflict: boolean;
  hasNoSlots: boolean;
}

export interface AdminReceiptQueueItem {
  subscriptionId: string;
  majorEventId: string;
  majorEventName: string;
  personId: string;
  personName: string;
  personEmail?: string | null;
  personPhone?: string | null;
  amountPaid?: number | null;
  paymentTier?: string | null;
  subscriptionFlow: string;
  desiredCourses?: number | null;
  desiredLectures?: number | null;
  desiredUncategorized?: number | null;
  subscriptionStatus: string;
  subscriptionUpdatedAt: Date;
  receiptRejectionReason?: string | null;
  receipt?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date;
    expiresAt: Date;
    imageUrl: string;
    processingStatus: string;
    ocrText?: string | null;
    amountMatched?: boolean | null;
    matchedAmountText?: string | null;
    nameMatched?: boolean | null;
    matchedNameText?: string | null;
  } | null;
  events: AdminReceiptEventSummary[];
}

export interface AdminReceiptQueueResponse {
  pendingCount: number;
  items: AdminReceiptQueueItem[];
}

export interface AdminReceiptValidationResult {
  actionId: string;
  item: AdminReceiptQueueItem;
}
