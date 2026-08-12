import { Injectable } from '@nestjs/common';
import {
  createDefaultPrivacySettings,
  type M2MPrivacySettingResponse,
  type PrivacySettingRecord,
  type PrivacySettings,
} from '@cacic-fct/account-manager-m2m-contracts';
import { AccountManagerGrpcClient } from '../grpc/account-manager-grpc.client';

export function createEventManagerDefaultPrivacySettings(): PrivacySettings {
  return {
    ...createDefaultPrivacySettings(),
    analytics_tracking: true,
    error_debugging: true,
    performance_monitoring: true,
  };
}

@Injectable()
export class AccountManagerPrivacySyncService {
  constructor(private readonly accountManager: AccountManagerGrpcClient) {}

  async recordCookieConsent(userId: string): Promise<void> {
    await this.accountManager.recordCookieConsent(userId);
  }

  async getUserPrivacySettings(userId: string): Promise<PrivacySettingRecord> {
    return this.toPrivacySettingRecord(userId, await this.accountManager.getPrivacySettings(userId));
  }

  private toPrivacySettingRecord(userId: string, settings: M2MPrivacySettingResponse[]): PrivacySettingRecord {
    const preferences = createEventManagerDefaultPrivacySettings();
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
