import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import {
  issueSportsOfflineCollectorCredential,
  verifySportsOfflineCollectorCredential,
} from './sports-offline-collector-credential';

describe('sports offline collector credentials', () => {
  const originalEnvironment = process.env;
  const input = {
    matchId: 'match-1',
    collectorPersonId: 'person-1',
    collectorUserId: 'user-1',
    collectorRole: 'REFEREE',
    collectorKind: 'OFFICIAL' as const,
    issuedAt: new Date(Date.now() - 60 * 60_000),
  };

  beforeEach(() => {
    process.env = { ...originalEnvironment, NODE_ENV: 'test' };
    delete process.env.SPORTS_OFFLINE_COLLECTOR_SECRET;
    delete process.env.SPORTS_IDENTITY_SECRET;
    process.env.SPORTS_OFFLINE_COLLECTOR_KEY_VERSION = '1';
    process.env.SPORTS_OFFLINE_COLLECTOR_CREDENTIAL_TTL_MS = String(48 * 60 * 60_000);
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('issues a durable match-bound proof with server-authenticated collector fields', () => {
    const issued = issueSportsOfflineCollectorCredential(input);

    expect(issued).toMatchObject({
      collectorPersonId: 'person-1',
      issuedAt: input.issuedAt,
    });
    expect(verifySportsOfflineCollectorCredential(issued.credential)).toEqual({
      version: 2,
      keyVersion: '1',
      matchId: 'match-1',
      collectorPersonId: 'person-1',
      collectorUserId: 'user-1',
      collectorRole: 'REFEREE',
      collectorKind: 'OFFICIAL',
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: new Date(input.issuedAt.getTime() + 48 * 60 * 60_000).toISOString(),
    });
  });

  it('rejects a client-tampered credential', () => {
    const issued = issueSportsOfflineCollectorCredential(input);
    const [version, payload, signature] = issued.credential.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
        collectorPersonId: 'person-2',
      }),
      'utf8',
    ).toString('base64url');

    expect(() => verifySportsOfflineCollectorCredential(`${version}.${tamperedPayload}.${signature}`)).toThrow(
      BadRequestException,
    );
  });

  it.each(['', ' '.repeat(4), 'x'.repeat(2_049), 'v2.payload.signature', 'v1.payload', 'v1.payload.signature.extra'])(
    'rejects a malformed credential token',
    (credential) => {
      expect(() => verifySportsOfflineCollectorCredential(credential)).toThrow(BadRequestException);
    },
  );

  it('rejects a signature with a different byte length', () => {
    const issued = issueSportsOfflineCollectorCredential(input);
    const [version, payload] = issued.credential.split('.');

    expect(() => verifySportsOfflineCollectorCredential(`${version}.${payload}.AA`)).toThrow(BadRequestException);
  });

  it('rejects signed content that is not JSON', () => {
    const encodedPayload = Buffer.from('{', 'utf8').toString('base64url');
    const signature = createHmac('sha256', 'local-development-sports-offline-collector-secret')
      .update(`v2.${encodedPayload}`, 'utf8')
      .digest('base64url');

    expect(() => verifySportsOfflineCollectorCredential(`v2.${encodedPayload}.${signature}`)).toThrow(
      BadRequestException,
    );
  });

  it.each([
    null,
    [],
    {
      ...input,
      version: 1,
      keyVersion: '1',
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    {
      ...input,
      version: 2,
      keyVersion: '1',
      matchId: '',
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    {
      ...input,
      version: 2,
      keyVersion: '1',
      collectorPersonId: ' person-1',
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    {
      ...input,
      version: 2,
      keyVersion: '1',
      collectorUserId: 'x'.repeat(201),
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    {
      ...input,
      version: 2,
      keyVersion: '1',
      collectorRole: 'invalid-role',
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    {
      ...input,
      version: 2,
      keyVersion: '1',
      collectorKind: 'COACH',
      issuedAt: input.issuedAt.toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    {
      ...input,
      version: 2,
      keyVersion: '1',
      issuedAt: 'not-a-date',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  ])('rejects an invalid signed payload', (payload) => {
    expect(() => verifySportsOfflineCollectorCredential(signPayload(payload))).toThrow(BadRequestException);
  });

  it('normalizes a valid signed timestamp', () => {
    expect(
      verifySportsOfflineCollectorCredential(
        signPayload({
          version: 2,
          keyVersion: '1',
          matchId: 'match-1',
          collectorPersonId: 'person-1',
          collectorUserId: 'user-1',
          collectorRole: 'ADMIN',
          collectorKind: 'ADMIN',
          issuedAt: input.issuedAt.toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
      ).issuedAt,
    ).toBe(input.issuedAt.toISOString());
  });

  it('uses the identity secret as a fallback', () => {
    process.env.SPORTS_IDENTITY_SECRET = 'identity-secret';

    const issued = issueSportsOfflineCollectorCredential({ ...input, issuedAt: undefined });

    expect(issued.issuedAt).toBeInstanceOf(Date);
    expect(verifySportsOfflineCollectorCredential(issued.credential).matchId).toBe('match-1');
  });

  it('rejects expired credentials and credentials signed with an old key version', () => {
    const expired = issueSportsOfflineCollectorCredential({
      ...input,
      issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60_000),
      expiresAt: new Date(Date.now() - 10 * 60_000),
    });
    expect(() => verifySportsOfflineCollectorCredential(expired.credential)).toThrow(BadRequestException);

    const oldVersion = issueSportsOfflineCollectorCredential(input).credential;
    process.env.SPORTS_OFFLINE_COLLECTOR_KEY_VERSION = '2';
    expect(() => verifySportsOfflineCollectorCredential(oldVersion)).toThrow(BadRequestException);
  });

  it('requires an explicit secret outside development and test', () => {
    process.env.NODE_ENV = 'production';

    expect(() => issueSportsOfflineCollectorCredential(input)).toThrow(InternalServerErrorException);
  });
});

function signPayload(payload: unknown): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', 'local-development-sports-offline-collector-secret')
    .update(`v2.${encodedPayload}`, 'utf8')
    .digest('base64url');
  return `v2.${encodedPayload}.${signature}`;
}
