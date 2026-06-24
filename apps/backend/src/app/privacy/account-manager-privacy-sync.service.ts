import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createDefaultPrivacySettings,
  M2M_PRIVACY_ROUTES,
  type M2MPrivacySettingResponse,
  type M2MRecordCookieConsentResponse,
  type PrivacySettingRecord,
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

  async getUserPrivacySettings(userId: string): Promise<PrivacySettingRecord> {
    const accessToken = await this.getAccessToken();

    try {
      const { data } = await axios.get<M2MPrivacySettingResponse[]>(
        this.accountManagerUrl(M2M_PRIVACY_ROUTES.userSettings(userId)),
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      return this.toPrivacySettingRecord(userId, data);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return this.toPrivacySettingRecord(userId, []);
      }

      if (axios.isAxiosError(error)) {
        this.logger.warn(`Account Manager privacy settings read failed with status ${error.response?.status ?? 'none'}.`);
      } else {
        this.logger.warn('Account Manager privacy settings read failed.');
      }

      throw new ServiceUnavailableException('Could not read privacy settings from Account Manager.');
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

  private toPrivacySettingRecord(
    userId: string,
    settings: M2MPrivacySettingResponse[],
  ): PrivacySettingRecord {
    const preferences = createDefaultPrivacySettings();
    let updatedAt: Date | null = null;

    for (const setting of settings) {
      preferences[setting.settingType] = setting.enabled;
      const settingUpdatedAt = new Date(setting.lastUpdated);
      if (!Number.isNaN(settingUpdatedAt.getTime()) && (!updatedAt || settingUpdatedAt > updatedAt)) {
        updatedAt = settingUpdatedAt;
      }
    }

    const timestamp = updatedAt ?? new Date();

    return {
      id: userId,
      userId,
      settings: preferences,
      metadata: {
        source: 'account-manager-m2m',
      },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}
