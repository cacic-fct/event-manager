import { BadRequestException } from '@nestjs/common';
import {
  issueSportsOfflineCollectorCredential,
  verifySportsOfflineCollectorCredential,
} from './sports-offline-collector-credential';

describe('sports offline collector credentials', () => {
  const input = {
    matchId: 'match-1',
    collectorPersonId: 'person-1',
    collectorUserId: 'user-1',
    collectorRole: 'REFEREE',
    collectorKind: 'OFFICIAL' as const,
    issuedAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  it('issues a durable match-bound proof with server-authenticated collector fields', () => {
    const issued = issueSportsOfflineCollectorCredential(input);

    expect(issued).toMatchObject({
      collectorPersonId: 'person-1',
      issuedAt: input.issuedAt,
    });
    expect(verifySportsOfflineCollectorCredential(issued.credential)).toEqual({
      version: 1,
      matchId: 'match-1',
      collectorPersonId: 'person-1',
      collectorUserId: 'user-1',
      collectorRole: 'REFEREE',
      collectorKind: 'OFFICIAL',
      issuedAt: '2024-01-01T00:00:00.000Z',
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
});
