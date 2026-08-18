import { BadRequestException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsEligibilityStatus,
  SportsIdentityType,
  SportsRosterRole,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { SportsPaymentService } from '../sports-payment.service';
import { SportsIdentityProtectionService } from '../security/sports-identity-protection.service';

const TEAM_EDITABLE_FIELDS = ['name', 'institution', 'logo'] as const;
type SportsTeamEditableField = (typeof TEAM_EDITABLE_FIELDS)[number];

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

export abstract class SportsTeamChangeSupportService {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly identities: SportsIdentityProtectionService,
    protected readonly payments: SportsPaymentService,
    protected readonly auditLog: AuditLogService,
    protected readonly s3: S3Service,
  ) {}

  protected mergeDelta(current: Prisma.JsonValue, incoming: SportsTeamDeltaInput): SportsTeamDeltaInput {
    const parsed = this.readDelta(current);
    return {
      set: {
        ...(parsed.set ?? {}),
        ...(incoming.set ?? {}),
      },
      categoryIds: incoming.categoryIds ?? parsed.categoryIds,
      logo: incoming.logo ?? parsed.logo,
      memberChanges:
        incoming.memberChanges === undefined
          ? parsed.memberChanges
          : this.mergeByKey(parsed.memberChanges ?? [], incoming.memberChanges, (change) => change.teamMemberId),
      categoryRoleChanges:
        incoming.categoryRoleChanges === undefined
          ? parsed.categoryRoleChanges
          : this.mergeByKey(parsed.categoryRoleChanges ?? [], incoming.categoryRoleChanges, (change) =>
              change.registrationMemberId
                ? `existing:${change.registrationMemberId}`
                : `new:${change.registrationId}:${change.teamMemberId}`,
            ),
    };
  }

  protected readDelta(value: Prisma.JsonValue): SportsTeamDeltaInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    const objectValue = value as Record<string, unknown>;
    const set =
      objectValue['set'] && typeof objectValue['set'] === 'object' && !Array.isArray(objectValue['set'])
        ? (objectValue['set'] as SportsTeamDeltaInput['set'])
        : undefined;
    const categoryIds = Array.isArray(objectValue['categoryIds'])
      ? objectValue['categoryIds'].filter((id): id is string => typeof id === 'string')
      : undefined;
    const logo =
      objectValue['logo'] && typeof objectValue['logo'] === 'object' && !Array.isArray(objectValue['logo'])
        ? (objectValue['logo'] as SportsTeamDeltaInput['logo'])
        : undefined;
    const memberChanges = Array.isArray(objectValue['memberChanges'])
      ? (objectValue['memberChanges'] as SportsTeamMemberDeltaInput[])
      : undefined;
    const categoryRoleChanges = Array.isArray(objectValue['categoryRoleChanges'])
      ? (objectValue['categoryRoleChanges'] as SportsCategoryRoleDeltaInput[])
      : undefined;
    return {
      set,
      categoryIds,
      logo,
      memberChanges,
      categoryRoleChanges,
    };
  }

  protected findConflictingFields(
    baseValue: Prisma.JsonValue,
    currentValue: Prisma.JsonValue,
    delta: SportsTeamDeltaInput,
  ): SportsTeamEditableField[] {
    const base = this.readFieldRevisions(baseValue);
    const current = this.readFieldRevisions(currentValue);
    return TEAM_EDITABLE_FIELDS.filter(
      (field) =>
        (field === 'logo' ? delta.logo !== undefined : delta.set?.[field] !== undefined) &&
        (current[field] ?? 0) > (base[field] ?? 0),
    );
  }

  protected bumpFieldRevisions(
    currentValue: Prisma.JsonValue,
    delta: SportsTeamDeltaInput,
    revision: number,
  ): Record<string, number> {
    const current = this.readFieldRevisions(currentValue);
    for (const field of TEAM_EDITABLE_FIELDS) {
      if ((field === 'logo' && delta.logo !== undefined) || (field !== 'logo' && delta.set?.[field] !== undefined)) {
        current[field] = revision;
      }
    }
    return current;
  }

  protected readFieldRevisions(value: Prisma.JsonValue): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([field, revision]) => [field, Math.trunc(revision)]),
    );
  }

  protected buildTeamUpdate(delta: SportsTeamDeltaInput): Prisma.SportsTeamUpdateManyMutationInput {
    return {
      ...(delta.set?.name !== undefined ? { name: delta.set.name } : {}),
      ...(delta.set?.institution !== undefined ? { institution: delta.set.institution } : {}),
      ...(delta.logo
        ? {
            logoObjectKey: delta.logo.objectKey,
            logoSha256: delta.logo.sha256,
            logoMimeType: delta.logo.mimeType,
            logoSizeBytes: delta.logo.sizeBytes,
          }
        : {}),
    };
  }

  protected assertDeltaMatchesType(requestType: SportsTeamChangeRequestType, delta: SportsTeamDeltaInput): void {
    const hasSet = Boolean(delta.set && Object.keys(delta.set).length > 0);
    const hasCategories = delta.categoryIds !== undefined;
    const hasLogo = delta.logo !== undefined;
    const hasMemberChanges = delta.memberChanges !== undefined;
    const hasCategoryRoleChanges = delta.categoryRoleChanges !== undefined;
    const only = (...allowed: Array<keyof SportsTeamDeltaInput>) =>
      (!hasSet || allowed.includes('set')) &&
      (!hasCategories || allowed.includes('categoryIds')) &&
      (!hasLogo || allowed.includes('logo')) &&
      (!hasMemberChanges || allowed.includes('memberChanges')) &&
      (!hasCategoryRoleChanges || allowed.includes('categoryRoleChanges'));

    switch (requestType) {
      case SportsTeamChangeRequestType.TEAM_DETAILS:
        if (!hasSet || !only('set')) {
          throw new BadRequestException('A solicitação de dados da equipe deve conter apenas nome ou instituição.');
        }
        return;
      case SportsTeamChangeRequestType.MEMBER_ADD:
        if (!only('categoryIds')) {
          throw new BadRequestException('A solicitação de novo integrante contém alterações incompatíveis.');
        }
        return;
      case SportsTeamChangeRequestType.MEMBER_UPDATE:
        if (
          !hasMemberChanges ||
          delta.memberChanges?.length === 0 ||
          !only('memberChanges') ||
          delta.memberChanges?.some(
            (change) =>
              change.status === undefined ||
              !(
                [
                  SportsTeamMemberStatus.APPROVED,
                  SportsTeamMemberStatus.SUSPENDED,
                  SportsTeamMemberStatus.WITHDRAWN,
                ] as SportsTeamMemberStatus[]
              ).includes(change.status),
          )
        ) {
          throw new BadRequestException('Informe os integrantes, revisões e status que serão alterados.');
        }
        return;
      case SportsTeamChangeRequestType.MEMBER_REMOVE:
        if (
          !hasMemberChanges ||
          delta.memberChanges?.length === 0 ||
          !only('memberChanges') ||
          delta.memberChanges?.some((change) => change.status !== undefined)
        ) {
          throw new BadRequestException('Informe os integrantes e revisões que serão removidos.');
        }
        return;
      case SportsTeamChangeRequestType.CATEGORY_ROLE:
        if (!hasCategoryRoleChanges || delta.categoryRoleChanges?.length === 0 || !only('categoryRoleChanges')) {
          throw new BadRequestException('Informe as funções esportivas que serão alteradas.');
        }
        return;
      case SportsTeamChangeRequestType.LOGO:
        if (!hasLogo || !only('logo')) {
          throw new BadRequestException('A solicitação de logo deve conter apenas o arquivo já validado.');
        }
        return;
      default:
        throw new BadRequestException('Este tipo de alteração não pode ser enviado por representantes.');
    }
  }

  protected mergeByKey<T>(current: T[], incoming: T[], key: (value: T) => string): T[] {
    const merged = new Map(current.map((value) => [key(value), value]));
    for (const value of incoming) {
      merged.set(key(value), value);
    }
    return [...merged.values()];
  }

  protected normalizeChildId(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > 128) {
      throw new BadRequestException(`O identificador de ${label} é inválido.`);
    }
    return normalized;
  }

  protected normalizeClientKey(clientKey: string): string {
    const normalized = clientKey.trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(normalized)) {
      throw new BadRequestException('Identificador local da solicitação inválido.');
    }
    return normalized;
  }

  protected toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  protected async getRepresentativeRequest(tx: Prisma.TransactionClient, requestId: string) {
    return tx.sportsTeamChangeRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: {
        id: true,
        teamId: true,
        type: true,
        status: true,
        requestRevision: true,
        baseRevision: true,
        delta: true,
        reviewMessage: true,
        createdAt: true,
        updatedAt: true,
        identityClaims: {
          select: {
            id: true,
            clientKey: true,
            type: true,
            displayHint: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  protected async recordReviewAudit(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      type: SportsTeamChangeRequestType;
      status: SportsTeamChangeRequestStatus;
      team: {
        name: string;
        tournament: {
          majorEvent: {
            id: string;
          };
        };
      };
    },
    actor: AuthenticatedUser,
    status: SportsTeamChangeRequestStatus,
  ): Promise<void> {
    await this.auditLog.record(
      {
        entityType: AuditLogEntityType.SPORTS_TEAM_CHANGE_REQUEST,
        entityId: request.id,
        entityLabel: request.team.name,
        operation:
          status === SportsTeamChangeRequestStatus.APPROVED
            ? AuditLogOperation.APPROVE
            : status === SportsTeamChangeRequestStatus.REJECTED
              ? AuditLogOperation.REJECT
              : AuditLogOperation.REQUEST_CHANGES,
        actor,
        before: { type: request.type, status: request.status },
        after: { type: request.type, status },
        summary: 'Solicitação de alteração de equipe analisada.',
        scope: { majorEventId: request.team.tournament.majorEvent.id },
      },
      tx,
    );
  }
}
