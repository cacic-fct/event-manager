import { MajorEventReceiptsService } from './major-event-receipts.service';

describe('MajorEventReceiptsService', () => {
  const uploads = {
    getCurrentReceipt: jest.fn(),
    uploadReceipt: jest.fn(),
    getReceiptImage: jest.fn(),
  };
  const adminQueue = {
    getPendingValidationCount: jest.fn(),
    listPendingValidationQueue: jest.fn(),
  };
  const validation = {
    approveReceipt: jest.fn(),
    rejectReceipt: jest.fn(),
    undoValidationAction: jest.fn(),
  };
  const user = { sub: 'user-id', token: 'token', permissionSet: new Set<string>() } as never;
  let service: MajorEventReceiptsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MajorEventReceiptsService(uploads as never, adminQueue as never, validation as never);
  });

  it('delegates current-user and admin queue operations', async () => {
    uploads.getCurrentReceipt.mockResolvedValue(null);
    adminQueue.getPendingValidationCount.mockResolvedValue({ pendingCount: 1 });
    adminQueue.listPendingValidationQueue.mockResolvedValue({ pendingCount: 1, items: [] });

    await expect(service.getCurrentReceipt('major', user)).resolves.toBeNull();
    await expect(service.getPendingValidationCount()).resolves.toEqual({ pendingCount: 1 });
    await expect(service.listPendingValidationQueue('major')).resolves.toEqual({ pendingCount: 1, items: [] });

    expect(uploads.getCurrentReceipt).toHaveBeenCalledWith('major', user);
    expect(adminQueue.listPendingValidationQueue).toHaveBeenCalledWith('major');
  });

  it('delegates validation, upload, and image operations', async () => {
    validation.approveReceipt.mockResolvedValue({ actionId: 'action', item: {} });
    validation.rejectReceipt.mockResolvedValue({ actionId: 'reject-action', item: {} });
    validation.undoValidationAction.mockResolvedValue({});
    uploads.uploadReceipt.mockResolvedValue({});
    uploads.getReceiptImage.mockResolvedValue({ stream: {}, contentType: 'image/png' });

    await service.approveReceipt('subscription', 'receipt', ['event'], user);
    await service.rejectReceipt('subscription', 'receipt', 'GENERIC', undefined, user);
    await service.undoValidationAction('action', user);
    await service.uploadReceipt('major', undefined, user);
    await service.getReceiptImage('receipt', user);

    expect(validation.approveReceipt).toHaveBeenCalledWith('subscription', 'receipt', ['event'], user);
    expect(validation.rejectReceipt).toHaveBeenCalledWith('subscription', 'receipt', 'GENERIC', undefined, user);
    expect(validation.undoValidationAction).toHaveBeenCalledWith('action', user);
    expect(uploads.uploadReceipt).toHaveBeenCalledWith('major', undefined, user);
    expect(uploads.getReceiptImage).toHaveBeenCalledWith('receipt', user);
  });
});
