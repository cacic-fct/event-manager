import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { KeycloakM2mTokenService } from '../auth/keycloak-m2m-token.service';

@Injectable()
export class AccountManagerPrivacySyncService {
  private readonly logger = new Logger(AccountManagerPrivacySyncService.name);
  private readonly accountManagerApiUrl: string;
  private readonly audience?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly scope?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly m2mTokens: KeycloakM2mTokenService,
  ) {
    this.accountManagerApiUrl = (
      this.configService.get<string>('ACCOUNT_MANAGER_API_URL') ?? 'https://account.cacic.dev.br/api'
    ).replace(/\/+$/, '');
    this.audience = this.configService.get<string>('ACCOUNT_MANAGER_M2M_AUDIENCE');
    this.clientId = this.configService.get<string>('KEYCLOAK_M2M_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('KEYCLOAK_M2M_CLIENT_SECRET');
    this.scope = this.configService.get<string>('ACCOUNT_MANAGER_M2M_SCOPE');
  }

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
    return this.m2mTokens.getClientCredentialsToken({
      audience: this.audience,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      scope: this.scope,
    });
  }
}
