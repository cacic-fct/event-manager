import { BadRequestException } from '@nestjs/common';
import { issueSportsOfflineCollectorCredential } from '../security/sports-offline-collector-credential';
import { sportsCheckInUploader, sportsTestDate } from '../testing/sports-backend.fixtures';
import {
  requireSportsCheckInUploaderUserId,
  resolveSportsCheckInCollector,
  sportsCheckInProvenanceMetadata,
  type SportsCheckInUploader,
} from './sports-check-in-provenance';

describe('sports check-in provenance', () => {
  const uploader: SportsCheckInUploader = sportsCheckInUploader();
  const issuedAt = sportsTestDate(-60 * 60_000);

  const prisma = {
    people: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.people.findUnique.mockResolvedValue({ id: 'collector-person' });
    prisma.user.findUnique.mockResolvedValue({ id: 'collector-user' });
  });

  it('requires an authenticated uploader account', () => {
    expect(() => requireSportsCheckInUploaderUserId(null)).toThrow(BadRequestException);
    expect(() => requireSportsCheckInUploaderUserId('   ')).toThrow(
      'O usuário autenticado não possui uma conta vinculada para sincronizar check-ins.',
    );

    expect(() => requireSportsCheckInUploaderUserId('uploader-user')).not.toThrow();
  });

  it('uses the authenticated actor as collector for online check-ins', async () => {
    await expect(
      resolveSportsCheckInCollector({
        prisma,
        matchId: 'match-1',
        offline: false,
        uploader: { ...uploader, role: 'REFEREE' },
        input: {},
      }),
    ).resolves.toEqual({
      personId: 'uploader-person',
      actorPersonId: 'uploader-person',
      userId: 'uploader-user',
      role: 'REFEREE',
      kind: 'OFFICIAL',
    });
    expect(prisma.people.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('restores the original collector identity from a signed offline credential', async () => {
    const issued = issueSportsOfflineCollectorCredential({
      matchId: 'match-1',
      collectorPersonId: 'collector-person',
      collectorUserId: 'collector-user',
      collectorRole: 'REFEREE',
      collectorKind: 'OFFICIAL',
      issuedAt,
    });

    await expect(
      resolveSportsCheckInCollector({
        prisma,
        matchId: 'match-1',
        checkedInAt: sportsTestDate(-30 * 60_000),
        offline: true,
        uploader,
        input: {
          collectorPersonId: ' collector-person ',
          collectorCredential: ` ${issued.credential} `,
        },
      }),
    ).resolves.toEqual({
      personId: 'collector-person',
      actorPersonId: 'collector-person',
      userId: 'collector-user',
      role: 'REFEREE',
      kind: 'OFFICIAL',
      credentialIssuedAt: issuedAt.toISOString(),
    });
    expect(prisma.people.findUnique).toHaveBeenCalledWith({
      where: { id: 'collector-person' },
      select: { id: true },
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'collector-user' },
      select: { id: true },
    });
  });

  it.each([
    {
      name: 'missing original timestamp',
      checkedInAt: undefined,
      input: {},
      message: 'Informe a data original do check-in off-line.',
    },
    {
      name: 'invalid original timestamp',
      checkedInAt: new Date(Number.NaN),
      input: {},
      message: 'Informe a data original do check-in off-line.',
    },
    {
      name: 'missing collector proof',
      checkedInAt: new Date(),
      input: { collectorPersonId: 'collector-person' },
      message: 'Informe a credencial e a pessoa coletora do check-in off-line.',
    },
  ])('rejects $name', async ({ checkedInAt, input, message }) => {
    await expect(
      resolveSportsCheckInCollector({ prisma, matchId: 'match-1', checkedInAt, offline: true, uploader, input }),
    ).rejects.toThrow(message);
  });

  it('rejects future offline timestamps', async () => {
    await expect(
      resolveSportsCheckInCollector({
        prisma,
        matchId: 'match-1',
        checkedInAt: sportsTestDate(6 * 60_000),
        offline: true,
        uploader,
        input: { collectorPersonId: 'collector-person', collectorCredential: 'credential' },
      }),
    ).rejects.toThrow('A data do check-in off-line está no futuro.');
  });

  it('rejects a credential issued for another match or collector', async () => {
    const issued = issueSportsOfflineCollectorCredential({
      matchId: 'another-match',
      collectorPersonId: 'collector-person',
      collectorUserId: 'collector-user',
      collectorRole: 'REFEREE',
      collectorKind: 'OFFICIAL',
      issuedAt,
    });

    await expect(
      resolveSportsCheckInCollector({
        prisma,
        matchId: 'match-1',
        checkedInAt: issuedAt,
        offline: true,
        uploader,
        input: { collectorPersonId: 'collector-person', collectorCredential: issued.credential },
      }),
    ).rejects.toThrow('A credencial do coletor não corresponde a esta partida e pessoa.');
  });

  it('retains credential identity when the historical person was removed', async () => {
    prisma.people.findUnique.mockResolvedValue(null);
    const issued = issueSportsOfflineCollectorCredential({
      matchId: 'match-1',
      collectorPersonId: 'collector-person',
      collectorUserId: 'collector-user',
      collectorRole: 'ADMIN',
      collectorKind: 'ADMIN',
      issuedAt,
    });

    await expect(
      resolveSportsCheckInCollector({
        prisma,
        matchId: 'match-1',
        checkedInAt: issuedAt,
        offline: true,
        uploader,
        input: { collectorPersonId: 'collector-person', collectorCredential: issued.credential },
      }),
    ).resolves.toMatchObject({ personId: 'collector-person', actorPersonId: null, kind: 'ADMIN' });
  });

  it('rejects a credential whose historical user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const issued = issueSportsOfflineCollectorCredential({
      matchId: 'match-1',
      collectorPersonId: 'collector-person',
      collectorUserId: 'collector-user',
      collectorRole: 'REFEREE',
      collectorKind: 'OFFICIAL',
      issuedAt,
    });

    await expect(
      resolveSportsCheckInCollector({
        prisma,
        matchId: 'match-1',
        checkedInAt: issuedAt,
        offline: true,
        uploader,
        input: { collectorPersonId: 'collector-person', collectorCredential: issued.credential },
      }),
    ).rejects.toThrow('A conta histórica da pessoa coletora não foi encontrada.');
  });

  it('records collector and uploader separately for a shared-device handoff', () => {
    expect(
      sportsCheckInProvenanceMetadata({
        collector: {
          personId: 'collector-person',
          actorPersonId: null,
          userId: 'collector-user',
          role: 'REFEREE',
          kind: 'OFFICIAL',
          credentialIssuedAt: issuedAt.toISOString(),
        },
        uploader,
        offline: true,
        clientId: 'offline-client-1',
      }),
    ).toEqual({
      offline: true,
      offlineClientId: 'offline-client-1',
      collector: {
        personId: 'collector-person',
        userId: 'collector-user',
        role: 'REFEREE',
        kind: 'OFFICIAL',
        credentialIssuedAt: issuedAt.toISOString(),
      },
      uploader: {
        personId: 'uploader-person',
        userId: 'uploader-user',
        role: 'ADMIN',
        kind: 'ADMIN',
      },
      crossUserHandoff: true,
    });
  });
});
