import { GraphqlStatusError, graphqlErrorStatus } from './graphql-error-status';

describe('graphqlErrorStatus', () => {
  it.each([
    ['FORBIDDEN', 403],
    ['NOT_FOUND', 404],
    ['UNAUTHENTICATED', 401],
  ])('maps Apollo code %s to status %i', (code, status) => {
    expect(graphqlErrorStatus({ extensions: { code } })).toBe(status);
  });

  it.each([
    [404, 404],
    [403, 403],
  ])('prefers Nest originalError.statusCode %i over INTERNAL_SERVER_ERROR', (statusCode, expected) => {
    expect(
      graphqlErrorStatus({
        extensions: {
          code: 'INTERNAL_SERVER_ERROR',
          originalError: { statusCode },
        },
      }),
    ).toBe(expected);
  });

  it.each([
    [{ statusCode: 429 }, 429],
    [{ status: 503 }, 503],
    [{ http: { status: 418 } }, 418],
    [{ originalError: { status: 502 } }, 502],
  ])('reads a valid structured HTTP status from extensions', (metadata, expected) => {
    expect(graphqlErrorStatus({ extensions: metadata })).toBe(expected);
  });

  it.each([
    undefined,
    null,
    '403',
    403,
    [],
    { statusCode: '404' },
    { status: '403' },
    { http: '403' },
    { originalError: [] },
    { statusCode: 399 },
    { statusCode: 600 },
    { statusCode: 403.5 },
    { statusCode: Number.NaN },
  ])('returns null for malformed or out-of-range metadata: %o', (extensions) => {
    expect(graphqlErrorStatus({ extensions })).toBeNull();
  });

  it('does not infer a status from error message text', () => {
    const messageOnly = { message: '403 Forbidden: resource not found' };

    expect(graphqlErrorStatus(messageOnly)).toBeNull();
  });
});

describe('GraphqlStatusError', () => {
  it('retains a structured HTTP status and message', () => {
    const error = new GraphqlStatusError('Private event', 404);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Private event');
    expect(error.status).toBe(404);
  });
});
