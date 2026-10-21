export const DATA_TRANSFER_TEST_DATABASE = 'fct_app_data_transfer_test';

/** Reject configuration before connecting; never fall back to the application's DATABASE_URL. */
export function requireDataTransferTestDatabase(value) {
  let url;
  try {
    url = value ? new URL(value) : undefined;
  } catch {
    // Do not include a URL or credentials in configuration errors.
  }
  if (
    !url ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== `/${DATA_TRANSFER_TEST_DATABASE}` ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Set DATA_TRANSFER_TEST_DATABASE_URL to a loopback PostgreSQL database named fct_app_data_transfer_test, without query parameters.',
    );
  }
  return url.toString();
}
