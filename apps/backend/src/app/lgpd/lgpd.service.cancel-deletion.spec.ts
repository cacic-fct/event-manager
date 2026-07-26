import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';

describe('LgpdService cancellation', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('restores only records soft-deleted by the cancelled request', async () => {
    const { service, tx } = context;

    await expect(
      service.cancelDeletion({ userId: 'old-user', email: 'old@example.com', requestId: 'cancel-1' }),
    ).resolves.toEqual({ success: true, peopleUpdated: 2, recordsUpdated: 2 });

    expect(tx.people.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['source-person', 'target-person'] }, lgpdDeletionRequestId: 'cancel-1' },
      data: { deletedAt: null, lgpdDeletionRequestId: null },
    });
    expect(tx.eventSubscription.updateMany).toHaveBeenCalledWith({
      where: { personId: { in: ['source-person', 'target-person'] }, lgpdDeletionRequestId: 'cancel-1' },
      data: { deletedAt: null, lgpdDeletionRequestId: null },
    });
    expect(tx.majorEventSubscriptionEventSelection.updateMany).toHaveBeenCalledWith({
      where: {
        subscription: { personId: { in: ['source-person', 'target-person'] } },
        lgpdDeletionRequestId: 'cancel-1',
      },
      data: { deletedAt: null, lgpdDeletionRequestId: null },
    });
  });
});
