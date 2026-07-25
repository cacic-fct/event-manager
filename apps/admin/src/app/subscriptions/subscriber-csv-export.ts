export {
  buildSubscriberCsv,
  formatIdentityDocumentForExport,
  getSubscriberFieldValue,
  isValidCpf,
  type IdentityDocumentExportMode,
  type SubscriberCsvExportOptions,
  type SubscriberCsvField,
  type SubscriberCsvRecord,
} from '@cacic-fct/shared-utils';

import { type SubscriberCsvExportOptions } from '@cacic-fct/shared-utils';

export type SubscriberBadgeCodeFormat = 'svg' | 'png';

export type SubscriberBadgeCodeFileName = 'id' | 'fullName' | 'identityDocument';

export interface SubscriberCsvBadgeOptions {
  enabled: boolean;
  errorCorrectionLevel: string;
  format: SubscriberBadgeCodeFormat;
  fileName: SubscriberBadgeCodeFileName;
}

export interface SubscriberCsvExportDialogOptions extends SubscriberCsvExportOptions {
  badgeCodes: SubscriberCsvBadgeOptions;
}

export const DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS: SubscriberCsvExportOptions = {
  fields: ['fullName', 'identityDocument'],
  identityDocumentMode: 'masked',
};

export const DEFAULT_SUBSCRIBER_CSV_BADGE_OPTIONS: SubscriberCsvBadgeOptions = {
  enabled: false,
  errorCorrectionLevel: '35',
  format: 'svg',
  fileName: 'id',
};
