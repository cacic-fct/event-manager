import axios from 'axios';
import { isRecord } from './keycloak-claims.utils';

export type KeycloakFailureSummary = {
  message: string;
  dedupeKey: string;
};

const MAX_LOG_VALUE_LENGTH = 300;

const SAFE_KEYCLOAK_RESPONSE_FIELDS: readonly { label: string; key: string }[] = [
  { label: 'error', key: 'error' },
  { label: 'description', key: 'error_description' },
  { label: 'message', key: 'errorMessage' },
  { label: 'message', key: 'message' },
];

const SENSITIVE_RESPONSE_KEYS = new Set([
  'access_token',
  'authorization',
  'client_secret',
  'code',
  'id_token',
  'password',
  'refresh_token',
  'token',
]);

export function summarizeKeycloakFailure(error: unknown): KeycloakFailureSummary {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const statusText = normalizeLogValue(error.response?.statusText);
    const statusSummary = `status=${status ?? 'none'}${statusText ? ` ${statusText}` : ''}`;
    const responseSummary = summarizeKeycloakResponseData(error.response?.data);
    const segments = [statusSummary];
    const dedupeSegments = [`status=${status ?? 'none'}`];

    if (responseSummary) {
      segments.push(responseSummary.message);
      dedupeSegments.push(responseSummary.dedupeKey);
    }

    if (typeof error.code === 'string' && error.code.trim()) {
      const code = sanitizeLogValue(error.code);
      segments.push(`axiosCode=${code}`);
      dedupeSegments.push(`axiosCode=${code}`);
    }

    if (!responseSummary && error.message) {
      const message = sanitizeLogValue(error.message);
      segments.push(`message=${message}`);
      dedupeSegments.push(`message=${message}`);
    }

    return {
      message: segments.join('; '),
      dedupeKey: dedupeSegments.join('|'),
    };
  }

  if (error instanceof Error) {
    const message = sanitizeLogValue(error.message);
    return {
      message: `message=${message}`,
      dedupeKey: `message=${message}`,
    };
  }

  const value = sanitizeLogValue(String(error));
  return {
    message: `error=${value}`,
    dedupeKey: `error=${value}`,
  };
}

function summarizeKeycloakResponseData(data: unknown): KeycloakFailureSummary | null {
  if (data === undefined || data === null) {
    return null;
  }

  if (typeof data === 'string') {
    const body = sanitizeLogValue(data);
    return body ? { message: `body=${body}`, dedupeKey: `body=${body}` } : null;
  }

  if (!isRecord(data)) {
    return null;
  }

  const segments: string[] = [];
  for (const field of SAFE_KEYCLOAK_RESPONSE_FIELDS) {
    const value = data[field.key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      const formattedValue = sanitizeLogValue(String(value));
      if (formattedValue) {
        segments.push(`${field.label}=${formattedValue}`);
      }
    }
  }

  if (segments.length > 0) {
    return {
      message: segments.join('; '),
      dedupeKey: segments.join('|'),
    };
  }

  const responseKeys = Object.keys(data)
    .filter((key) => !SENSITIVE_RESPONSE_KEYS.has(key.toLowerCase()))
    .slice(0, 5);

  if (responseKeys.length === 0) {
    return null;
  }

  const keySummary = responseKeys.join(',');
  return {
    message: `responseKeys=${keySummary}`,
    dedupeKey: `responseKeys=${keySummary}`,
  };
}

function sanitizeLogValue(value: string): string {
  const normalized = normalizeLogValue(value);
  return truncateLogValue(redactKnownSecrets(normalized));
}

function normalizeLogValue(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function redactKnownSecrets(value: string): string {
  return value.replace(
    /\b(access_token|authorization|client_secret|code|id_token|password|refresh_token|token)=([^&\s]+)/gi,
    '$1=[redacted]',
  );
}

function truncateLogValue(value: string): string {
  if (value.length <= MAX_LOG_VALUE_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_LOG_VALUE_LENGTH)}...`;
}
