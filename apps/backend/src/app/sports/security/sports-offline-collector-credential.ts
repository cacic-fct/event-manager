import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

const CREDENTIAL_VERSION = 'v2';
const PAYLOAD_VERSION = 2;
const LOCAL_DEVELOPMENT_SECRET = 'local-development-sports-offline-collector-secret';
const DEFAULT_CREDENTIAL_TTL_MS = 48 * 60 * 60_000;
const CREDENTIAL_CLOCK_SKEW_MS = 5 * 60_000;

export type SportsOfflineCollectorKind = 'ADMIN' | 'OFFICIAL';

export interface SportsOfflineCollectorCredentialPayload {
  version: 2;
  keyVersion: string;
  matchId: string;
  collectorPersonId: string;
  collectorUserId: string;
  collectorRole: string;
  collectorKind: SportsOfflineCollectorKind;
  issuedAt: string;
  expiresAt: string;
}

export function issueSportsOfflineCollectorCredential(
  input: Omit<SportsOfflineCollectorCredentialPayload, 'version' | 'issuedAt' | 'expiresAt' | 'keyVersion'> & {
    issuedAt?: Date;
    expiresAt?: Date;
  },
): { credential: string; collectorPersonId: string; issuedAt: Date; expiresAt: Date } {
  const issuedAt = input.issuedAt ?? new Date();
  const requestedExpiresAt = input.expiresAt ?? new Date(issuedAt.getTime() + credentialTtlMs());
  const expiresAt = new Date(Math.min(requestedExpiresAt.getTime(), issuedAt.getTime() + credentialTtlMs()));
  const payload = validatePayload({
    version: PAYLOAD_VERSION,
    keyVersion: credentialKeyVersion(),
    matchId: input.matchId,
    collectorPersonId: input.collectorPersonId,
    collectorUserId: input.collectorUserId,
    collectorRole: input.collectorRole,
    collectorKind: input.collectorKind,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(encodedPayload);
  return {
    credential: `${CREDENTIAL_VERSION}.${encodedPayload}.${signature}`,
    collectorPersonId: payload.collectorPersonId,
    issuedAt,
    expiresAt,
  };
}

export function verifySportsOfflineCollectorCredential(credential: string): SportsOfflineCollectorCredentialPayload {
  const normalized = credential.trim();
  if (!normalized || normalized.length > 2_048) {
    throw invalidCredential();
  }
  const [version, encodedPayload, encodedSignature, extra] = normalized.split('.');
  if (version !== CREDENTIAL_VERSION || !encodedPayload || !encodedSignature || extra !== undefined) {
    throw invalidCredential();
  }

  const expected = Buffer.from(sign(encodedPayload), 'base64url');
  const received = Buffer.from(encodedSignature, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw invalidCredential();
  }

  try {
    const payload = validatePayload(JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')));
    const now = Date.now();
    const issuedAt = new Date(payload.issuedAt).getTime();
    const expiresAt = new Date(payload.expiresAt).getTime();
    if (payload.keyVersion !== credentialKeyVersion() || issuedAt > now + CREDENTIAL_CLOCK_SKEW_MS || expiresAt < now - CREDENTIAL_CLOCK_SKEW_MS) {
      throw invalidCredential();
    }
    return payload;
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw invalidCredential();
  }
}

function validatePayload(value: unknown): SportsOfflineCollectorCredentialPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidCredential();
  }
  const record = value as Record<string, unknown>;
  if (
    record['version'] !== PAYLOAD_VERSION ||
    !validKeyVersion(record['keyVersion']) ||
    !validIdentifier(record['matchId']) ||
    !validIdentifier(record['collectorPersonId']) ||
    !validIdentifier(record['collectorUserId']) ||
    !validRole(record['collectorRole']) ||
    (record['collectorKind'] !== 'ADMIN' && record['collectorKind'] !== 'OFFICIAL') ||
    typeof record['issuedAt'] !== 'string' ||
    !Number.isFinite(new Date(record['issuedAt']).getTime()) ||
    typeof record['expiresAt'] !== 'string' ||
    !Number.isFinite(new Date(record['expiresAt']).getTime()) ||
    new Date(record['expiresAt']).getTime() <= new Date(record['issuedAt']).getTime()
  ) {
    throw invalidCredential();
  }
  return {
    version: PAYLOAD_VERSION,
    keyVersion: record['keyVersion'],
    matchId: record['matchId'],
    collectorPersonId: record['collectorPersonId'],
    collectorUserId: record['collectorUserId'],
    collectorRole: record['collectorRole'],
    collectorKind: record['collectorKind'],
    issuedAt: new Date(record['issuedAt']).toISOString(),
    expiresAt: new Date(record['expiresAt']).toISOString(),
  };
}

function validKeyVersion(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(value);
}

function credentialKeyVersion(): string {
  const configured = process.env.SPORTS_OFFLINE_COLLECTOR_KEY_VERSION?.trim();
  return validKeyVersion(configured) ? configured : '1';
}

function credentialTtlMs(): number {
  const configured = Number.parseInt(process.env.SPORTS_OFFLINE_COLLECTOR_CREDENTIAL_TTL_MS ?? '', 10);
  return Number.isSafeInteger(configured) && configured > 0 ? Math.min(configured, 7 * 24 * 60 * 60_000) : DEFAULT_CREDENTIAL_TTL_MS;
}

function validIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length >= 1 && value.length <= 200;
}

function validRole(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value);
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', credentialSecret())
    .update(`${CREDENTIAL_VERSION}.${encodedPayload}`, 'utf8')
    .digest('base64url');
}

function credentialSecret(): string {
  const configured = process.env.SPORTS_OFFLINE_COLLECTOR_SECRET?.trim() || process.env.SPORTS_IDENTITY_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return LOCAL_DEVELOPMENT_SECRET;
  }
  throw new InternalServerErrorException(
    'SPORTS_OFFLINE_COLLECTOR_SECRET or SPORTS_IDENTITY_SECRET is required outside development and test.',
  );
}

function invalidCredential(): BadRequestException {
  return new BadRequestException('Credencial do coletor off-line inválida.');
}
