import type { AccountManagerGrpcClient } from '../grpc/account-manager-grpc.client';
import { AccountManagerTotpService } from './account-manager-totp.service';

describe('AccountManagerTotpService', () => {
  it('relays the seed through the Account Manager gRPC client', async () => {
    const seed = {
      userId: 'user-1',
      primaryEmail: 'user@example.com',
      seed: 'ABC',
      algorithm: 'SHA512' as const,
      digits: 6 as const,
      periodSeconds: 30 as const,
      serverTime: '2026-07-25T10:00:00.000Z',
    };
    const accountManager = {
      relayTotpSeed: jest.fn().mockResolvedValue(seed),
    };
    const service = new AccountManagerTotpService(accountManager as unknown as AccountManagerGrpcClient);

    await expect(service.relaySeed('user-1')).resolves.toEqual(seed);
    expect(accountManager.relayTotpSeed).toHaveBeenCalledWith('user-1');
  });
});
