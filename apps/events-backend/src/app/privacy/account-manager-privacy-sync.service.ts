import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DEFAULT_KEYCLOAK_REALM_URL } from '../auth/auth.constants';

type ClientCredentialsTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

@Injectable()
export class AccountManagerPrivacySyncService {
  private readonly logger = new Logger(AccountManagerPrivacySyncService.name);
  private readonly accountManagerApiUrl = (
    process.env.ACCOUNT_MANAGER_API_URL ?? 'https://account.cacic.dev.br/api'
  ).replace(/\/+$/, '');
  private readonly realmUrl = (process.env.ACCOUNT_MANAGER_KEYCLOAK_REALM_URL ?? DEFAULT_KEYCLOAK_REALM_URL).replace(
    /\/+$/,
    '',
  );

  private readonly clientId = this.configService.get<string>('ACCOUNT_MANAGER_M2M_CLIENT_ID');
  private readonly clientSecret = this.configService.get<string>('ACCOUNT_MANAGER_M2M_CLIENT_SECRET');
  private readonly scope = this.configService.get<string>('ACCOUNT_MANAGER_M2M_SCOPE');

  private cachedAccessToken: { token: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  async recordCookieConsent(userId: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const encodedUserId = encodeURIComponent(userId);

    try {
      await axios.post(
        `${this.accountManagerApiUrl}/v1/privacy/user/${encodedUserId}/cookie-consent`,
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.warn(`Account Manager cookie consent sync failed with status ${error.response?.status ?? 'none'}.`);
      } else {
        this.logger.warn('Account Manager cookie consent sync failed.');
      }

      throw new ServiceUnavailableException('Could not sync cookie consent with Account Manager.');
    }
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt - 30_000 > now) {
      return this.cachedAccessToken.token;
    }

    if (!this.clientId || !this.clientSecret) {
      throw new ServiceUnavailableException('Account Manager M2M credentials are not configured.');
    }

    const payload = new URLSearchParams();
    payload.set('grant_type', 'client_credentials');
    payload.set('client_id', this.clientId);
    payload.set('client_secret', this.clientSecret);

    if (this.scope) {
      payload.set('scope', this.scope);
    }

    try {
      const { data } = await axios.post<ClientCredentialsTokenResponse>(
        `${this.realmUrl}/protocol/openid-connect/token`,
        payload.toString(),
        {
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
          },
        },
      );

      if (typeof data.access_token !== 'string' || !data.access_token) {
        throw new ServiceUnavailableException('Account Manager M2M token response did not include an access token.');
      }

      const expiresInSeconds = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 300;
      this.cachedAccessToken = {
        token: data.access_token,
        expiresAt: now + expiresInSeconds * 1000,
      };

      return data.access_token;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      this.logger.warn('Could not obtain Account Manager M2M access token.');
      throw new ServiceUnavailableException('Could not authenticate with Account Manager.');
    }
  }
}
