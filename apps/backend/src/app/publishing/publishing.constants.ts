export const PUBLICATION_QUEUE = 'publication';
export const PUBLISH_SCHEDULED_CONTENT_JOB = 'publish-scheduled-public-content';
export const RECONCILE_PUBLICATION_STATES_JOB = 'reconcile-publication-states';
export const CLEANUP_STALE_EVENT_DRAFTS_JOB = 'cleanup-stale-event-drafts';

export const PREVIEW_TTL_SECONDS = 60 * 60;
export const PREVIEW_TRIM_DAYS = 30;
export const PUBLIC_APP_ORIGIN = resolvePublicAppOrigin();
export const PREVIEW_TOKEN_SECRET = resolvePreviewTokenSecret();

function resolvePublicAppOrigin(): string {
  const configuredOrigin = process.env.PUBLIC_APP_ORIGIN?.trim();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (isLocalRuntime()) {
    return 'http://localhost:4200';
  }

  return '';
}

function resolvePreviewTokenSecret(): string {
  const configuredSecret = process.env.PUBLIC_CONTENT_PREVIEW_TOKEN_SECRET?.trim();
  if (configuredSecret) {
    return configuredSecret;
  }

  if (isLocalRuntime()) {
    return 'development-preview-token-secret';
  }

  return '';
}

function isLocalRuntime(): boolean {
  return !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}
