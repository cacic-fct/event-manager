import { Metadata } from '@grpc/grpc-js';
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  M2MPrivacySettingResponse,
  M2MTotpSeedRelayResponse,
} from '@cacic-fct/account-manager-m2m-contracts';
import { KeycloakM2mTokenService } from '../auth/keycloak-m2m-token.service';
import {
  GrpcUnaryClient,
  grpcUnavailable,
  loadGrpcServiceDefinition,
  resolveGrpcProtoPath,
} from './grpc-runtime';

type PrivacySettingsGrpcResponse = {
  settings?: unknown;
};

@Injectable()
export class AccountManagerGrpcClient implements OnModuleDestroy {
  private readonly logger = new Logger(AccountManagerGrpcClient.name);
  private readonly audience?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly client: GrpcUnaryClient;

  constructor(
    config: ConfigService,
    private readonly m2mTokens: KeycloakM2mTokenService,
  ) {
    this.audience = config.get<string>('ACCOUNT_MANAGER_M2M_AUDIENCE');
    this.clientId = config.get<string>('KEYCLOAK_M2M_CLIENT_ID');
    this.clientSecret = config.get<string>('KEYCLOAK_M2M_CLIENT_SECRET');
    const target = config.get<string>('ACCOUNT_MANAGER_GRPC_URL')?.trim() || 'localhost:50051';
    this.client = new GrpcUnaryClient(
      target,
      loadGrpcServiceDefinition(
        resolveGrpcProtoPath('account-manager-m2m.proto'),
        ['cacic', 'm2m', 'account_manager', 'v1'],
        'AccountManagerM2M',
      ),
    );
  }

  async recordCookieConsent(userId: string): Promise<void> {
    await this.call('RecordCookieConsent', { userId }, true);
  }

  async getPrivacySettings(userId: string): Promise<M2MPrivacySettingResponse[]> {
    const response = await this.call<PrivacySettingsGrpcResponse>('GetPrivacySettings', { userId }, true);
    if (!Array.isArray(response.settings)) {
      throw new ServiceUnavailableException('Account Manager returned an invalid privacy settings response.');
    }

    return response.settings.map((setting) => this.parsePrivacySetting(setting));
  }

  relayTotpSeed(userId: string): Promise<M2MTotpSeedRelayResponse> {
    return this.call<M2MTotpSeedRelayResponse>('EnsureTotpSeed', { userId }, true);
  }

  onModuleDestroy(): void {
    this.client.close();
  }

  private async call<TResponse = Record<string, unknown>>(
    method: string,
    request: Record<string, unknown>,
    idempotent: boolean,
  ): Promise<TResponse> {
    const metadata = new Metadata();
    metadata.set(
      'authorization',
      `Bearer ${await this.m2mTokens.getClientCredentialsToken({
        audience: this.audience,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
      })}`,
    );

    try {
      return await this.client.call<TResponse>(method, request, metadata, {
        idempotent,
        maxAttempts: 3,
        timeoutMs: 10_000,
      });
    } catch (error) {
      this.logger.warn(`Account Manager gRPC call ${method} failed.`);
      throw grpcUnavailable('Account Manager M2M service is unavailable.', error);
    }
  }

  private parsePrivacySetting(value: unknown): M2MPrivacySettingResponse {
    if (!isRecord(value)) {
      throw new ServiceUnavailableException('Account Manager returned an invalid privacy setting.');
    }
    const settingType = value['settingType'];
    const enabled = value['enabled'];
    const lastUpdated = value['lastUpdated'];
    if (typeof settingType !== 'string' || typeof enabled !== 'boolean' || typeof lastUpdated !== 'string') {
      throw new ServiceUnavailableException('Account Manager returned an invalid privacy setting.');
    }
    return {
      settingType: settingType as M2MPrivacySettingResponse['settingType'],
      enabled,
      lastUpdated,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
