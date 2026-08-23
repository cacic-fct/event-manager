import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';
const DEV_SECRET = 'local-development-attendance-offline-collector-secret';
const DEFAULT_TTL_MS = 48 * 60 * 60_000;
const DEFAULT_REPLAY_GRACE_MS = 7 * 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 5 * 60_000;

export interface OfflineAttendanceCollectorCredentialPayload {
  version: 1;
  eventId: string;
  collectorPersonId: string;
  collectorUserId: string;
  issuedAt: string;
  expiresAt: string;
  replayExpiresAt: string;
}

export function issueOfflineAttendanceCollectorCredential(input: {
  eventId: string;
  collectorPersonId: string;
  collectorUserId: string;
  issuedAt?: Date;
  expiresAt?: Date;
}): string {
  const issuedAt = input.issuedAt ?? new Date();
  const expiresAt = input.expiresAt ?? new Date(issuedAt.getTime() + credentialTtlMs());
  const replayExpiresAt = new Date(expiresAt.getTime() + replayGraceMs());
  const payload: OfflineAttendanceCollectorCredentialPayload = {
    version: 1,
    eventId: requireIdentifier(input.eventId),
    collectorPersonId: requireIdentifier(input.collectorPersonId),
    collectorUserId: requireIdentifier(input.collectorUserId),
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    replayExpiresAt: replayExpiresAt.toISOString(),
  };
  if (expiresAt <= issuedAt) {
    throw new BadRequestException('A credencial do coletor precisa ter validade positiva.');
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${VERSION}.${encoded}.${sign(encoded)}`;
}

export function verifyOfflineAttendanceCollectorCredential(
  credential: string,
  referenceAt = new Date(),
): OfflineAttendanceCollectorCredentialPayload {
  const normalized = credential.trim();
  const [version, encoded, signature, extra] = normalized.split('.');
  if (!normalized || normalized.length > 4096 || version !== VERSION || !encoded || !signature || extra) {
    throw invalidCredential();
  }
  const expected = Buffer.from(sign(encoded), 'base64url');
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw invalidCredential();
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw invalidCredential();
    }
    const record = payload as Record<string, unknown>;
    if (
      record['version'] !== 1 ||
      typeof record['eventId'] !== 'string' ||
      typeof record['collectorPersonId'] !== 'string' ||
      typeof record['collectorUserId'] !== 'string' ||
      typeof record['issuedAt'] !== 'string' ||
      typeof record['expiresAt'] !== 'string' ||
      typeof record['replayExpiresAt'] !== 'string'
    ) {
      throw invalidCredential();
    }
    const issuedAt = new Date(record['issuedAt']);
    const expiresAt = new Date(record['expiresAt']);
    const replayExpiresAt = new Date(record['replayExpiresAt']);
    const referenceTime = referenceAt.getTime();
    if (
      !Number.isFinite(issuedAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      !Number.isFinite(replayExpiresAt.getTime()) ||
      expiresAt <= issuedAt ||
      replayExpiresAt <= expiresAt ||
      !Number.isFinite(referenceTime) ||
      issuedAt.getTime() > referenceTime + CLOCK_SKEW_MS ||
      expiresAt.getTime() < referenceTime - CLOCK_SKEW_MS ||
      replayExpiresAt.getTime() < Date.now() - CLOCK_SKEW_MS
    ) {
      throw invalidCredential();
    }
    return {
      version: 1,
      eventId: requireIdentifier(record['eventId']),
      collectorPersonId: requireIdentifier(record['collectorPersonId']),
      collectorUserId: requireIdentifier(record['collectorUserId']),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      replayExpiresAt: replayExpiresAt.toISOString(),
    };
  } catch (error: unknown) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw invalidCredential();
  }
}

function requireIdentifier(value: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 200) {
    throw new BadRequestException('Identificador de credencial inválido.');
  }
  return value;
}

function credentialTtlMs(): number {
  const configured = Number.parseInt(process.env.OFFLINE_ATTENDANCE_CREDENTIAL_TTL_MS ?? '', 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, 7 * 24 * 60 * 60_000)
    : DEFAULT_TTL_MS;
}

function replayGraceMs(): number {
  const configured = Number.parseInt(process.env.OFFLINE_ATTENDANCE_CREDENTIAL_REPLAY_GRACE_MS ?? '', 10);
  return Number.isSafeInteger(configured) && configured > 0
    ? Math.min(configured, 30 * 24 * 60 * 60_000)
    : DEFAULT_REPLAY_GRACE_MS;
}

function secret(): string {
  const configured = process.env.OFFLINE_ATTENDANCE_COLLECTOR_SECRET?.trim();
  if (configured) {
    return configured;
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    return DEV_SECRET;
  }
  throw new InternalServerErrorException('OFFLINE_ATTENDANCE_COLLECTOR_SECRET is required outside development.');
}

function sign(encoded: string): string {
  return createHmac('sha256', secret()).update(`${VERSION}.${encoded}`, 'utf8').digest('base64url');
}

function invalidCredential(): BadRequestException {
  return new BadRequestException('Credencial do coletor off-line inválida.');
}
