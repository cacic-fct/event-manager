import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  SportsEligibilityStatus,
  SportsIdentityType,
  SportsRosterRole,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
} from '@prisma/client';

const MAX_QUEUED_LOGO_BYTES = 2 * 1024 * 1024;

export interface SportsTeamDeltaInput {
  set?: {
    name?: string;
    institution?: string | null;
  };
  categoryIds?: string[];
  logo?: {
    objectKey: string;
    queuedObjectKey?: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
  };
  memberChanges?: SportsTeamMemberDeltaInput[];
  categoryRoleChanges?: SportsCategoryRoleDeltaInput[];
}

export interface SportsTeamMemberDeltaInput {
  teamMemberId: string;
  expectedRevision: number;
  status?: SportsTeamMemberStatus;
}

export interface SportsCategoryRoleDeltaInput {
  registrationMemberId?: string | null;
  registrationId: string;
  teamMemberId: string;
  expectedRegistrationRevision: number;
  expectedRole?: SportsRosterRole | null;
  expectedEligibility?: SportsEligibilityStatus | null;
  role: SportsRosterRole;
}

export interface SportsIdentityClaimInput {
  clientKey: string;
  type: SportsIdentityType;
  value: string;
}

export interface SubmitSportsTeamChangeInput {
  type: SportsTeamChangeRequestType;
  baseRevision: number;
  expectedRequestRevision?: number;
  delta: SportsTeamDeltaInput;
  identities?: SportsIdentityClaimInput[];
}

export type SportsTeamChangeReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
import { SportsTeamChangeSupportService } from './sports-team-change-support.service';

export abstract class SportsTeamChangeDeltaService extends SportsTeamChangeSupportService {
  protected normalizeDelta(
    input: SportsTeamDeltaInput,
    allowTrustedLogo = false,
    requestType?: SportsTeamChangeRequestType,
  ): SportsTeamDeltaInput {
    const normalized: SportsTeamDeltaInput = {};
    if (input.set) {
      const set: NonNullable<SportsTeamDeltaInput['set']> = {};
      if (input.set.name !== undefined) {
        const name = input.set.name.trim();
        if (name.length < 2 || name.length > 120) {
          throw new BadRequestException('O nome da equipe deve ter entre 2 e 120 caracteres.');
        }
        set.name = name;
      }
      if (input.set.institution !== undefined) {
        const institution = input.set.institution?.trim() || null;
        if (institution && institution.length > 160) {
          throw new BadRequestException('A instituição deve ter no máximo 160 caracteres.');
        }
        set.institution = institution;
      }
      if (Object.keys(set).length > 0) {
        normalized.set = set;
      }
    }
    if (input.categoryIds !== undefined) {
      normalized.categoryIds = [...new Set(input.categoryIds.map((id) => id.trim()).filter(Boolean))];
    }
    if (input.logo !== undefined) {
      if (!allowTrustedLogo) {
        throw new BadRequestException(
          'Use o envio de arquivo próprio para solicitar a troca do logo.',
        );
      }
      const logo = input.logo;
      const objectKeyMatch =
        /^sports\/tournaments\/[^/]+\/teams\/[^/]+\/logos\/sha256\/([a-f0-9]{64})\.([a-z0-9]+)$/.exec(
          logo.objectKey,
        );
      const queuedObjectKeyMatch =
        /^sports\/private\/team-logo-review\/[^/]+\/[^/]+\/([a-f0-9]{64})\.([a-z0-9]+)$/.exec(
          logo.queuedObjectKey ?? '',
        );
      const expectedExtensionByMimeType: Readonly<Record<string, string>> = {
        'image/avif': 'avif',
      };
      if (
        !objectKeyMatch ||
        !queuedObjectKeyMatch ||
        !/^[a-f0-9]{64}$/.test(logo.sha256) ||
        logo.mimeType !== 'image/avif' ||
        objectKeyMatch?.[1] !== logo.sha256 ||
        queuedObjectKeyMatch?.[1] !== logo.sha256 ||
        objectKeyMatch?.[2] !== expectedExtensionByMimeType[logo.mimeType] ||
        queuedObjectKeyMatch?.[2] !== expectedExtensionByMimeType[logo.mimeType] ||
        !Number.isInteger(logo.sizeBytes) ||
        logo.sizeBytes <= 0 ||
        logo.sizeBytes > 15 * 1024 * 1024
      ) {
        throw new BadRequestException('Os metadados do logo enviado são inválidos.');
      }
      normalized.logo = { ...logo };
    }
    if (input.memberChanges !== undefined) {
      normalized.memberChanges = input.memberChanges.map((change) => {
        const teamMemberId = this.normalizeChildId(
          change.teamMemberId,
          'integrante',
        );
        if (
          !Number.isInteger(change.expectedRevision) ||
          change.expectedRevision < 1
        ) {
          throw new BadRequestException(
            'A revisão do integrante deve ser um inteiro positivo.',
          );
        }
        if (
          change.status !== undefined &&
          !Object.values(SportsTeamMemberStatus).includes(change.status)
        ) {
          throw new BadRequestException('O status solicitado é inválido.');
        }
        return {
          teamMemberId,
          expectedRevision: change.expectedRevision,
          ...(change.status !== undefined ? { status: change.status } : {}),
        };
      });
      if (
        new Set(
          normalized.memberChanges.map((change) => change.teamMemberId),
        ).size !== normalized.memberChanges.length
      ) {
        throw new BadRequestException(
          'Um integrante não pode aparecer duas vezes na mesma solicitação.',
        );
      }
    }
    if (input.categoryRoleChanges !== undefined) {
      normalized.categoryRoleChanges = input.categoryRoleChanges.map(
        (change) => {
          const registrationMemberId =
            change.registrationMemberId === undefined ||
            change.registrationMemberId === null
              ? null
              : this.normalizeChildId(
                  change.registrationMemberId,
                  'função atual',
                );
          const registrationId = this.normalizeChildId(
            change.registrationId,
            'inscrição',
          );
          const teamMemberId = this.normalizeChildId(
            change.teamMemberId,
            'integrante',
          );
          if (
            !Number.isInteger(change.expectedRegistrationRevision) ||
            change.expectedRegistrationRevision < 1
          ) {
            throw new BadRequestException(
              'A revisão da inscrição deve ser um inteiro positivo.',
            );
          }
          if (!Object.values(SportsRosterRole).includes(change.role)) {
            throw new BadRequestException('A função esportiva é inválida.');
          }
          if (
            registrationMemberId &&
            (!change.expectedRole ||
              !Object.values(SportsRosterRole).includes(change.expectedRole) ||
              !change.expectedEligibility ||
              !Object.values(SportsEligibilityStatus).includes(
                change.expectedEligibility,
              ))
          ) {
            throw new BadRequestException(
              'Informe a função e a elegibilidade atuais para alterar uma atribuição.',
            );
          }
          if (
            !registrationMemberId &&
            (change.expectedRole != null ||
              change.expectedEligibility != null)
          ) {
            throw new BadRequestException(
              'Uma nova função não pode informar um estado anterior.',
            );
          }
          return {
            registrationMemberId,
            registrationId,
            teamMemberId,
            expectedRegistrationRevision:
              change.expectedRegistrationRevision,
            expectedRole: change.expectedRole ?? null,
            expectedEligibility: change.expectedEligibility ?? null,
            role: change.role,
          };
        },
      );
      const keys = normalized.categoryRoleChanges.map((change) =>
        change.registrationMemberId
          ? `existing:${change.registrationMemberId}`
          : `new:${change.registrationId}:${change.teamMemberId}`,
      );
      if (new Set(keys).size !== keys.length) {
        throw new BadRequestException(
          'Uma função não pode aparecer duas vezes na mesma solicitação.',
        );
      }
    }
    if (requestType) {
      this.assertDeltaMatchesType(requestType, normalized);
    }
    return normalized;
  }

