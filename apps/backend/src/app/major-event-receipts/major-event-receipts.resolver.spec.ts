import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MajorEventReceiptsResolver } from './major-event-receipts.resolver';
import { ApproveReceiptInput, RejectReceiptInput } from './receipt.models';
import {
  RECEIPT_ADMIN_PERMISSION,
  RECEIPT_APPROVE_PERMISSION,
  RECEIPT_REJECT_PERMISSION,
  RECEIPT_UNDO_PERMISSION,
} from './receipt.types';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';

describe('MajorEventReceiptsResolver', () => {
  let receipts: {
    getCurrentReceipt: jest.Mock;
    getPendingValidationCount: jest.Mock;
    listPendingValidationQueue: jest.Mock;
    approveReceipt: jest.Mock;
    rejectReceipt: jest.Mock;
    undoValidationAction: jest.Mock;
  };
  let frozenResources: {
    assertMajorEventSubscriptionMutable: jest.Mock;
    assertReceiptValidationActionMutable: jest.Mock;
  };
  let resolver: MajorEventReceiptsResolver;

  beforeEach(() => {
    receipts = {
      getCurrentReceipt: jest.fn(),
      getPendingValidationCount: jest.fn(),
      listPendingValidationQueue: jest.fn(),
      approveReceipt: jest.fn(),
      rejectReceipt: jest.fn(),
      undoValidationAction: jest.fn(),
    };
    frozenResources = {
      assertMajorEventSubscriptionMutable: jest.fn().mockResolvedValue(undefined),
      assertReceiptValidationActionMutable: jest.fn().mockResolvedValue(undefined),
    };
    resolver = new MajorEventReceiptsResolver(receipts as never, frozenResources as never);
  });

  it('declares the exact permissions for every receipt query and mutation', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        MajorEventReceiptsResolver.prototype.adminReceiptPendingValidationCount,
      ),
    ).toEqual([RECEIPT_ADMIN_PERMISSION]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, MajorEventReceiptsResolver.prototype.adminReceiptValidationQueue),
    ).toEqual([RECEIPT_ADMIN_PERMISSION]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, MajorEventReceiptsResolver.prototype.approveAdminReceipt),
    ).toEqual([RECEIPT_APPROVE_PERMISSION]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, MajorEventReceiptsResolver.prototype.rejectAdminReceipt),
    ).toEqual([RECEIPT_REJECT_PERMISSION]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        MajorEventReceiptsResolver.prototype.undoAdminReceiptValidationAction,
      ),
    ).toEqual([RECEIPT_UNDO_PERMISSION]);
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, MajorEventReceiptsResolver.prototype.currentUserMajorEventReceipt),
    ).toBeUndefined();
  });

  it('returns the current user receipt projection and forwards the authenticated actor', async () => {
    const user = { sub: 'participant-1' };
    const result = { id: 'receipt-1', imageUrl: '/private/receipt-1' };
    receipts.getCurrentReceipt.mockResolvedValue(result);

    await expect(resolver.currentUserMajorEventReceipt('major-1', { req: { user } } as never)).resolves.toBe(result);

    expect(receipts.getCurrentReceipt).toHaveBeenCalledWith('major-1', user);
  });

  it('accepts the alternate GraphQL request context shape for current-user receipt access', async () => {
    const user = { sub: 'participant-1' };
    receipts.getCurrentReceipt.mockResolvedValue(null);

    await expect(resolver.currentUserMajorEventReceipt('major-1', { request: { user } } as never)).resolves.toBeNull();

    expect(receipts.getCurrentReceipt).toHaveBeenCalledWith('major-1', user);
  });

  it('rejects current-user receipt access without a context actor and does not call the service', async () => {
    await expect(
      Promise.resolve().then(() => resolver.currentUserMajorEventReceipt('major-1', {} as never)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(receipts.getCurrentReceipt).not.toHaveBeenCalled();
  });

  it('returns admin queue count and normalizes the optional major-event filter', async () => {
    const count = { pendingCount: 3 };
    const queue = { pendingCount: 1, items: [] };
    receipts.getPendingValidationCount.mockResolvedValue(count);
    receipts.listPendingValidationQueue.mockResolvedValue(queue);

    await expect(resolver.adminReceiptPendingValidationCount()).resolves.toBe(count);
    await expect(resolver.adminReceiptValidationQueue('  major-1  ')).resolves.toBe(queue);
    await expect(resolver.adminReceiptValidationQueue(undefined)).resolves.toBe(queue);

    expect(receipts.listPendingValidationQueue).toHaveBeenNthCalledWith(1, 'major-1');
    expect(receipts.listPendingValidationQueue).toHaveBeenNthCalledWith(2, undefined);
  });

  it('preserves queue-service errors instead of returning a misleading empty queue', async () => {
    const failure = new Error('Queue database unavailable.');
    receipts.listPendingValidationQueue.mockRejectedValue(failure);

    await expect(resolver.adminReceiptValidationQueue('major-1')).rejects.toBe(failure);
  });

  it('authorizes and attributes receipt approval to the authenticated actor', async () => {
    const user = { sub: 'validator-1' };
    const input: ApproveReceiptInput = {
      subscriptionId: 'subscription-1',
      receiptId: 'receipt-1',
      selectedEventIds: ['event-1', 'event-2'],
    };
    const result = { actionId: 'action-1', item: {} };
    receipts.approveReceipt.mockResolvedValue(result);

    await expect(resolver.approveAdminReceipt(input, { req: { user } } as never)).resolves.toBe(result);

    expect(frozenResources.assertMajorEventSubscriptionMutable).toHaveBeenCalledWith(
      input.subscriptionId,
      user,
      'edit',
    );
    expect(receipts.approveReceipt).toHaveBeenCalledWith(
      input.subscriptionId,
      input.receiptId,
      input.selectedEventIds,
      user,
    );
  });

  it('does not forward a malformed non-array approval selection as event ids', async () => {
    const user = { sub: 'validator-1' };
    receipts.approveReceipt.mockResolvedValue({ actionId: 'action-1', item: {} });
    const input = {
      subscriptionId: 'subscription-1',
      receiptId: 'receipt-1',
      selectedEventIds: 'event-1',
    } as never;

    await resolver.approveAdminReceipt(input, { req: { user } } as never);

    expect(receipts.approveReceipt).toHaveBeenCalledWith('subscription-1', 'receipt-1', undefined, user);
  });

  it('authorizes and attributes receipt rejection, including optional reason data', async () => {
    const user = { sub: 'validator-1' };
    const input: RejectReceiptInput = {
      subscriptionId: 'subscription-1',
      receiptId: 'receipt-1',
      rejectionCode: 'INVALID_RECEIPT',
      reason: 'The receipt is unreadable.',
    };
    const result = { actionId: 'action-2', item: {} };
    receipts.rejectReceipt.mockResolvedValue(result);

    await expect(resolver.rejectAdminReceipt(input, { request: { user } } as never)).resolves.toBe(result);

    expect(frozenResources.assertMajorEventSubscriptionMutable).toHaveBeenCalledWith(
      input.subscriptionId,
      user,
      'edit',
    );
    expect(receipts.rejectReceipt).toHaveBeenCalledWith(
      input.subscriptionId,
      input.receiptId,
      input.rejectionCode,
      input.reason,
      user,
    );
  });

  it('authorizes and attributes undo actions to the authenticated actor', async () => {
    const user = { sub: 'validator-1' };
    const result = { subscriptionId: 'subscription-1', receipt: null };
    receipts.undoValidationAction.mockResolvedValue(result);

    await expect(resolver.undoAdminReceiptValidationAction('action-1', { req: { user } } as never)).resolves.toBe(
      result,
    );

    expect(frozenResources.assertReceiptValidationActionMutable).toHaveBeenCalledWith('action-1', user, 'edit');
    expect(receipts.undoValidationAction).toHaveBeenCalledWith('action-1', user);
  });

  it('stops receipt mutations when frozen-resource authorization fails', async () => {
    const failure = new ForbiddenException('Receipt validation is frozen.');
    frozenResources.assertMajorEventSubscriptionMutable.mockRejectedValue(failure);

    await expect(
      resolver.approveAdminReceipt({ subscriptionId: 'subscription-1', receiptId: 'receipt-1' }, {
        req: { user: { sub: 'validator-1' } },
      } as never),
    ).rejects.toBe(failure);

    expect(receipts.approveReceipt).not.toHaveBeenCalled();
  });

  it('propagates validation-service failures without exposing a fallback result', async () => {
    const failure = new BadRequestException('Receipt cannot be approved.');
    receipts.approveReceipt.mockRejectedValue(failure);

    await expect(
      resolver.approveAdminReceipt({ subscriptionId: 'subscription-1', receiptId: 'receipt-1' }, {
        req: { user: { sub: 'validator-1' } },
      } as never),
    ).rejects.toBe(failure);
  });
});
