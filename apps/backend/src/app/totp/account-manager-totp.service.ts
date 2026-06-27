import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { M2M_TOTP_ROUTES, type M2MTotpSeedRelayResponse } from '@cacic-fct/account-manager-m2m-contracts';
import axios from 'axios';
import { KeycloakM2mTokenService } from '../auth/keycloak-m2m-token.service';

@Injectable()
export class AccountManagerTotpService {
  private readonly logger = new Logger(AccountManagerTotpService.name);
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

  async relaySeed(userId: string): Promise<M2MTotpSeedRelayResponse> {
    const accessToken = await this.getAccessToken();

    try {
      const { data } = await axios.post<M2MTotpSeedRelayResponse>(
        this.accountManagerUrl(M2M_TOTP_ROUTES.ensureSeed(userId)),
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      return data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.warn(`Account Manager TOTP seed relay failed with status ${error.response?.status ?? 'none'}.`);
      } else {
        this.logger.warn('Account Manager TOTP seed relay failed.');
      }

      throw new ServiceUnavailableException('Could not relay TOTP seed from Account Manager.');
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
