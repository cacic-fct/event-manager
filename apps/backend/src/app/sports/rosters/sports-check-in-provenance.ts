import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type SportsOfflineCollectorCredentialPayload,
  verifySportsOfflineCollectorCredential,
} from '../security/sports-offline-collector-credential';

export interface SportsOfflineCollectorInput {
  collectorPersonId?: string | null;
  collectorCredential?: string | null;
}

export interface SportsCheckInUploader {
  personId: string;
  userId: string;
  role: string;
}

export interface SportsCheckInCollector {
  personId: string;
  actorPersonId: string | null;
  userId: string;
  role: string;
  kind: 'ADMIN' | 'OFFICIAL';
  credentialIssuedAt?: string;
}

export function requireSportsCheckInUploaderUserId(value: string | null): asserts value is string {
  if (!value?.trim()) {
    throw new BadRequestException('O usuário autenticado não possui uma conta vinculada para sincronizar check-ins.');
  }
}

export async function resolveSportsCheckInCollector(params: {
  prisma: Pick<Prisma.TransactionClient, 'people' | 'user'>;
  matchId: string;
  checkedInAt?: Date;
  offline: boolean;
  uploader: SportsCheckInUploader;
  input: SportsOfflineCollectorInput;
}): Promise<SportsCheckInCollector> {
  if (!params.offline) {
    return {
      personId: params.uploader.personId,
      actorPersonId: params.uploader.personId,
      userId: params.uploader.userId,
      role: params.uploader.role,
      kind: params.uploader.role === 'ADMIN' ? 'ADMIN' : 'OFFICIAL',
    };
  }
  if (!params.checkedInAt || Number.isNaN(params.checkedInAt.getTime())) {
    throw new BadRequestException('Informe a data original do check-in off-line.');
  }
  if (params.checkedInAt.getTime() > Date.now() + 5 * 60_000) {
    throw new BadRequestException('A data do check-in off-line está no futuro.');
  }
  const collectorPersonId = params.input.collectorPersonId?.trim();
  const collectorCredential = params.input.collectorCredential?.trim();
  if (!collectorPersonId || !collectorCredential) {
    throw new BadRequestException('Informe a credencial e a pessoa coletora do check-in off-line.');
  }

  const credential = verifySportsOfflineCollectorCredential(collectorCredential);
  assertCredentialMatchesCheckIn(credential, params.matchId, collectorPersonId);
  const [collectorPerson, collectorUser] = await Promise.all([
    params.prisma.people.findUnique({
      where: { id: credential.collectorPersonId },
      select: { id: true },
    }),
    params.prisma.user.findUnique({
      where: { id: credential.collectorUserId },
      select: { id: true },
    }),
  ]);
  if (!collectorUser) {
    throw new BadRequestException('A conta histórica da pessoa coletora não foi encontrada.');
  }
  return {
    personId: credential.collectorPersonId,
    actorPersonId: collectorPerson?.id ?? null,
    userId: collectorUser.id,
    role: credential.collectorRole,
    kind: credential.collectorKind,
    credentialIssuedAt: credential.issuedAt,
  };
}

export function sportsCheckInProvenanceMetadata(params: {
  collector: SportsCheckInCollector;
  uploader: SportsCheckInUploader;
  offline: boolean;
  clientId: string;
}): Record<string, unknown> {
  return {
    offline: params.offline,
    offlineClientId: params.clientId,
    collector: {
      personId: params.collector.personId,
      userId: params.collector.userId,
      role: params.collector.role,
      kind: params.collector.kind,
      credentialIssuedAt: params.collector.credentialIssuedAt ?? null,
    },
    uploader: {
      personId: params.uploader.personId,
      userId: params.uploader.userId,
      role: params.uploader.role,
      kind: params.uploader.role === 'ADMIN' ? 'ADMIN' : 'OFFICIAL',
    },
    crossUserHandoff: params.collector.userId !== params.uploader.userId,
  };
}

function assertCredentialMatchesCheckIn(
  credential: SportsOfflineCollectorCredentialPayload,
  matchId: string,
  collectorPersonId: string,
): void {
  if (credential.matchId !== matchId || credential.collectorPersonId !== collectorPersonId) {
    throw new BadRequestException('A credencial do coletor não corresponde a esta partida e pessoa.');
  }
}
