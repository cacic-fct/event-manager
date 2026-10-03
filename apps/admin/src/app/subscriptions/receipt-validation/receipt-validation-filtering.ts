import type { ReceiptValidationQueueItem } from '../../graphql/receipt-validation-api.service';

export type ReceiptValidationCategory = 'SUBSCRIPTION' | 'TICKET';
export type ReceiptValidationCategoryFilter = ReceiptValidationCategory | 'ALL';
export type ReceiptValidationSort = 'UPDATED_ASC' | 'UPDATED_DESC' | 'CREATED_ASC' | 'CREATED_DESC';

export interface ReceiptValidationFilters {
  category: ReceiptValidationCategoryFilter;
  paymentTier: string | null;
  sort: ReceiptValidationSort;
}

export const DEFAULT_RECEIPT_VALIDATION_FILTERS: ReceiptValidationFilters = {
  category: 'ALL',
  paymentTier: null,
  sort: 'UPDATED_ASC',
};

export function receiptValidationCategory(item: ReceiptValidationQueueItem): ReceiptValidationCategory {
  return item.category === 'TICKET' ? 'TICKET' : 'SUBSCRIPTION';
}

export function filterAndSortReceiptValidationItems(
  items: readonly ReceiptValidationQueueItem[],
  filters: ReceiptValidationFilters,
): ReceiptValidationQueueItem[] {
  const selected = items.filter((item) => {
    const category = receiptValidationCategory(item);
    if (filters.category !== 'ALL' && filters.category !== category) return false;
    if (filters.paymentTier && (category !== 'SUBSCRIPTION' || item.paymentTier !== filters.paymentTier)) return false;
    return true;
  });

  const direction = filters.sort.endsWith('ASC') ? 1 : -1;
  const useCreatedAt = filters.sort.startsWith('CREATED');
  return [...selected].sort((left, right) => {
    const difference = (useCreatedAt ? createdAt(left) : updatedAt(left)) - (useCreatedAt ? createdAt(right) : updatedAt(right));
    return difference === 0 ? left.subscriptionId.localeCompare(right.subscriptionId) : difference * direction;
  });
}

function createdAt(item: ReceiptValidationQueueItem): number {
  return validTimestamp(item.subscriptionCreatedAt ?? item.subscriptionUpdatedAt);
}

function updatedAt(item: ReceiptValidationQueueItem): number {
  return validTimestamp(item.subscriptionUpdatedAt);
}

function validTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