  protected async readQueuedLogo(requestId: string): Promise<{
    objectKey: string;
    queuedObjectKey: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
  } | null> {
    const request = await this.prisma.sportsTeamChangeRequest.findUnique({
      where: { id: requestId },
      select: {
        type: true,
        status: true,
        delta: true,
      },
    });
    if (
      !request ||
      request.type !== SportsTeamChangeRequestType.LOGO ||
      !(
        [
          SportsTeamChangeRequestStatus.PENDING,
          SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
          SportsTeamChangeRequestStatus.CONFLICT,
        ] as SportsTeamChangeRequestStatus[]
      ).includes(request.status)
    ) {
      return null;
    }
    const logo = this.readDelta(request.delta).logo;
    if (!logo?.queuedObjectKey) {
      throw new ConflictException(
        'A solicitação de logo não possui um objeto privado para análise.',
      );
    }
    return {
      objectKey: logo.objectKey,
      queuedObjectKey: logo.queuedObjectKey,
      sha256: logo.sha256,
      mimeType: logo.mimeType,
      sizeBytes: logo.sizeBytes,
    };
  }

  protected async promoteQueuedLogo(logo: {
    objectKey: string;
    queuedObjectKey: string;
    sha256: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<void> {
    if (await this.s3.fileExists(logo.objectKey)) {
      return;
    }
    const object = await this.s3.downloadFile(logo.queuedObjectKey);
    const chunks: Buffer[] = [];
    let sizeBytes = 0;
    for await (const chunk of object.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += buffer.length;
      if (sizeBytes > MAX_QUEUED_LOGO_BYTES) {
        throw new BadRequestException(
          'O logo em análise excede o limite permitido.',
        );
      }
      chunks.push(buffer);
    }
    const content = Buffer.concat(chunks);
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (
      sha256 !== logo.sha256 ||
      content.length !== logo.sizeBytes ||
      object.contentType !== logo.mimeType
    ) {
      throw new ConflictException(
        'O arquivo de logo em análise não corresponde aos metadados aprovados.',
      );
    }
    await this.s3.uploadFile(logo.objectKey, content, logo.mimeType, {
      sha256,
      immutable: 'true',
      approved: 'true',
    });
  }
}
