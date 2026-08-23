import { PermissionManagementService } from './permission-management.service';

describe('PermissionManagementService transaction safety', () => {
  it('serializes graph writes behind one transaction advisory lock', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn((operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new PermissionManagementService(
      prisma as never,
      {} as never,
      {} as never,
    );

    await (service as unknown as {
      runPermissionGraphTransaction: <T>(operation: (client: typeof tx) => Promise<T>) => Promise<T>;
    }).runPermissionGraphTransaction(async (client) => {
      await client.$executeRaw();
      return 'committed';
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
