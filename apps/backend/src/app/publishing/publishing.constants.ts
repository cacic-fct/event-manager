export const PUBLICATION_QUEUE = 'publication';
export const PUBLISH_SCHEDULED_CONTENT_JOB = 'publish-scheduled-public-content';
export const RECONCILE_PUBLICATION_STATES_JOB = 'reconcile-publication-states';

export const PREVIEW_TTL_SECONDS = 60 * 60;
export const PREVIEW_TRIM_DAYS = 30;
export const PUBLIC_APP_ORIGIN = process.env.PUBLIC_APP_ORIGIN?.trim() || 'http://localhost:4200';
