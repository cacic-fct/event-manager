import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { M2M_TOTP_ROUTES } from '@cacic-fct/account-manager-m2m-contracts';
import axios from 'axios';
import type { KeycloakM2mTokenService } from '../auth/keycloak-m2m-token.service';
import { AccountManagerTotpService } from './account-manager-totp.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    isAxiosError: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AccountManagerTotpService', () => {
  let m2mTokens: Pick<jest.Mocked<KeycloakM2mTokenService>, 'getClientCredentialsToken'>;
  let service: AccountManagerTotpService;

  beforeEach(() => {
    jest.clearAllMocks();
    m2mTokens = {
      getClientCredentialsToken: jest.fn().mockResolvedValue('m2m-token'),
    };
    service = new AccountManagerTotpService(
      createConfigService({
        ACCOUNT_MANAGER_API_URL: 'https://account.example.com/api',
        ACCOUNT_MANAGER_M2M_AUDIENCE: 'account-manager',
        KEYCLOAK_M2M_CLIENT_ID: 'events-m2m',
        KEYCLOAK_M2M_CLIENT_SECRET: 'secret',
      }),
      m2mTokens as unknown as KeycloakM2mTokenService,
    );
  });

  it('relays the seed from Account Manager with M2M credentials', async () => {
    const seed = {
      userId: 'user/with space',
      primaryEmail: 'user@example.com',
      seed: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      algorithm: 'SHA512' as const,
      digits: 6 as const,
      periodSeconds: 30 as const,
      serverTime: '2026-06-26T16:00:00.000Z',
    };
    mockedAxios.post.mockResolvedValue({ data: seed });

    await expect(service.relaySeed('user/with space')).resolves.toEqual(seed);

    expect(m2mTokens.getClientCredentialsToken).toHaveBeenCalledWith({
      audience: 'account-manager',
      clientId: 'events-m2m',
      clientSecret: 'secret',
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      new URL(M2M_TOTP_ROUTES.ensureSeed('user/with space'), 'https://account.example.com').toString(),
      {},
      {
        headers: {
          authorization: 'Bearer m2m-token',
        },
      },
    );
  });

  it('returns a service unavailable error when the relay fails', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 503,
      },
    });

    await expect(service.relaySeed('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

function createConfigService(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}
