import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

const CREDENTIAL_VERSION = 'v1';
const LOCAL_DEVELOPMENT_SECRET = 'local-development-sports-offline-collector-secret';

export type SportsOfflineCollectorKind = 'ADMIN' | 'OFFICIAL';

export interface SportsOfflineCollectorCredentialPayload {
  version: 1;
  matchId: string;
  collectorPersonId: string;
  collectorUserId: string;
  collectorRole: string;
  collectorKind: SportsOfflineCollectorKind;
  issuedAt: string;
}

export function issueSportsOfflineCollectorCredential(
  input: Omit<SportsOfflineCollectorCredentialPayload, 'version' | 'issuedAt'> & { issuedAt?: Date },
): { credential: string; collectorPersonId: string; issuedAt: Date } {
  const issuedAt = input.issuedAt ?? new Date();
  const payload = validatePayload({
    version: 1,
    matchId: input.matchId,
    collectorPersonId: input.collectorPersonId,
    collectorUserId: input.collectorUserId,
    collectorRole: input.collectorRole,
    collectorKind: input.collectorKind,
    issuedAt: issuedAt.toISOString(),
  });
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(encodedPayload);
  return {
    credential: `${CREDENTIAL_VERSION}.${encodedPayload}.${signature}`,
    collectorPersonId: payload.collectorPersonId,
    issuedAt,
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
    return validatePayload(JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')));
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
    record['version'] !== 1 ||
    !validIdentifier(record['matchId']) ||
    !validIdentifier(record['collectorPersonId']) ||
    !validIdentifier(record['collectorUserId']) ||
    !validRole(record['collectorRole']) ||
    (record['collectorKind'] !== 'ADMIN' && record['collectorKind'] !== 'OFFICIAL') ||
    typeof record['issuedAt'] !== 'string' ||
    !Number.isFinite(new Date(record['issuedAt']).getTime())
  ) {
    throw invalidCredential();
  }
  return {
    version: 1,
    matchId: record['matchId'],
    collectorPersonId: record['collectorPersonId'],
    collectorUserId: record['collectorUserId'],
    collectorRole: record['collectorRole'],
    collectorKind: record['collectorKind'],
    issuedAt: new Date(record['issuedAt']).toISOString(),
  };
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
