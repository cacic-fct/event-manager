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

  it('anonymizes unresolved offline manual submissions matched by phone or identity document', async () => {
    const { tx, service } = context;

    tx.offlineEventAttendanceSubmission.findMany.mockResolvedValueOnce([
      {
        id: 'offline-submission-phone',
        personId: null,
        scannerCode: null,
        manualValue: '(18) 99999-0000',
        authorUserId: null,
        authorName: null,
        authorEmail: null,
        submittedById: 'collector-user',
        committedById: null,
        rejectedById: null,
      },
      {
        id: 'offline-submission-document',
        personId: null,
        scannerCode: null,
        manualValue: '52998224725',
        authorUserId: null,
        authorName: null,
        authorEmail: null,
        submittedById: 'collector-user',
        committedById: null,
        rejectedById: null,
      },
    ]);

    await expect(
      service.scheduleDeletion({
        userId: 'old-user',
        email: 'old@example.com',
        requestId: 'schedule-1',
      }),
    ).resolves.toEqual({
      success: true,
      peopleUpdated: 2,
      recordsUpdated: 4,
    });

    expect(tx.offlineEventAttendanceSubmission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: expect.arrayContaining([
            {
              manualValue: {
                in: expect.arrayContaining([
                  '+55 18 99999-0000',
                  '18999990000',
                  '(18) 99999-0000',
                  '529.982.247-25',
                  '52998224725',
                ]),
                mode: 'insensitive',
              },
            },
          ]),
        },
      }),
    );
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-submission-phone' },
      data: { manualValue: '[ANONIMIZADO]' },
    });
    expect(tx.offlineEventAttendanceSubmission.update).toHaveBeenCalledWith({
      where: { id: 'offline-submission-document' },
      data: { manualValue: '[ANONIMIZADO]' },
    });
  });
});
