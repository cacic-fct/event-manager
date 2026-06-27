import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { KeycloakM2mTokenService } from './keycloak-m2m-token.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    isAxiosError: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KeycloakM2mTokenService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-26T12:00:00.000Z'));
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  it('uses the imported local realm M2M client defaults outside production', async () => {
    process.env.NODE_ENV = 'test';
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        access_token: 'm2m-token',
        expires_in: 120,
      },
    });
    const service = new KeycloakM2mTokenService(createConfigService({}));

    await expect(service.getClientCredentialsToken()).resolves.toBe('m2m-token');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'http://localhost:8080/realms/cacic-sso/protocol/openid-connect/token',
      expect.any(String),
      expect.objectContaining({
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      }),
    );

    const requestBody = new URLSearchParams(mockedAxios.post.mock.calls[0][1] as string);
    expect(requestBody.get('grant_type')).toBe('client_credentials');
    expect(requestBody.get('client_id')).toBe('cacic-event-manager-m2m');
    expect(requestBody.get('client_secret')).toBe('cacic-event-manager-m2m-dev-secret');
  });

  it('requires explicit M2M credentials in production', async () => {
    process.env.NODE_ENV = 'production';
    const service = new KeycloakM2mTokenService(createConfigService({}));

    await expect(service.getClientCredentialsToken()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('caches tokens per audience and scope until the refresh skew', async () => {
    process.env.NODE_ENV = 'test';
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        access_token: 'cached-token',
        expires_in: 120,
      },
    });
    const service = new KeycloakM2mTokenService(
      createConfigService({
        KEYCLOAK_REALM_URL: 'https://sso.example/realms/cacic-sso/',
        KEYCLOAK_M2M_CLIENT_ID: 'configured-client',
        KEYCLOAK_M2M_CLIENT_SECRET: 'configured-secret',
      }),
    );

    await expect(
      service.getClientCredentialsToken({
        audience: 'cacic-account-manager-audience',
        scope: 'privacy:write',
      }),
    ).resolves.toBe('cached-token');
    await expect(
      service.getClientCredentialsToken({
        audience: 'cacic-account-manager-audience',
        scope: 'privacy:write',
      }),
    ).resolves.toBe('cached-token');

    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    const requestBody = new URLSearchParams(mockedAxios.post.mock.calls[0][1] as string);
    expect(requestBody.get('client_id')).toBe('configured-client');
    expect(requestBody.get('client_secret')).toBe('configured-secret');
    expect(requestBody.get('audience')).toBe('cacic-account-manager-audience');
    expect(requestBody.get('scope')).toBe('privacy:write');
  });
});

function createConfigService(values: Record<string, string>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}
