import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';

describe('LgpdService offline attendance submissions', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('does not anonymize offline submissions while deletion remains cancellable', async () => {
    const { tx, service } = context;

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 2,
    });

    expect(tx.offlineEventAttendanceSubmission.findMany).not.toHaveBeenCalled();
    expect(tx.offlineEventAttendanceSubmission.update).not.toHaveBeenCalled();
  });
});
