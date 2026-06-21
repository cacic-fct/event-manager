import { Buffer } from 'buffer';
import { Permission } from '@cacic-fct/shared-permissions';

export const MAJOR_EVENT_RECEIPTS_QUEUE = 'major-event-receipts';
export const MAX_RECEIPT_FILE_SIZE_BYTES = 15 * 1024 * 1024;
export const MAX_RECEIPT_DECODED_IMAGE_PIXELS = 12_000_000;
export const MAX_RECEIPT_IMAGE_DIMENSION_PIXELS = 6_000;
export const MAX_RECEIPT_OCR_IMAGE_DIMENSION_PIXELS = 2_400;
export const RECEIPT_IMAGE_METADATA_TIMEOUT_SECONDS = 5;
export const RECEIPT_IMAGE_CONVERSION_TIMEOUT_SECONDS = 15;
export const RECEIPT_OCR_TIMEOUT_MS = 45_000;
export const RECEIPT_PROCESSING_ATTEMPTS = 2;
export const RECEIPT_ADMIN_PERMISSION = Permission.Receipt.Read;
export const RECEIPT_APPROVE_PERMISSION = Permission.Receipt.Approve;
export const RECEIPT_REJECT_PERMISSION = Permission.Receipt.Reject;
export const RECEIPT_UNDO_PERMISSION = Permission.Receipt.Undo;

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
  majorEventCreatedAt: Date;
  majorEventEndDate: Date;
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
