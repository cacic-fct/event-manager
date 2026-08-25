import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogActorType,
  AuditLogOperation,
  SportsEligibilityStatus,
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsRosterRole,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { SportsPaymentService } from '../sports-payment.service';
import { runSerializableSportsTransaction } from '../sports-transaction';
import { SportsIdentityProtectionService } from '../security/sports-identity-protection.service';

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
import { SportsTeamChangeMemberService } from './sports-team-change-member.service';

@Injectable()
export class SportsTeamChangeService extends SportsTeamChangeMemberService {
  private readonly logger = new Logger(SportsTeamChangeService.name);

  constructor(
    prisma: PrismaService,
    identities: SportsIdentityProtectionService,
    payments: SportsPaymentService,
    auditLog: AuditLogService,
    s3: S3Service,
  ) {
    super(prisma, identities, payments, auditLog, s3);
  }

  async submit(
    teamId: string,
    submittedByPersonId: string,
    input: SubmitSportsTeamChangeInput,
    allowTrustedLogo = false,
  ) {
    const delta = this.normalizeDelta(input.delta, allowTrustedLogo, input.type);
    const protectedIdentities = (input.identities ?? []).map((identity) => ({
      clientKey: this.normalizeClientKey(identity.clientKey),
      type: identity.type,
      ...this.identities.protect(identity.type, identity.value),
    }));
    if (input.type === SportsTeamChangeRequestType.MEMBER_ADD && protectedIdentities.length === 0) {
      throw new BadRequestException('Informe ao menos uma pessoa para adicionar à equipe.');
    }

    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const team = await tx.sportsTeam.findFirst({
        where: { id: teamId, deletedAt: null },
        select: {
          id: true,
          name: true,
          revision: true,
          fieldRevisions: true,
          tournament: {
            select: {
              status: true,
              finishedAt: true,
              deletedAt: true,
              majorEventId: true,
            },
          },
        },
      });
      if (!team || team.tournament.deletedAt) {
        throw new NotFoundException(`Sports team ${teamId} was not found.`);
      }
      if (
        ([SportsTournamentStatus.FINISHED, SportsTournamentStatus.CANCELED] as SportsTournamentStatus[]).includes(
          team.tournament.status,
        ) ||
        team.tournament.finishedAt
      ) {
        throw new ConflictException(
          'Equipes de um torneio finalizado não podem mais ser alteradas por representantes.',
        );
      }
      if (team.revision !== input.baseRevision) {
        throw new ConflictException('A equipe foi alterada. Recarregue os dados antes de enviar sua solicitação.');
      }

      const pendingKey = `${teamId}:${submittedByPersonId}:${input.type}`;
      const existing = await tx.sportsTeamChangeRequest.findUnique({
        where: { pendingKey },
      });
      let request;
      if (existing) {
        if (input.expectedRequestRevision === undefined || existing.requestRevision !== input.expectedRequestRevision) {
          throw new ConflictException('A solicitação em análise mudou. Recarregue-a antes de editar.');
        }
        const updated = await tx.sportsTeamChangeRequest.updateMany({
          where: {
            id: existing.id,
            requestRevision: input.expectedRequestRevision,
            status: {
              in: [
                SportsTeamChangeRequestStatus.PENDING,
                SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
                SportsTeamChangeRequestStatus.CONFLICT,
              ],
            },
          },
          data: {
            delta: this.toJson(this.mergeDelta(existing.delta, delta)),
            status: SportsTeamChangeRequestStatus.PENDING,
            reviewMessage: null,
            requestRevision: { increment: 1 },
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('A solicitação em análise mudou. Recarregue-a antes de editar.');
        }
        request = await tx.sportsTeamChangeRequest.findUniqueOrThrow({ where: { id: existing.id } });
      } else {
        request = await tx.sportsTeamChangeRequest.create({
          data: {
            teamId,
            submittedByPersonId,
            type: input.type,
            baseRevision: team.revision,
            baseFieldRevisions: this.toJson(team.fieldRevisions),
            delta: this.toJson(delta),
            pendingKey,
          },
        });
      }

      for (const identity of protectedIdentities) {
        await tx.sportsIdentityClaim.upsert({
          where: {
            requestId_clientKey: {
              requestId: request.id,
              clientKey: identity.clientKey,
            },
          },
          create: {
            requestId: request.id,
            ...identity,
          },
          update: {
            type: identity.type,
            encryptedValue: identity.encryptedValue,
            lookupHash: identity.lookupHash,
            displayHint: identity.displayHint,
            status: SportsIdentityClaimStatus.PENDING,
            resolvedPersonId: null,
            resolvedAt: null,
            resolvedById: null,
          },
        });
      }

      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM_CHANGE_REQUEST,
          entityId: request.id,
          entityLabel: team.name,
          operation: AuditLogOperation.SUBMIT,
          actor: {
            id: submittedByPersonId,
            name: 'Representante da equipe',
            type: AuditLogActorType.USER,
          },
          after: {
            type: request.type,
            status: SportsTeamChangeRequestStatus.PENDING,
            baseRevision: request.baseRevision,
            identityClaimCount: protectedIdentities.length,
          },
          summary: 'Alteração de equipe enviada para análise.',
          scope: { majorEventId: team.tournament.majorEventId },
          force: true,
        },
        tx,
      );

      return this.getRepresentativeRequest(tx, request.id);
    });
  }

  async review(
    requestId: string,
    decision: SportsTeamChangeReviewDecision,
    actor: AuthenticatedUser,
    options: {
      expectedRequestRevision?: number;
      message?: string;
      resolvedDelta?: SportsTeamDeltaInput;
      forceConflicts?: boolean;
    } = {},
  ) {
    const actorId = actor.sub;
    if (!actorId) {
      throw new BadRequestException('O usuário administrador não possui identificador.');
    }
    const queuedLogo = await this.readQueuedLogo(requestId);
    let promotedLogo = false;
    if (decision === 'APPROVE' && queuedLogo) {
      promotedLogo = await this.promoteQueuedLogo(queuedLogo);
    }
    let outcome;
    try {
      outcome = await runSerializableSportsTransaction(this.prisma, async (tx) => {
        const request = await tx.sportsTeamChangeRequest.findUnique({
          where: { id: requestId },
          include: {
            identityClaims: true,
            team: {
              include: {
                tournament: {
                  include: {
                    majorEvent: {
                      select: {
                        id: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (
          !request ||
          !(
            [
              SportsTeamChangeRequestStatus.PENDING,
              SportsTeamChangeRequestStatus.CHANGES_REQUESTED,
              SportsTeamChangeRequestStatus.CONFLICT,
            ] as SportsTeamChangeRequestStatus[]
          ).includes(request.status)
        ) {
          throw new NotFoundException(`Pending sports team change request ${requestId} was not found.`);
        }
        if (
          options.expectedRequestRevision !== undefined &&
          request.requestRevision !== options.expectedRequestRevision
        ) {
          throw new ConflictException('A solicitação mudou. Recarregue os dados antes de analisá-la.');
        }

        if (
          decision === 'APPROVE' &&
          (request.team.tournament.deletedAt ||
            request.team.tournament.finishedAt ||
            ([SportsTournamentStatus.FINISHED, SportsTournamentStatus.CANCELED] as SportsTournamentStatus[]).includes(
              request.team.tournament.status,
            ))
        ) {
          throw new ConflictException(
            'Solicitações de equipes não podem ser aprovadas em um torneio finalizado ou cancelado.',
          );
        }

        if (decision !== 'APPROVE') {
          const status =
            decision === 'REJECT'
              ? SportsTeamChangeRequestStatus.REJECTED
              : SportsTeamChangeRequestStatus.CHANGES_REQUESTED;
          const reviewed = await tx.sportsTeamChangeRequest.update({
            where: { id: request.id },
            data: {
              status,
              pendingKey: decision === 'REJECT' ? null : request.pendingKey,
              reviewedAt: new Date(),
              reviewedById: actorId,
              reviewMessage: options.message?.trim() || null,
            },
          });
          await this.recordReviewAudit(tx, request, actor, status);
          return { kind: 'SUCCESS' as const, value: reviewed };
        }

        const delta = this.normalizeDelta(
          options.resolvedDelta ?? this.readDelta(request.delta),
          request.type === SportsTeamChangeRequestType.LOGO,
          request.type,
        );
        const conflictingFields = this.findConflictingFields(
          request.baseFieldRevisions,
          request.team.fieldRevisions,
          delta,
        );
        if (conflictingFields.length > 0 && !options.forceConflicts) {
          const conflicted = await tx.sportsTeamChangeRequest.update({
            where: { id: request.id },
            data: {
              status: SportsTeamChangeRequestStatus.CONFLICT,
              reviewMessage: `Conflito nos campos: ${conflictingFields.join(', ')}.`,
            },
          });
          await this.recordReviewAudit(tx, request, actor, SportsTeamChangeRequestStatus.CONFLICT);
          return {
            kind: 'CONFLICT' as const,
            conflictingFields,
            request: conflicted,
          };
        }

        const resultingRevision = request.team.revision + 1;
        const teamFields = this.buildTeamUpdate(delta);
        const updated = await tx.sportsTeam.updateMany({
          where: {
            id: request.teamId,
            revision: request.team.revision,
            deletedAt: null,
          },
          data: {
            ...teamFields,
            revision: { increment: 1 },
            fieldRevisions: this.toJson(this.bumpFieldRevisions(request.team.fieldRevisions, delta, resultingRevision)),
            updatedById: actorId,
          },
        });
        if (updated.count !== 1) {
          throw new ConflictException('A equipe mudou durante a aprovação. Tente novamente.');
        }

        if (request.type === SportsTeamChangeRequestType.MEMBER_ADD) {
          await this.resolveAndAddMembers(tx, request, delta.categoryIds ?? [], actorId);
        } else if (
          request.type === SportsTeamChangeRequestType.MEMBER_UPDATE ||
          request.type === SportsTeamChangeRequestType.MEMBER_REMOVE
        ) {
          await this.applyMemberChanges(tx, request.teamId, request.type, delta.memberChanges ?? [], actorId);
        } else if (request.type === SportsTeamChangeRequestType.CATEGORY_ROLE) {
          await this.applyCategoryRoleChanges(tx, request, delta.categoryRoleChanges ?? [], actorId);
        }

        const approved = await tx.sportsTeamChangeRequest.update({
          where: { id: request.id },
          data: {
            status: SportsTeamChangeRequestStatus.APPROVED,
            pendingKey: null,
            reviewedAt: new Date(),
            reviewedById: actorId,
            reviewMessage: options.message?.trim() || null,
            resolvedDelta: this.toJson(delta),
            resultingRevision,
          },
        });
        await this.recordReviewAudit(tx, request, actor, SportsTeamChangeRequestStatus.APPROVED);
        return { kind: 'SUCCESS' as const, value: approved };
      });
    } catch (error: unknown) {
      if (promotedLogo && queuedLogo) {
        await this.s3.deleteFile(queuedLogo.objectKey).catch((cleanupError: unknown) => {
          this.logger.warn(
            `Could not clean up uncommitted approved sports team logo ${queuedLogo.objectKey}: ${
              cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
            }`,
          );
        });
      }
      throw error;
    }
    if (outcome.kind === 'CONFLICT') {
      throw new ConflictException({
        message: 'A equipe mudou desde o envio da solicitação.',
        conflictingFields: outcome.conflictingFields,
        request: outcome.request,
      });
    }
    if (queuedLogo && (decision === 'APPROVE' || decision === 'REJECT')) {
      try {
        await this.s3.deleteFile(queuedLogo.queuedObjectKey);
      } catch (error) {
        this.logger.warn(
          `Could not delete reviewed sports team logo ${queuedLogo.queuedObjectKey}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return outcome.value;
  }
}
