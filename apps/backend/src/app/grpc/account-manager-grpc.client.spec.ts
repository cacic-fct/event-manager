import { ConfigService } from '@nestjs/config';
import type { KeycloakM2mTokenService } from '../auth/keycloak-m2m-token.service';
import { AccountManagerGrpcClient } from './account-manager-grpc.client';
import { GrpcUnaryClient } from './grpc-runtime';

describe('AccountManagerGrpcClient', () => {
  let call: jest.SpiedFunction<GrpcUnaryClient['call']>;
  let client: AccountManagerGrpcClient;

  beforeEach(() => {
    call = jest.spyOn(GrpcUnaryClient.prototype, 'call');
    const config = new ConfigService({
      ACCOUNT_MANAGER_GRPC_URL: 'account-manager:50051',
      ACCOUNT_MANAGER_M2M_AUDIENCE: 'account-audience',
      KEYCLOAK_M2M_CLIENT_ID: 'event-manager',
      KEYCLOAK_M2M_CLIENT_SECRET: 'secret',
    });
    const tokens = {
      getClientCredentialsToken: jest.fn().mockResolvedValue('access-token'),
    };
    client = new AccountManagerGrpcClient(config, tokens as unknown as KeycloakM2mTokenService);
  });

  afterEach(() => {
    client.onModuleDestroy();
    call.mockRestore();
  });

  it('uses authenticated idempotent gRPC calls for privacy settings', async () => {
    call.mockResolvedValue({
      settings: [
        {
          settingType: 'analytics_tracking',
          enabled: true,
          lastUpdated: '2026-07-25T10:00:00.000Z',
        },
      ],
    });

    await expect(client.getPrivacySettings('user-1')).resolves.toHaveLength(1);
    expect(call).toHaveBeenCalledWith(
      'GetPrivacySettings',
      { userId: 'user-1' },
      expect.anything(),
      { idempotent: true, maxAttempts: 3, timeoutMs: 10_000 },
    );
  });
});
