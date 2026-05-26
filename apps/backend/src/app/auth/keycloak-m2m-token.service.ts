import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DEFAULT_KEYCLOAK_REALM_URL } from './auth.constants';

type ClientCredentialsTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
};

type ClientCredentialsTokenOptions = {
  audience?: string;
  clientId?: string;
  clientSecret?: string;
  scope?: string;
};

@Injectable()
export class KeycloakM2mTokenService {
  private readonly logger = new Logger(KeycloakM2mTokenService.name);
  private readonly tokenRefreshSkewMs = 30_000;
  private readonly cachedTokens = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly configService: ConfigService) {}

  async getClientCredentialsToken(options: ClientCredentialsTokenOptions = {}): Promise<string> {
    const clientId = options.clientId ?? this.configService.get<string>('KEYCLOAK_M2M_CLIENT_ID');
    const clientSecret = options.clientSecret ?? this.configService.get<string>('KEYCLOAK_M2M_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Keycloak M2M client credentials are not configured.');
    }

    const cacheKey = JSON.stringify({
      clientId,
      audience: options.audience ?? '',
      scope: options.scope ?? '',
    });
    const cached = this.cachedTokens.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expiresAt - this.tokenRefreshSkewMs > now) {
      return cached.token;
    }

    const payload = new URLSearchParams();
    payload.set('grant_type', 'client_credentials');
    payload.set('client_id', clientId);
    payload.set('client_secret', clientSecret);

    if (options.scope) {
      payload.set('scope', options.scope);
    }

    if (options.audience) {
      payload.set('audience', options.audience);
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
        throw new ServiceUnavailableException('Keycloak M2M token response did not include an access token.');
      }

      const expiresInSeconds = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 300;
      this.cachedTokens.set(cacheKey, {
        token: data.access_token,
        expiresAt: now + expiresInSeconds * 1000,
      });

      return data.access_token;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        this.logger.warn(`Could not obtain Keycloak M2M access token. Status=${error.response?.status ?? 'none'}.`);
      } else {
        this.logger.warn('Could not obtain Keycloak M2M access token.');
      }

      throw new ServiceUnavailableException('Could not authenticate with Keycloak for M2M access.');
    }
  }

  private get realmUrl(): string {
    return (this.configService.get<string>('KEYCLOAK_REALM_URL') ?? DEFAULT_KEYCLOAK_REALM_URL).replace(/\/+$/, '');
  }
}
