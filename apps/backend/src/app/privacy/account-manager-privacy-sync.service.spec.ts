import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { M2M_PRIVACY_ROUTES } from '@cacic-fct/account-manager-m2m-contracts';
import axios from 'axios';
import type { KeycloakM2mTokenService } from '../auth/keycloak-m2m-token.service';
import {
  AccountManagerPrivacySyncService,
  createEventManagerDefaultPrivacySettings,
} from './account-manager-privacy-sync.service';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    isAxiosError: jest.fn(),
    post: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AccountManagerPrivacySyncService', () => {
  let m2mTokens: Pick<jest.Mocked<KeycloakM2mTokenService>, 'getClientCredentialsToken'>;

  beforeEach(() => {
    jest.clearAllMocks();
    m2mTokens = {
      getClientCredentialsToken: jest.fn().mockResolvedValue('m2m-token'),
    };
  });

  it('defaults analytics tracking on until Account Manager returns an explicit opt-out', () => {
    expect(createEventManagerDefaultPrivacySettings()).toEqual({
      analytics_tracking: true,
      cookie_banner_accepted: false,
      error_debugging: false,
      performance_monitoring: false,
    });
  });

  it('records cookie consent with configured M2M credentials', async () => {
    const service = createService({
      ACCOUNT_MANAGER_API_URL: 'https://account.example.com/api/',
      ACCOUNT_MANAGER_M2M_AUDIENCE: 'account-manager',
      KEYCLOAK_M2M_CLIENT_ID: 'events-m2m',
      KEYCLOAK_M2M_CLIENT_SECRET: 'secret',
    });
    mockedAxios.post.mockResolvedValue({ data: { ok: true } });

    await expect(service.recordCookieConsent('user/with space')).resolves.toBeUndefined();

    expect(m2mTokens.getClientCredentialsToken).toHaveBeenCalledWith({
      audience: 'account-manager',
      clientId: 'events-m2m',
      clientSecret: 'secret',
    });
    expect(mockedAxios.post).toHaveBeenCalledWith(
      new URL(M2M_PRIVACY_ROUTES.cookieConsent('user/with space'), 'https://account.example.com').toString(),
      {},
      {
        headers: {
          authorization: 'Bearer m2m-token',
        },
      },
    );
  });

  it('maps Account Manager privacy settings into Event Manager defaults and latest timestamp', async () => {
    const service = createService({
      ACCOUNT_MANAGER_API_URL: 'https://account.example.com/api',
      ACCOUNT_MANAGER_M2M_AUDIENCE: 'account-manager',
    });
    mockedAxios.get.mockResolvedValue({
      data: [
        {
          settingType: 'analytics_tracking',
          enabled: false,
          lastUpdated: '2026-07-07T12:00:00.000Z',
        },
        {
          settingType: 'cookie_banner_accepted',
          enabled: true,
          lastUpdated: '2026-07-08T12:00:00.000Z',
        },
        {
          settingType: 'performance_monitoring',
          enabled: true,
          lastUpdated: 'not-a-date',
        },
      ],
    });

    await expect(service.getUserPrivacySettings('user-1')).resolves.toEqual({
      id: 'user-1',
      userId: 'user-1',
      settings: {
        analytics_tracking: false,
        cookie_banner_accepted: true,
        error_debugging: false,
        performance_monitoring: true,
      },
      metadata: {
        source: 'account-manager-m2m',
      },
      createdAt: new Date('2026-07-08T12:00:00.000Z'),
      updatedAt: new Date('2026-07-08T12:00:00.000Z'),
    });
    expect(mockedAxios.get).toHaveBeenCalledWith(
      new URL(M2M_PRIVACY_ROUTES.userSettings('user-1'), 'https://account.example.com').toString(),
      {
        headers: {
          authorization: 'Bearer m2m-token',
        },
      },
    );
  });

  it('returns default privacy settings when Account Manager has no user record', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T12:00:00.000Z'));
    const service = createService({});
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 404,
      },
    });

    await expect(service.getUserPrivacySettings('missing-user')).resolves.toEqual({
      id: 'missing-user',
      userId: 'missing-user',
      settings: createEventManagerDefaultPrivacySettings(),
      metadata: {
        source: 'account-manager-m2m',
      },
      createdAt: new Date('2026-07-07T12:00:00.000Z'),
      updatedAt: new Date('2026-07-07T12:00:00.000Z'),
    });

    jest.useRealTimers();
  });

  it('throws service unavailable when cookie consent sync fails', async () => {
    const service = createService({});
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post.mockRejectedValue({
      response: {
        status: 503,
      },
    });

    await expect(service.recordCookieConsent('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws service unavailable when cookie consent sync fails without an Axios response', async () => {
    const service = createService({});
    mockedAxios.isAxiosError.mockReturnValue(false);
    mockedAxios.post.mockRejectedValue(new Error('network unavailable'));

    await expect(service.recordCookieConsent('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws service unavailable when privacy settings cannot be read', async () => {
    const service = createService({});
    mockedAxios.isAxiosError.mockReturnValue(false);
    mockedAxios.get.mockRejectedValue(new Error('network unavailable'));

    await expect(service.getUserPrivacySettings('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('throws service unavailable when Account Manager rejects privacy settings reads', async () => {
    const service = createService({});
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue({
      response: {
        status: 503,
      },
    });

    await expect(service.getUserPrivacySettings('user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  function createService(values: Record<string, string>): AccountManagerPrivacySyncService {
    return new AccountManagerPrivacySyncService(
      {
        get: jest.fn((key: string) => values[key]),
      } as unknown as ConfigService,
      m2mTokens as unknown as KeycloakM2mTokenService,
    );
  }
});
