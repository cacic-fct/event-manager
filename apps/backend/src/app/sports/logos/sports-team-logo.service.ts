import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  PublicationState,
  SportsTeamChangeRequestType,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { SportsTeamChangeService } from '../teams/sports-team-change.service';
import { runSerializableSportsTransaction } from '../sports-transaction';

export const MAX_SPORTS_TEAM_LOGO_SIZE_BYTES = 2 * 1024 * 1024;
export const MIN_SPORTS_TEAM_LOGO_DIMENSION = 16;
export const MAX_SPORTS_TEAM_LOGO_DIMENSION = 4096;
export const MAX_SPORTS_TEAM_LOGO_PIXELS =
  MAX_SPORTS_TEAM_LOGO_DIMENSION * MAX_SPORTS_TEAM_LOGO_DIMENSION;

const SPORTS_TEAM_LOGO_METADATA_TIMEOUT_SECONDS = 3;

const LOGO_FORMATS = {
  jpeg: {
    mimeType: 'image/jpeg',
    extension: 'jpg',
  },
  png: {
    mimeType: 'image/png',
    extension: 'png',
  },
  webp: {
    mimeType: 'image/webp',
    extension: 'webp',
  },
} as const;

type SportsTeamLogoFormat = keyof typeof LOGO_FORMATS;

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
    const image = await this.validateImage(file);
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
    const objectKey = this.buildObjectKey(
      team.tournamentId,
      team.id,
      sha256,
      image.extension,
    );
    if (!(await this.s3.fileExists(objectKey))) {
      await this.s3.uploadFile(objectKey, image.buffer, image.mimeType, {
        sha256,
        immutable: 'true',
        pendingReview: 'true',
      });
    }

    const request = await this.teamChanges.submit(
      sportsTeamId,
      representativePersonId,
      {
        type: SportsTeamChangeRequestType.LOGO,
        baseRevision,
        expectedRequestRevision,
        delta: {
          logo: {
            objectKey,
            sha256,
            mimeType: image.mimeType,
            sizeBytes: image.buffer.length,
          },
        },
      },
      true,
    );
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
    const image = await this.validateImage(file);
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

    const objectKey = this.buildObjectKey(
      team.tournamentId,
      team.id,
      sha256,
      image.extension,
    );
    if (!(await this.s3.fileExists(objectKey))) {
      await this.s3.uploadFile(objectKey, image.buffer, image.mimeType, {
        sha256,
        immutable: 'true',
      });
    }

    const updated = await runSerializableSportsTransaction(this.prisma, async (tx) => {
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

    return this.toRecord(updated, image.width, image.height);
  }

  async download(sportsTeamId: string, sha256: string): Promise<SportsTeamLogoDownload> {
    return this.downloadMatchingTeam(sportsTeamId, sha256, {});
  }

  async downloadPublic(
    sportsTeamId: string,
    sha256: string,
  ): Promise<SportsTeamLogoDownload> {
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
    if (
      !team?.logoObjectKey ||
      !team.logoSha256 ||
      !team.logoMimeType ||
      team.logoSizeBytes == null
    ) {
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

  private async validateImage(file: SportsTeamLogoUploadFile | undefined): Promise<{
    buffer: Buffer;
    mimeType: string;
    extension: string;
    width: number;
    height: number;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('O arquivo de logo da equipe é obrigatório.');
    }
    if (
      file.size !== file.buffer.length ||
      file.buffer.length > MAX_SPORTS_TEAM_LOGO_SIZE_BYTES
    ) {
      throw new BadRequestException('O logo da equipe deve ter no máximo 2 MiB.');
    }

    let metadata;
    try {
      metadata = await sharp(file.buffer, {
        animated: false,
        failOn: 'warning',
        limitInputPixels: MAX_SPORTS_TEAM_LOGO_PIXELS,
        pages: 1,
        sequentialRead: true,
        unlimited: false,
      })
        .timeout({ seconds: SPORTS_TEAM_LOGO_METADATA_TIMEOUT_SECONDS })
        .metadata();
    } catch {
      throw new BadRequestException('O logo deve ser uma imagem PNG, JPEG ou WebP válida.');
    }

    if (!metadata.format || !(metadata.format in LOGO_FORMATS)) {
      throw new BadRequestException('O logo deve ser uma imagem PNG, JPEG ou WebP.');
    }
    const format = metadata.format as SportsTeamLogoFormat;
    const formatDetails = LOGO_FORMATS[format];
    if (file.mimetype.toLowerCase() !== formatDetails.mimeType) {
      throw new BadRequestException('O tipo declarado do arquivo não corresponde ao conteúdo da imagem.');
    }
    if (!metadata.width || !metadata.height) {
      throw new BadRequestException('Não foi possível determinar as dimensões do logo.');
    }
    if (
      metadata.width < MIN_SPORTS_TEAM_LOGO_DIMENSION ||
      metadata.height < MIN_SPORTS_TEAM_LOGO_DIMENSION ||
      metadata.width > MAX_SPORTS_TEAM_LOGO_DIMENSION ||
      metadata.height > MAX_SPORTS_TEAM_LOGO_DIMENSION ||
      metadata.width * metadata.height > MAX_SPORTS_TEAM_LOGO_PIXELS
    ) {
      throw new BadRequestException(
        `O logo deve ter entre ${MIN_SPORTS_TEAM_LOGO_DIMENSION}px e ${MAX_SPORTS_TEAM_LOGO_DIMENSION}px por lado.`,
      );
    }
    if (metadata.pages && metadata.pages > 1) {
      throw new BadRequestException('O logo não pode ser animado ou ter várias páginas.');
    }

    return {
      buffer: file.buffer,
      mimeType: formatDetails.mimeType,
      extension: formatDetails.extension,
      width: metadata.width,
      height: metadata.height,
    };
  }

  private buildObjectKey(
    tournamentId: string,
    teamId: string,
    sha256: string,
    extension: string,
  ): string {
    return `sports/tournaments/${tournamentId}/teams/${teamId}/logos/sha256/${sha256}.${extension}`;
  }

  private bumpLogoFieldRevision(
    value: Prisma.JsonValue,
    revision: number,
  ): Prisma.InputJsonValue {
    const current =
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).filter((entry): entry is [string, number] =>
              typeof entry[1] === 'number',
            ),
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
