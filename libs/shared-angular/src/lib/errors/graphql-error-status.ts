const STATUS_BY_CODE: Readonly<Record<string, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/** Read structured GraphQL metadata; error messages must never determine access. */
export function graphqlErrorStatus(error: { extensions?: unknown }): number | null {
  const extensions = asRecord(error.extensions);
  if (!extensions) return null;
  const originalError = asRecord(extensions['originalError']);
  const http = asRecord(extensions['http']);
  const status = [
    extensions['statusCode'], extensions['status'], http?.['status'],
    originalError?.['statusCode'], originalError?.['status'],
  ].find((value) => typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599);
  if (typeof status === 'number') return status;
  const code = extensions['code'];
  return typeof code === 'string' ? STATUS_BY_CODE[code] ?? null : null;
}

export class GraphqlStatusError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
