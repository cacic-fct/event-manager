import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  M2M_PRIVACY_ROUTES,
  type M2MRecordCookieConsentResponse,
} from '@cacic-fct/account-manager-m2m-contracts';
import axios from 'axios';
import { KeycloakM2mTokenService } from '../auth/keycloak-m2m-token.service';

@Injectable()
export class AccountManagerPrivacySyncService {
  private readonly logger = new Logger(AccountManagerPrivacySyncService.name);
  private readonly accountManagerOrigin: string;
  private readonly audience?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly m2mTokens: KeycloakM2mTokenService,
  ) {
    this.accountManagerOrigin = this.resolveAccountManagerOrigin(
      this.configService.get<string>('ACCOUNT_MANAGER_API_URL') ?? 'https://account.cacic.dev.br/api',
    );
    this.audience = this.configService.get<string>('ACCOUNT_MANAGER_M2M_AUDIENCE');
    this.clientId = this.configService.get<string>('KEYCLOAK_M2M_CLIENT_ID');
    this.clientSecret = this.configService.get<string>('KEYCLOAK_M2M_CLIENT_SECRET');
  }

  async recordCookieConsent(userId: string): Promise<void> {
    const accessToken = await this.getAccessToken();

    try {
      await axios.post<M2MRecordCookieConsentResponse>(
        this.accountManagerUrl(M2M_PRIVACY_ROUTES.cookieConsent(userId)),
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

  private accountManagerUrl(path: string): string {
    return new URL(path, this.accountManagerOrigin).toString();
  }

  private resolveAccountManagerOrigin(accountManagerApiUrl: string): string {
    return new URL(accountManagerApiUrl.replace(/\/+$/, '')).origin;
  }

  private async getAccessToken(): Promise<string> {
    return this.m2mTokens.getClientCredentialsToken({
      audience: this.audience,
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });
  }
}
