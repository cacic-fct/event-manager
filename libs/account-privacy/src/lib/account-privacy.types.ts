export type CacicPrivacySettingKey =
  | 'analytics_tracking'
  | 'error_debugging'
  | 'performance_monitoring'
  | 'cookie_banner_accepted';

export interface CacicPrivacyPreferences {
  analytics_tracking: boolean;
  error_debugging: boolean;
  performance_monitoring: boolean;
  cookie_banner_accepted: boolean;
}

export type CacicPrivacyMetadata = Record<string, unknown>;

export interface CacicAccountPrivacySetting {
  id: string;
  userId: string;
  settings: CacicPrivacyPreferences;
  metadata?: CacicPrivacyMetadata;
  createdAt: string | Date;
  updatedAt: string | Date;
}
