import { ConfigService } from '@nestjs/config';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
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
    expect(call).toHaveBeenCalledWith('GetPrivacySettings', { userId: 'user-1' }, expect.anything(), {
      idempotent: true,
      maxAttempts: 3,
      timeoutMs: 10_000,
    });
    expect((call.mock.calls[0][2] as import('@grpc/grpc-js').Metadata).get('authorization')).toEqual([
      'Bearer access-token',
    ]);
  });

  it('uses authenticated idempotent gRPC calls for cookie consent and TOTP seed relay', async () => {
    call.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({
      userId: 'user-1',
      primaryEmail: 'user@example.com',
      seed: 'seed',
      algorithm: 'SHA512',
      digits: 6,
      periodSeconds: 30,
      serverTime: '2026-07-25T10:00:00.000Z',
    });

    await expect(client.recordCookieConsent('user-1')).resolves.toBeUndefined();
    await expect(client.relayTotpSeed('user-1')).resolves.toMatchObject({ userId: 'user-1', seed: 'seed' });

    expect(call).toHaveBeenNthCalledWith(1, 'RecordCookieConsent', { userId: 'user-1' }, expect.anything(), {
      idempotent: true,
      maxAttempts: 3,
      timeoutMs: 10_000,
    });
    expect((call.mock.calls[1][2] as import('@grpc/grpc-js').Metadata).get('authorization')).toEqual([
      'Bearer access-token',
    ]);
    expect(call).toHaveBeenNthCalledWith(2, 'EnsureTotpSeed', { userId: 'user-1' }, expect.anything(), {
      idempotent: true,
      maxAttempts: 3,
      timeoutMs: 10_000,
    });
  });

  it('rejects malformed privacy responses and maps gRPC failures to service unavailable', async () => {
    call.mockResolvedValueOnce({ settings: {} });
    await expect(client.getPrivacySettings('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);

    call.mockResolvedValueOnce({
      settings: [
        {
          settingType: 'unknown_setting',
          enabled: true,
          lastUpdated: '2026-07-25T10:00:00.000Z',
        },
      ],
    });
    await expect(client.getPrivacySettings('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);

    const grpcError = Object.assign(new Error('connection refused'), { code: 14 });
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    call.mockRejectedValueOnce(grpcError);
    await expect(client.recordCookieConsent('user-1')).rejects.toEqual(
      expect.objectContaining({
        cause: grpcError,
        message: 'Account Manager M2M service is unavailable.',
        status: 503,
      }),
    );
    expect(warn).toHaveBeenCalledWith('Account Manager gRPC call RecordCookieConsent failed.', grpcError);
    warn.mockRestore();
  });
});
