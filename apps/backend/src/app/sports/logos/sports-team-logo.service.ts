import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  PublicationState,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { SportsTeamChangeService } from '../teams/sports-team-change.service';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { validateSportsTeamLogoImage } from './sports-team-logo-validation';

export interface SportsTeamLogoUploadFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
}

export interface SportsTeamLogoRecord {
  teamId: string;
  revision: number;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  downloadUrl: string;
}

export interface SportsTeamLogoDownload {
  stream: Readable;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface SportsTeamLogoChangeRecord {
  requestId: string;
  requestRevision: number;
  sha256: string;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
}

@Injectable()
export class SportsTeamLogoService {
  private readonly logger = new Logger(SportsTeamLogoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly frozen: FrozenResourceService,
    private readonly auditLog: AuditLogService,
    private readonly teamChanges: SportsTeamChangeService,
  ) {}

  async submitRepresentativeUpload(
    sportsTeamId: string,
    baseRevision: number,
    expectedRequestRevision: number | undefined,
    file: SportsTeamLogoUploadFile | undefined,
    representativePersonId: string,
  ): Promise<SportsTeamLogoChangeRecord> {
    this.assertExpectedRevision(baseRevision);
    const image = await validateSportsTeamLogoImage(file);
    const sha256 = createHash('sha256').update(image.buffer).digest('hex');
    const team = await this.prisma.sportsTeam.findFirst({
      where: {
        id: sportsTeamId,
        deletedAt: null,
      },
      select: {
        id: true,
        tournamentId: true,
      },
    });
    if (!team) {
      throw new NotFoundException(`Sports team ${sportsTeamId} was not found.`);
    }
    const previousRequest = await this.prisma.sportsTeamChangeRequest.findFirst({
      where: {
        teamId: sportsTeamId,
        submittedByPersonId: representativePersonId,
        type: SportsTeamChangeRequestType.LOGO,
        status: {
          in: [
            SportsTeamChangeRequestStatus.PENDING,
            SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
            SportsTeamChangeRequestStatus.CONFLICT,
          ],
        },
      },
      select: { delta: true },
      orderBy: { updatedAt: 'desc' },
    });
    const previousQueuedObjectKey = this.readQueuedObjectKey(previousRequest?.delta);
    const permanentObjectKey = this.buildObjectKey(team.tournamentId, team.id, sha256, image.extension);
    const queuedObjectKey = this.buildQueuedObjectKey(team.id, sha256, image.extension);
    await this.s3.uploadFile(queuedObjectKey, image.buffer, image.mimeType, {
      sha256,
      private: 'true',
      pendingReview: 'true',
    });

    let request;
    try {
      request = await this.teamChanges.submit(
        sportsTeamId,
        representativePersonId,
        {
          type: SportsTeamChangeRequestType.LOGO,
          baseRevision,
          expectedRequestRevision,
          delta: {
            logo: {
              objectKey: permanentObjectKey,
              queuedObjectKey,
              sha256,
              mimeType: image.mimeType,
              sizeBytes: image.buffer.length,
            },
          },
        },
        true,
      );
    } catch (error) {
      await this.s3.deleteFile(queuedObjectKey).catch(() => undefined);
      throw error;
    }
    if (previousQueuedObjectKey && previousQueuedObjectKey !== queuedObjectKey) {
      try {
        await this.s3.deleteFile(previousQueuedObjectKey);
      } catch (error) {
        this.logger.warn(
          `Could not delete superseded queued sports team logo ${previousQueuedObjectKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return {
      requestId: request.id,
      requestRevision: request.requestRevision,
      sha256,
      mimeType: image.mimeType,
      sizeBytes: image.buffer.length,
      width: image.width,
      height: image.height,
    };
  }

  async upload(
    sportsTeamId: string,
    expectedRevision: number,
    file: SportsTeamLogoUploadFile | undefined,
    actor: AuthenticatedUser,
  ): Promise<SportsTeamLogoRecord> {
    const actorId = this.requireActorId(actor);
    this.assertExpectedRevision(expectedRevision);
    const image = await validateSportsTeamLogoImage(file);
    const sha256 = createHash('sha256').update(image.buffer).digest('hex');

    const team = await this.prisma.sportsTeam.findFirst({
      where: {
        id: sportsTeamId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        tournamentId: true,
        revision: true,
        fieldRevisions: true,
        logoObjectKey: true,
        logoSha256: true,
        logoMimeType: true,
        logoSizeBytes: true,
        tournament: {
          select: {
            majorEventId: true,
            deletedAt: true,
          },
        },
      },
    });
    if (!team || team.tournament.deletedAt) {
      throw new NotFoundException(`Sports team ${sportsTeamId} was not found.`);
    }
    await this.frozen.assertMajorEventMutable(team.tournament.majorEventId, actor, 'edit');

    if (
      team.logoSha256 === sha256 &&
      team.logoObjectKey &&
      team.logoMimeType === image.mimeType &&
      team.logoSizeBytes === image.buffer.length
    ) {
      return this.toRecord(team, image.width, image.height);
    }
    if (team.revision !== expectedRevision) {
      throw new ConflictException('A equipe mudou. Recarregue os dados antes de enviar o logo.');
    }

    const objectKey = this.buildObjectKey(team.tournamentId, team.id, sha256, image.extension);
    let uploadedObject = false;
    if (!(await this.s3.fileExists(objectKey))) {
      await this.s3.uploadFile(objectKey, image.buffer, image.mimeType, {
        sha256,
        immutable: 'true',
      });
      uploadedObject = true;
    }

    let updated;
    try {
      updated = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const nextRevision = team.revision + 1;
      const update = await tx.sportsTeam.updateMany({
        where: {
          id: team.id,
          revision: expectedRevision,
          deletedAt: null,
        },
        data: {
          logoObjectKey: objectKey,
          logoSha256: sha256,
          logoMimeType: image.mimeType,
          logoSizeBytes: image.buffer.length,
          revision: { increment: 1 },
          fieldRevisions: this.bumpLogoFieldRevision(team.fieldRevisions, nextRevision),
          updatedById: actorId,
        },
      });
      if (update.count !== 1) {
        throw new ConflictException('A equipe mudou durante o envio. Recarregue os dados e tente novamente.');
      }

      const result = await tx.sportsTeam.findUniqueOrThrow({
        where: { id: team.id },
        select: {
          id: true,
          revision: true,
          logoObjectKey: true,
          logoSha256: true,
          logoMimeType: true,
          logoSizeBytes: true,
        },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM,
          entityId: team.id,
          entityLabel: team.name,
          operation: AuditLogOperation.UPDATE,
          actor,
          before: {
            revision: team.revision,
            logoSha256: team.logoSha256,
            logoMimeType: team.logoMimeType,
            logoSizeBytes: team.logoSizeBytes,
          },
          after: {
            revision: result.revision,
            logoSha256: result.logoSha256,
            logoMimeType: result.logoMimeType,
            logoSizeBytes: result.logoSizeBytes,
          },
          summary: 'Logo imutável da equipe atualizado.',
          scope: {
            permission: Permission.SportsTeam.Update,
            majorEventId: team.tournament.majorEventId,
          },
        },
        tx,
      );
      return result;
      });
    } catch (error: unknown) {
      if (uploadedObject) {
        let stillUnreferenced = false;
        try {
          const committedReference = await this.prisma.sportsTeam.findFirst({
            where: {
              id: team.id,
              deletedAt: null,
              logoObjectKey: objectKey,
            },
            select: { id: true },
          });
          stillUnreferenced = !committedReference;
        } catch (referenceError: unknown) {
          this.logger.warn(
            `Could not verify sports team logo ownership before cleanup ${objectKey}: ${
              referenceError instanceof Error ? referenceError.message : String(referenceError)
            }`,
          );
        }
        if (stillUnreferenced) {
          await this.s3.deleteFile(objectKey).catch((cleanupError: unknown) => {
            this.logger.warn(
              `Could not clean up uncommitted sports team logo ${objectKey}: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              }`,
            );
          });
        }
      }
      throw error;
    }

    return this.toRecord(updated, image.width, image.height);
  }

  async downloadPendingReview(sportsTeamId: string, changeRequestId: string): Promise<SportsTeamLogoDownload> {
    const request = await this.prisma.sportsTeamChangeRequest.findFirst({
      where: {
        id: changeRequestId,
        teamId: sportsTeamId,
        type: SportsTeamChangeRequestType.LOGO,
        status: {
          in: [
            SportsTeamChangeRequestStatus.PENDING,
            SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
            SportsTeamChangeRequestStatus.CONFLICT,
          ],
        },
      },
      select: { delta: true },
    });
    const logo = this.readQueuedLogo(request?.delta, sportsTeamId);
    if (!logo) {
      throw new NotFoundException(`Pending sports team logo review ${changeRequestId} was not found.`);
    }

    const object = await this.s3.downloadFile(logo.queuedObjectKey);
    if (
      (object.contentType && object.contentType !== logo.mimeType) ||
      (object.contentLength !== undefined && object.contentLength !== logo.sizeBytes)
    ) {
      throw new ConflictException('O arquivo de logo em análise não corresponde aos metadados aprovados.');
    }
    return {
      stream: object.stream,
      mimeType: logo.mimeType,
      sizeBytes: object.contentLength ?? logo.sizeBytes,
      sha256: logo.sha256,
    };
  }

  async download(sportsTeamId: string, sha256: string): Promise<SportsTeamLogoDownload> {
    return this.downloadMatchingTeam(sportsTeamId, sha256, {});
  }

  async downloadPublic(sportsTeamId: string, sha256: string): Promise<SportsTeamLogoDownload> {
    return this.downloadMatchingTeam(sportsTeamId, sha256, {
      status: SportsTeamStatus.ACTIVE,
      tournament: {
        deletedAt: null,
        status: { not: SportsTournamentStatus.DRAFT },
        majorEvent: {
          deletedAt: null,
          publicationState: PublicationState.PUBLISHED,
        },
      },
    });
  }

  private async downloadMatchingTeam(
    sportsTeamId: string,
    sha256: string,
    additionalWhere: Prisma.SportsTeamWhereInput,
  ): Promise<SportsTeamLogoDownload> {
    this.assertSha256(sha256);
    const team = await this.prisma.sportsTeam.findFirst({
      where: {
        id: sportsTeamId,
        deletedAt: null,
        logoSha256: sha256,
        ...additionalWhere,
      },
      select: {
        logoObjectKey: true,
        logoSha256: true,
        logoMimeType: true,
        logoSizeBytes: true,
      },
    });
    if (!team?.logoObjectKey || !team.logoSha256 || !team.logoMimeType || team.logoSizeBytes == null) {
      throw new NotFoundException(`Sports team logo ${sha256} was not found.`);
    }

    const object = await this.s3.downloadFile(team.logoObjectKey);
    return {
      stream: object.stream,
      mimeType: team.logoMimeType,
      sizeBytes: team.logoSizeBytes,
      sha256: team.logoSha256,
    };
  }

  private buildObjectKey(tournamentId: string, teamId: string, sha256: string, extension: string): string {
    return `sports/tournaments/${tournamentId}/teams/${teamId}/logos/sha256/${sha256}.${extension}`;
  }

  private buildQueuedObjectKey(teamId: string, sha256: string, extension: string): string {
    return `sports/private/team-logo-review/${teamId}/${randomUUID()}/${sha256}.${extension}`;
  }

  private readQueuedObjectKey(value: Prisma.JsonValue | undefined): string | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const logo = value['logo'];
    if (!logo || typeof logo !== 'object' || Array.isArray(logo)) {
      return null;
    }
    const key = logo['queuedObjectKey'];
    return typeof key === 'string' && /^sports\/private\/team-logo-review\//.test(key) ? key : null;
  }

  private readQueuedLogo(value: Prisma.JsonValue | undefined, expectedTeamId: string): {
    queuedObjectKey: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
  } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const logo = value['logo'];
    if (!logo || typeof logo !== 'object' || Array.isArray(logo)) {
      return null;
    }
    const queuedObjectKey = logo['queuedObjectKey'];
    const sha256 = logo['sha256'];
    const mimeType = logo['mimeType'];
    const sizeBytes = logo['sizeBytes'];
    const keyMatch =
      typeof queuedObjectKey === 'string' &&
      /^sports\/private\/team-logo-review\/([^/]+)\/[^/]+\/([a-f0-9]{64})\.avif$/.exec(queuedObjectKey);
    if (
      !keyMatch ||
      keyMatch[1] !== expectedTeamId ||
      typeof sha256 !== 'string' ||
      sha256 !== keyMatch[2] ||
      typeof mimeType !== 'string' ||
      mimeType !== 'image/avif' ||
      typeof sizeBytes !== 'number' ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes <= 0
    ) {
      return null;
    }
    return { queuedObjectKey, sha256, mimeType, sizeBytes };
  }

  private bumpLogoFieldRevision(value: Prisma.JsonValue, revision: number): Prisma.InputJsonValue {
    const current =
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
          )
        : {};
    return {
      ...current,
      logo: revision,
    };
  }

  private toRecord(
    team: {
      id: string;
      revision: number;
      logoSha256: string | null;
      logoMimeType: string | null;
      logoSizeBytes: number | null;
    },
    width: number,
    height: number,
  ): SportsTeamLogoRecord {
    if (!team.logoSha256 || !team.logoMimeType || team.logoSizeBytes == null) {
      throw new ConflictException('O logo persistido da equipe está incompleto.');
    }
    return {
      teamId: team.id,
      revision: team.revision,
      sha256: team.logoSha256,
      mimeType: team.logoMimeType,
      sizeBytes: team.logoSizeBytes,
      width,
      height,
      downloadUrl: `/api/sports/admin/teams/${team.id}/logo/${team.logoSha256}`,
    };
  }

  private requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O usuário administrador não possui identificador.');
    }
    return actor.sub;
  }

  private assertExpectedRevision(expectedRevision: number): void {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new BadRequestException('A revisão esperada da equipe é inválida.');
    }
  }

  private assertSha256(sha256: string): void {
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new NotFoundException('Sports team logo was not found.');
    }
  }
}
