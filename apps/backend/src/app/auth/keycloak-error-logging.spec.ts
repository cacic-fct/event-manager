import axios from 'axios';
import { summarizeKeycloakFailure } from './keycloak-error-logging';

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    isAxiosError: jest.fn(),
  },
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('summarizeKeycloakFailure', () => {
  beforeEach(() => {
    mockedAxios.isAxiosError.mockImplementation((value) => isMockAxiosError(value));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('summarizes safe Axios response fields and redacts known secrets', () => {
    const summary = summarizeKeycloakFailure(
      axiosError({
        response: {
          status: 401,
          statusText: ' Unauthorized ',
          data: {
            error: 'invalid_client client_secret=secret-value',
            error_description: 'access_token=abc123 is not accepted',
            errorMessage: 403,
            message: true,
            password: 'must not be logged',
          },
        },
        code: ' EKEYCLOAK ',
      }),
    );

    expect(summary).toEqual({
      message:
        'status=401 Unauthorized; error=invalid_client client_secret=[redacted]; description=access_token=[redacted] is not accepted; message=403; message=true; axiosCode=EKEYCLOAK',
      dedupeKey:
        'status=401|error=invalid_client client_secret=[redacted]|description=access_token=[redacted] is not accepted|message=403|message=true|axiosCode=EKEYCLOAK',
    });
  });

  it('summarizes string response bodies and normalizes whitespace', () => {
    const summary = summarizeKeycloakFailure(
      axiosError({
        response: {
          status: 503,
          statusText: 'Service   Unavailable',
          data: ' upstream\n\nfailure token=secret ',
        },
      }),
    );

    expect(summary).toEqual({
      message: 'status=503 Service Unavailable; body=upstream failure token=[redacted]',
      dedupeKey: 'status=503|body=upstream failure token=[redacted]',
    });
  });

  it('falls back to response keys while filtering sensitive response keys', () => {
    const summary = summarizeKeycloakFailure(
      axiosError({
        response: {
          status: 400,
          data: {
            access_token: 'secret',
            authorization: 'secret',
            nested: {},
            debug: 1,
            extra: true,
            foo: 'bar',
            more: 'value',
            sixth: 'ignored',
          },
        },
      }),
    );

    expect(summary).toEqual({
      message: 'status=400; responseKeys=nested,debug,extra,foo,more',
      dedupeKey: 'status=400|responseKeys=nested,debug,extra,foo,more',
    });
  });

  it('uses the Axios message when response data has no safe summary', () => {
    const summary = summarizeKeycloakFailure(
      axiosError({
        response: {
          data: {
            access_token: 'secret',
            refresh_token: 'secret',
          },
        },
        message: 'network failed password=secret',
      }),
    );

    expect(summary).toEqual({
      message: 'status=none; message=network failed password=[redacted]',
      dedupeKey: 'status=none|message=network failed password=[redacted]',
    });
  });

  it('uses the Axios message when response data is missing or not an object', () => {
    const missingDataSummary = summarizeKeycloakFailure(
      axiosError({
        response: {
          data: null,
        },
        message: 'missing response body',
      }),
    );
    const nonObjectDataSummary = summarizeKeycloakFailure(
      axiosError({
        response: {
          data: 42,
        },
        message: 'numeric response body',
      }),
    );

    expect(missingDataSummary).toEqual({
      message: 'status=none; message=missing response body',
      dedupeKey: 'status=none|message=missing response body',
    });
    expect(nonObjectDataSummary).toEqual({
      message: 'status=none; message=numeric response body',
      dedupeKey: 'status=none|message=numeric response body',
    });
  });

  it('summarizes generic errors and truncates long values', () => {
    const longMessage = `failure ${'x'.repeat(400)}`;

    const summary = summarizeKeycloakFailure(new Error(longMessage));

    expect(summary.message).toHaveLength('message='.length + 303);
    expect(summary.message).toMatch(/^message=failure x+/);
    expect(summary.message.endsWith('...')).toBe(true);
    expect(summary.dedupeKey).toBe(summary.message);
  });

  it('summarizes non-error thrown values', () => {
    expect(summarizeKeycloakFailure(false)).toEqual({
      message: 'error=false',
      dedupeKey: 'error=false',
    });
  });
});

function axiosError(overrides: {
  code?: string;
  message?: string;
  response?: {
    data?: unknown;
    status?: number;
    statusText?: string;
  };
}) {
  return {
    isMockAxiosError: true,
    ...overrides,
  };
}

function isMockAxiosError(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'isMockAxiosError' in value;
}
