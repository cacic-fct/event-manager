import {
  DEFAULT_RECEIPT_VALIDATION_FILTERS,
  filterAndSortReceiptValidationItems,
} from './receipt-validation-filtering';
import { adminFixtureDateFromNow, createAdminReceiptValidationQueueItem } from '../../testing/admin-entity-fixtures';

describe('receipt validation queue filters', () => {
  const items = [
    item('subscription-old', 'SUBSCRIPTION', 'Estudante', -5, -1),
    item('purchase-new', 'TICKET', 'Estudante', -3, -3),
    item('subscription-new', 'SUBSCRIPTION', 'Visitante', -4, -4),
  ];

  it('keeps both categories and sorts oldest last edit first by default', () => {
    expect(filterAndSortReceiptValidationItems(items, DEFAULT_RECEIPT_VALIDATION_FILTERS).map((row) => row.subscriptionId)).toEqual([
      'subscription-new',
      'purchase-new',
      'subscription-old',
    ]);
  });

  it('filters subscriptions by tier and sorts creation newest first', () => {
    expect(
      filterAndSortReceiptValidationItems(items, {
        category: 'SUBSCRIPTION',
        paymentTier: 'Estudante',
        sort: 'CREATED_DESC',
      }).map((row) => row.subscriptionId),
    ).toEqual(['subscription-old']);
  });

  it('sorts combined receipt rows by edit or creation time in either direction', () => {
    expect(
      filterAndSortReceiptValidationItems(items, {
        category: 'ALL',
        paymentTier: null,
        sort: 'UPDATED_DESC',
      }).map((row) => row.subscriptionId),
    ).toEqual(['subscription-old', 'purchase-new', 'subscription-new']);
    expect(
      filterAndSortReceiptValidationItems(items, {
        category: 'ALL',
        paymentTier: null,
        sort: 'CREATED_ASC',
      }).map((row) => row.subscriptionId),
    ).toEqual(['subscription-old', 'subscription-new', 'purchase-new']);
    expect(
      filterAndSortReceiptValidationItems(items, {
        category: 'ALL',
        paymentTier: null,
        sort: 'CREATED_DESC',
      }).map((row) => row.subscriptionId),
    ).toEqual(['purchase-new', 'subscription-new', 'subscription-old']);
  });

  it('filters ticket rows by purchase creation time', () => {
    expect(
      filterAndSortReceiptValidationItems(items, {
        category: 'TICKET',
        paymentTier: null,
        sort: 'CREATED_ASC',
      }).map((row) => row.subscriptionId),
    ).toEqual(['purchase-new']);
  });
});

function item(
  id: string,
  category: 'SUBSCRIPTION' | 'TICKET',
  paymentTier: string,
  createdDaysFromNow: number,
  updatedDaysFromNow: number,
) {
  return createAdminReceiptValidationQueueItem({
    category,
    subscriptionId: id,
    purchaseId: category === 'TICKET' ? id : null,
    paymentTier,
    subscriptionCreatedAt: adminFixtureDateFromNow(createdDaysFromNow),
    subscriptionUpdatedAt: adminFixtureDateFromNow(updatedDaysFromNow),
  });
}
