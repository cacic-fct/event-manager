export type ReceiptRejectionCode = 'INVALID_RECEIPT' | 'NO_SLOTS' | 'SCHEDULE_CONFLICT' | 'GENERIC';

export interface ReceiptValidationEvent {
  id: string;
  name: string;
  emoji: string;
  type: string;
  startDate: string;
  endDate: string;
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

export interface ReceiptValidationQueueItem {
  category?: 'SUBSCRIPTION' | 'TICKET';
  subscriptionId: string;
  purchaseId?: string | null;
  ticketName?: string | null;
  majorEventId: string;
  majorEventName: string;
  majorEventCreatedAt: string;
  majorEventEndDate: string;
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
  subscriptionUpdatedAt: string;
  subscriptionCreatedAt?: string | null;
  receiptRejectionReason?: string | null;
  receipt?: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    expiresAt: string;
    imageUrl: string;
    processingStatus: string;
    ocrText?: string | null;
    amountMatched?: boolean | null;
    matchedAmountText?: string | null;
    nameMatched?: boolean | null;
    matchedNameText?: string | null;
  } | null;
  events: ReceiptValidationEvent[];
}

export interface ReceiptValidationQueue {
  pendingCount: number;
  subscriptionCount?: number;
  ticketCount?: number;
  availablePaymentTiers?: readonly { id: string; name: string }[];
  items: ReceiptValidationQueueItem[];
}

export interface ReceiptValidationResult {
  actionId: string;
  item: ReceiptValidationQueueItem;
}
