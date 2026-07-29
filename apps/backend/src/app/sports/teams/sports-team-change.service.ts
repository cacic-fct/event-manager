import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogActorType,
  AuditLogOperation,
  Prisma,
  SportsCategoryStatus,
  SportsEligibilityStatus,
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsMatchState,
  SportsParticipantSource,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsTeamChangeRequestStatus,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { getBrazilianPhoneCandidates } from '../../common/brazilian-phone';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsPaymentService } from '../sports-payment.service';
import { runSerializableSportsTransaction } from '../sports-transaction';
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

@Injectable()
export class SportsTeamChangeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identities: SportsIdentityProtectionService,
    private readonly payments: SportsPaymentService,
    private readonly auditLog: AuditLogService,
  ) {}

  async submit(
    teamId: string,
    submittedByPersonId: string,
    input: SubmitSportsTeamChangeInput,
    allowTrustedLogo = false,
  ) {
    const delta = this.normalizeDelta(
      input.delta,
      allowTrustedLogo,
      input.type,
    );
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
        (
          [
            SportsTournamentStatus.FINISHED,
            SportsTournamentStatus.CANCELED,
          ] as SportsTournamentStatus[]
        ).includes(team.tournament.status) ||
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
        if (
          input.expectedRequestRevision === undefined ||
          existing.requestRevision !== input.expectedRequestRevision
        ) {
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
    const outcome = await runSerializableSportsTransaction(this.prisma, async (tx) => {
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
        throw new ConflictException(
          'A solicitação mudou. Recarregue os dados antes de analisá-la.',
        );
      }

      if (
        decision === 'APPROVE' &&
        (
          request.team.tournament.deletedAt ||
          request.team.tournament.finishedAt ||
          (
            [
              SportsTournamentStatus.FINISHED,
              SportsTournamentStatus.CANCELED,
            ] as SportsTournamentStatus[]
          ).includes(request.team.tournament.status)
        )
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
        await this.recordReviewAudit(
          tx,
          request,
          actor,
          SportsTeamChangeRequestStatus.CONFLICT,
        );
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
          fieldRevisions: this.toJson(
            this.bumpFieldRevisions(request.team.fieldRevisions, delta, resultingRevision),
          ),
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
        await this.applyMemberChanges(
          tx,
          request.teamId,
          request.type,
          delta.memberChanges ?? [],
          actorId,
        );
      } else if (request.type === SportsTeamChangeRequestType.CATEGORY_ROLE) {
        await this.applyCategoryRoleChanges(
          tx,
          request,
          delta.categoryRoleChanges ?? [],
          actorId,
        );
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
    if (outcome.kind === 'CONFLICT') {
      throw new ConflictException({
        message: 'A equipe mudou desde o envio da solicitação.',
        conflictingFields: outcome.conflictingFields,
        request: outcome.request,
      });
    }
    return outcome.value;
  }

  private async resolveAndAddMembers(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      teamId: string;
      team: {
        tournamentId: string;
      };
      identityClaims: Array<{
        id: string;
        type: SportsIdentityType;
        encryptedValue: string;
      }>;
    },
    categoryIds: string[],
    actorId: string,
  ): Promise<void> {
    const tournament = await tx.sportsTournament.findFirst({
      where: {
        id: request.team.tournamentId,
        deletedAt: null,
      },
      select: {
        id: true,
        allowPlayerMultipleTeams: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException(
        `Sports tournament ${request.team.tournamentId} was not found.`,
      );
    }
    const categories =
      categoryIds.length === 0
        ? []
        : await tx.sportsCategory.findMany({
            where: {
              id: { in: categoryIds },
              tournamentId: request.team.tournamentId,
              deletedAt: null,
            },
            select: {
              id: true,
              allowPlayerMultipleTeams: true,
            },
          });
    if (categories.length !== new Set(categoryIds).size) {
      throw new BadRequestException('Uma ou mais modalidades não pertencem ao torneio da equipe.');
    }

    for (const claim of request.identityClaims) {
      const rawValue = this.identities.reveal(claim.type, claim.encryptedValue);
      const people = await this.resolvePeople(tx, claim.type, rawValue);
      if (people.length !== 1) {
        await tx.sportsIdentityClaim.update({
          where: { id: claim.id },
          data: {
            status:
              people.length === 0
                ? SportsIdentityClaimStatus.NOT_FOUND
                : SportsIdentityClaimStatus.AMBIGUOUS,
            resolvedAt: new Date(),
            resolvedById: actorId,
          },
        });
        continue;
      }

      const person = people[0];
      await this.assertPlayerMayJoinTeam(
        tx,
        request.teamId,
        tournament,
        categories,
        person.id,
      );
      const participant = await this.payments.ensureParticipant(tx, {
        tournamentId: request.team.tournamentId,
        personId: person.id,
        source: SportsParticipantSource.TEAM_ASSIGNMENT,
        actorId,
        approved: true,
      });
      let member = await tx.sportsTeamMember.findFirst({
        where: {
          teamId: request.teamId,
          participantId: participant.id,
          deletedAt: null,
        },
      });
      if (member && member.status !== SportsTeamMemberStatus.APPROVED) {
        const reactivated = await tx.sportsTeamMember.updateMany({
          where: {
            id: member.id,
            revision: member.revision,
            deletedAt: null,
          },
          data: {
            status: SportsTeamMemberStatus.APPROVED,
            revision: { increment: 1 },
            approvedAt: member.approvedAt ?? new Date(),
            approvedById: member.approvedById ?? actorId,
            rejectedAt: null,
            rejectedById: null,
            rejectionReason: null,
            updatedById: actorId,
          },
        });
        if (reactivated.count !== 1) {
          throw new ConflictException(
            'O integrante mudou durante a aprovação. Tente novamente.',
          );
        }
        member = await tx.sportsTeamMember.findUniqueOrThrow({
          where: { id: member.id },
        });
      }
      member ??= await tx.sportsTeamMember.create({
        data: {
          teamId: request.teamId,
          participantId: participant.id,
          status: SportsTeamMemberStatus.APPROVED,
          approvedAt: new Date(),
          approvedById: actorId,
          createdById: actorId,
          updatedById: actorId,
        },
      });

      for (const category of categories) {
        const registration = await tx.sportsRegistration.findFirst({
          where: {
            teamId: request.teamId,
            categoryId: category.id,
            deletedAt: null,
          },
        });
        if (!registration) {
          continue;
        }
        const existingAssignment = await tx.sportsRegistrationMember.findFirst({
          where: {
            registrationId: registration.id,
            teamMemberId: member.id,
            role: SportsRosterRole.PLAYER,
            deletedAt: null,
          },
        });
        if (!existingAssignment) {
          await tx.sportsRegistrationMember.create({
            data: {
              registrationId: registration.id,
              categoryId: category.id,
              teamMemberId: member.id,
              role: SportsRosterRole.PLAYER,
              eligibility: this.resolveCategoryRoleEligibility(
                participant,
                null,
              ),
              approvedAt: new Date(),
              approvedById: actorId,
              createdById: actorId,
              updatedById: actorId,
            },
          });
        }
      }

      await tx.sportsIdentityClaim.update({
        where: { id: claim.id },
        data: {
          status: SportsIdentityClaimStatus.RESOLVED,
          resolvedPersonId: person.id,
          resolvedAt: new Date(),
          resolvedById: actorId,
        },
      });
    }
  }

  private async assertPlayerMayJoinTeam(
    tx: Prisma.TransactionClient,
    teamId: string,
    tournament: {
      id: string;
      allowPlayerMultipleTeams: boolean;
    },
    categories: Array<{
      id: string;
      allowPlayerMultipleTeams: boolean | null;
    }>,
    personId: string,
  ): Promise<void> {
    if (!tournament.allowPlayerMultipleTeams) {
      const otherMembership = await tx.sportsTeamMember.findFirst({
        where: {
          teamId: { not: teamId },
          deletedAt: null,
          status: SportsTeamMemberStatus.APPROVED,
          team: {
            tournamentId: tournament.id,
            deletedAt: null,
          },
          participant: {
            personId,
            deletedAt: null,
          },
        },
        select: { id: true },
      });
      if (otherMembership) {
        throw new ConflictException(
          'A pessoa já integra outra equipe neste torneio.',
        );
      }
      return;
    }

    const restrictedCategoryIds = categories
      .filter(
        (category) => category.allowPlayerMultipleTeams === false,
      )
      .map((category) => category.id);
    if (restrictedCategoryIds.length === 0) {
      return;
    }
    const otherAssignment = await tx.sportsRegistrationMember.findFirst({
      where: {
        categoryId: { in: restrictedCategoryIds },
        deletedAt: null,
        teamMember: {
          teamId: { not: teamId },
          deletedAt: null,
          status: SportsTeamMemberStatus.APPROVED,
          team: {
            tournamentId: tournament.id,
            deletedAt: null,
          },
          participant: {
            personId,
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });
    if (otherAssignment) {
      throw new ConflictException(
        'A pessoa já integra outra equipe em uma modalidade que não permite múltiplas equipes.',
      );
    }
  }

  private async applyMemberChanges(
    tx: Prisma.TransactionClient,
    teamId: string,
    requestType:
      | typeof SportsTeamChangeRequestType.MEMBER_UPDATE
      | typeof SportsTeamChangeRequestType.MEMBER_REMOVE,
    changes: SportsTeamMemberDeltaInput[],
    actorId: string,
  ): Promise<void> {
    for (const change of changes) {
      const member = await tx.sportsTeamMember.findFirst({
        where: {
          id: change.teamMemberId,
          teamId,
          deletedAt: null,
        },
        include: {
          participant: {
            select: {
              status: true,
              paymentStatus: true,
            },
          },
        },
      });
      if (!member) {
        throw new NotFoundException(
          `Sports team member ${change.teamMemberId} was not found.`,
        );
      }

      const removing =
        requestType === SportsTeamChangeRequestType.MEMBER_REMOVE;
      const deletedAt = removing ? new Date() : null;
      const status = removing
        ? SportsTeamMemberStatus.WITHDRAWN
        : change.status;
      const updated = await tx.sportsTeamMember.updateMany({
        where: {
          id: member.id,
          teamId,
          revision: change.expectedRevision,
          deletedAt: null,
        },
        data: {
          status,
          ...(removing ? { deletedAt } : {}),
          ...(status === SportsTeamMemberStatus.APPROVED
            ? {
                approvedAt: member.approvedAt ?? new Date(),
                approvedById: member.approvedById ?? actorId,
                rejectedAt: null,
                rejectedById: null,
                rejectionReason: null,
              }
            : {}),
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (updated.count !== 1) {
        throw new ConflictException(
          'O integrante da equipe mudou. Recarregue os dados antes de aprovar.',
        );
      }

      if (removing) {
        await tx.sportsRegistrationMember.updateMany({
          where: {
            teamMemberId: member.id,
            deletedAt: null,
          },
          data: {
            eligibility: SportsEligibilityStatus.INELIGIBLE,
            rejectionReason: 'Integrante removido da equipe.',
            deletedAt,
            updatedById: actorId,
          },
        });
        await tx.sportsMatchRosterEntry.updateMany({
          where: {
            deletedAt: null,
            registrationMember: {
              teamMemberId: member.id,
            },
            roster: {
              match: {
                state: {
                  in: [
                    SportsMatchState.SCHEDULED,
                    SportsMatchState.CHECK_IN,
                  ],
                },
              },
            },
          },
          data: {
            deletedAt,
            updatedById: actorId,
          },
        });
        continue;
      }

      if (
        status === SportsTeamMemberStatus.SUSPENDED ||
        status === SportsTeamMemberStatus.WITHDRAWN
      ) {
        await tx.sportsRegistrationMember.updateMany({
          where: {
            teamMemberId: member.id,
            deletedAt: null,
          },
          data: {
            eligibility: SportsEligibilityStatus.INELIGIBLE,
            rejectionReason:
              status === SportsTeamMemberStatus.SUSPENDED
                ? 'Integrante suspenso.'
                : 'Integrante retirado da equipe.',
            updatedById: actorId,
          },
        });
        continue;
      }

      await this.refreshMemberEligibility(
        tx,
        member.id,
        member.participant,
        actorId,
      );
    }
  }

  private async refreshMemberEligibility(
    tx: Prisma.TransactionClient,
    teamMemberId: string,
    participant: {
      status: SportsParticipantStatus;
      paymentStatus: SportsPaymentStatus;
    },
    actorId: string,
  ): Promise<void> {
    const effective = this.isParticipantEffective(participant);
    const targetEligibility = effective
      ? SportsEligibilityStatus.ELIGIBLE
      : this.participantIneligibility(participant.status);
    await tx.sportsRegistrationMember.updateMany({
      where: {
        teamMemberId,
        deletedAt: null,
        eligibility:
          targetEligibility === SportsEligibilityStatus.INELIGIBLE
            ? {
                in: [
                  SportsEligibilityStatus.PENDING,
                  SportsEligibilityStatus.ELIGIBLE,
                ],
              }
            : effective
              ? SportsEligibilityStatus.PENDING
              : SportsEligibilityStatus.ELIGIBLE,
      },
      data: {
        eligibility: targetEligibility,
        updatedById: actorId,
      },
    });
  }

  private async applyCategoryRoleChanges(
    tx: Prisma.TransactionClient,
    request: {
      teamId: string;
      team: {
        tournamentId: string;
      };
    },
    changes: SportsCategoryRoleDeltaInput[],
    actorId: string,
  ): Promise<void> {
    const changesByRegistration = new Map<
      string,
      SportsCategoryRoleDeltaInput[]
    >();
    for (const change of changes) {
      const group = changesByRegistration.get(change.registrationId) ?? [];
      group.push(change);
      changesByRegistration.set(change.registrationId, group);
    }

    for (const [registrationId, registrationChanges] of changesByRegistration) {
      const expectedRevision = registrationChanges[0].expectedRegistrationRevision;
      if (
        registrationChanges.some(
          (change) => change.expectedRegistrationRevision !== expectedRevision,
        )
      ) {
        throw new BadRequestException(
          'As alterações de uma mesma modalidade devem usar a mesma revisão da inscrição.',
        );
      }
      const registration = await tx.sportsRegistration.findFirst({
        where: {
          id: registrationId,
          teamId: request.teamId,
          deletedAt: null,
        },
        include: {
          category: {
            select: {
              id: true,
              tournamentId: true,
              status: true,
              finishedAt: true,
              maximumCaptains: true,
              maximumCoaches: true,
            },
          },
        },
      });
      if (
        !registration ||
        registration.category.tournamentId !== request.team.tournamentId
      ) {
        throw new NotFoundException(
          `Sports registration ${registrationId} was not found for this team.`,
        );
      }
      if (
        !(
          [
            SportsRegistrationStatus.APPROVED,
            SportsRegistrationStatus.ACTIVE,
          ] as SportsRegistrationStatus[]
        ).includes(registration.status)
      ) {
        throw new ConflictException(
          'A inscrição da equipe não está ativa nesta modalidade.',
        );
      }
      if (
        (
          [
            SportsCategoryStatus.FINISHED,
            SportsCategoryStatus.CANCELED,
          ] as SportsCategoryStatus[]
        ).includes(registration.category.status) ||
        registration.category.finishedAt
      ) {
        throw new ConflictException(
          'Uma modalidade finalizada não pode ser alterada por representantes.',
        );
      }

      const memberIds = [
        ...new Set(registrationChanges.map((change) => change.teamMemberId)),
      ];
      const members = await tx.sportsTeamMember.findMany({
        where: {
          id: { in: memberIds },
          teamId: request.teamId,
          deletedAt: null,
          status: SportsTeamMemberStatus.APPROVED,
        },
        select: {
          id: true,
          participant: {
            select: {
              status: true,
              paymentStatus: true,
            },
          },
        },
      });
      if (members.length !== memberIds.length) {
        throw new NotFoundException(
          'Um ou mais integrantes não pertencem à equipe ou não estão aprovados.',
        );
      }
      const memberById = new Map(members.map((member) => [member.id, member]));
      const assignments = await tx.sportsRegistrationMember.findMany({
        where: {
          registrationId,
          deletedAt: null,
        },
        select: {
          id: true,
          teamMemberId: true,
          role: true,
          eligibility: true,
          teamMember: {
            select: {
              status: true,
              deletedAt: true,
            },
          },
        },
      });
      this.assertCategoryRoleChanges(
        registrationChanges,
        assignments,
        registration.category,
      );

      const registrationUpdated = await tx.sportsRegistration.updateMany({
        where: {
          id: registration.id,
          teamId: request.teamId,
          revision: expectedRevision,
          deletedAt: null,
        },
        data: {
          revision: { increment: 1 },
          updatedById: actorId,
        },
      });
      if (registrationUpdated.count !== 1) {
        throw new ConflictException(
          'A inscrição mudou. Recarregue os dados antes de aprovar as funções.',
        );
      }

      for (const change of registrationChanges) {
        const member = memberById.get(change.teamMemberId);
        if (!member) {
          throw new NotFoundException(
            `Sports team member ${change.teamMemberId} was not found.`,
          );
        }
        const eligibility = this.resolveCategoryRoleEligibility(
          member.participant,
          change.expectedEligibility ?? null,
        );
        if (change.registrationMemberId) {
          const changed = await tx.sportsRegistrationMember.updateMany({
            where: {
              id: change.registrationMemberId,
              registrationId: registration.id,
              categoryId: registration.category.id,
              teamMemberId: change.teamMemberId,
              role: change.expectedRole ?? undefined,
              eligibility: change.expectedEligibility ?? undefined,
              deletedAt: null,
            },
            data: {
              role: change.role,
              eligibility,
              approvedAt: new Date(),
              approvedById: actorId,
              rejectionReason: null,
              updatedById: actorId,
            },
          });
          if (changed.count !== 1) {
            throw new ConflictException(
              'A função do integrante mudou. Recarregue os dados antes de aprovar.',
            );
          }
        } else {
          await tx.sportsRegistrationMember.create({
            data: {
              registrationId: registration.id,
              categoryId: registration.category.id,
              teamMemberId: change.teamMemberId,
              role: change.role,
              eligibility,
              approvedAt: new Date(),
              approvedById: actorId,
              createdById: actorId,
              updatedById: actorId,
            },
          });
        }
      }
    }
  }

  private assertCategoryRoleChanges(
    changes: SportsCategoryRoleDeltaInput[],
    assignments: Array<{
      id: string;
      teamMemberId: string;
      role: SportsRosterRole;
      eligibility: SportsEligibilityStatus;
      teamMember: {
        status: SportsTeamMemberStatus;
        deletedAt: Date | null;
      };
    }>,
    category: {
      maximumCaptains: number | null;
      maximumCoaches: number | null;
    },
  ): void {
    const projected = assignments.map((assignment) => ({ ...assignment }));
    for (const change of changes) {
      if (change.registrationMemberId) {
        const assignment = projected.find(
          (candidate) =>
            candidate.id === change.registrationMemberId &&
            candidate.teamMemberId === change.teamMemberId &&
            candidate.role === change.expectedRole &&
            candidate.eligibility === change.expectedEligibility,
        );
        if (!assignment) {
          throw new ConflictException(
            'A função do integrante mudou. Recarregue os dados antes de aprovar.',
          );
        }
        assignment.role = change.role;
      } else {
        if (
          projected.some(
            (assignment) =>
              assignment.teamMemberId === change.teamMemberId &&
              assignment.role === change.role,
          )
        ) {
          throw new ConflictException(
            'Esta função já foi atribuída ao integrante.',
          );
        }
        projected.push({
          id: `pending:${change.teamMemberId}:${change.role}`,
          teamMemberId: change.teamMemberId,
          role: change.role,
          eligibility: SportsEligibilityStatus.PENDING,
          teamMember: {
            status: SportsTeamMemberStatus.APPROVED,
            deletedAt: null,
          },
        });
      }
    }
    const active = projected.filter(
      (assignment) =>
        assignment.teamMember.status === SportsTeamMemberStatus.APPROVED &&
        !assignment.teamMember.deletedAt,
    );
    this.assertRoleCount(
      active,
      SportsRosterRole.CAPTAIN,
      category.maximumCaptains,
      'A equipe atingiu o limite de capitães.',
    );
    this.assertRoleCount(
      active,
      SportsRosterRole.COACH,
      category.maximumCoaches,
      'A equipe atingiu o limite de técnicos.',
    );
  }

  private assertRoleCount(
    assignments: Array<{ role: SportsRosterRole }>,
    role: SportsRosterRole,
    limit: number | null,
    message: string,
  ): void {
    if (
      limit !== null &&
      assignments.filter((assignment) => assignment.role === role).length >
        limit
    ) {
      throw new ConflictException(message);
    }
  }

  private resolveCategoryRoleEligibility(
    participant: {
      status: SportsParticipantStatus;
      paymentStatus: SportsPaymentStatus;
    },
    currentEligibility: SportsEligibilityStatus | null,
  ): SportsEligibilityStatus {
    if (this.isParticipantEffective(participant)) {
      return currentEligibility === SportsEligibilityStatus.INELIGIBLE ||
        currentEligibility === SportsEligibilityStatus.CHANGES_REQUESTED
        ? currentEligibility
        : SportsEligibilityStatus.ELIGIBLE;
    }
    return this.participantIneligibility(participant.status);
  }

  private isParticipantEffective(participant: {
    status: SportsParticipantStatus;
    paymentStatus: SportsPaymentStatus;
  }): boolean {
    return (
      participant.status === SportsParticipantStatus.ACTIVE &&
      (
        [
          SportsPaymentStatus.PAID,
          SportsPaymentStatus.NOT_REQUIRED,
        ] as SportsPaymentStatus[]
      ).includes(participant.paymentStatus)
    );
  }

  private participantIneligibility(
    status: SportsParticipantStatus,
  ): SportsEligibilityStatus {
    return (
      [
        SportsParticipantStatus.REJECTED,
        SportsParticipantStatus.SUSPENDED,
        SportsParticipantStatus.WITHDRAWN,
      ] as SportsParticipantStatus[]
    ).includes(status)
      ? SportsEligibilityStatus.INELIGIBLE
      : SportsEligibilityStatus.PENDING;
  }

  private async resolvePeople(
    tx: Prisma.TransactionClient,
    type: SportsIdentityType,
    normalizedValue: string,
  ): Promise<Array<{ id: string }>> {
    if (type === SportsIdentityType.EMAIL) {
      return tx.people.findMany({
        where: {
          deletedAt: null,
          OR: [
            { email: { equals: normalizedValue, mode: 'insensitive' } },
            { secondaryEmails: { has: normalizedValue.toLocaleLowerCase('pt-BR') } },
          ],
        },
        select: { id: true },
        take: 2,
      });
    }

    if (type === SportsIdentityType.PHONE) {
      return tx.people.findMany({
        where: {
          deletedAt: null,
          phone: { in: getBrazilianPhoneCandidates(normalizedValue) },
        },
        select: { id: true },
        take: 2,
      });
    }

    const values = new Set([normalizedValue]);
    if (/^\d{11}$/.test(normalizedValue)) {
      values.add(
        `${normalizedValue.slice(0, 3)}.${normalizedValue.slice(3, 6)}.${normalizedValue.slice(6, 9)}-${normalizedValue.slice(9)}`,
      );
    }
    return tx.people.findMany({
      where: {
        deletedAt: null,
        identityDocument: { in: [...values] },
      },
      select: { id: true },
      take: 2,
    });
  }

  private normalizeDelta(
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
        /^sports\/tournaments\/[^/]+\/teams\/[^/]+\/logos\/sha256\/([a-f0-9]{64})\.(png|jpg|webp)$/.exec(
          logo.objectKey,
        );
      const expectedExtensionByMimeType: Readonly<Record<string, string>> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      };
      if (
        !objectKeyMatch ||
        !/^[a-f0-9]{64}$/.test(logo.sha256) ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(logo.mimeType) ||
        objectKeyMatch?.[1] !== logo.sha256 ||
        objectKeyMatch?.[2] !== expectedExtensionByMimeType[logo.mimeType] ||
        !Number.isInteger(logo.sizeBytes) ||
        logo.sizeBytes <= 0 ||
        logo.sizeBytes > 2 * 1024 * 1024
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

  private mergeDelta(current: Prisma.JsonValue, incoming: SportsTeamDeltaInput): SportsTeamDeltaInput {
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
          : this.mergeByKey(
              parsed.memberChanges ?? [],
              incoming.memberChanges,
              (change) => change.teamMemberId,
            ),
      categoryRoleChanges:
        incoming.categoryRoleChanges === undefined
          ? parsed.categoryRoleChanges
          : this.mergeByKey(
              parsed.categoryRoleChanges ?? [],
              incoming.categoryRoleChanges,
              (change) =>
                change.registrationMemberId
                  ? `existing:${change.registrationMemberId}`
                  : `new:${change.registrationId}:${change.teamMemberId}`,
            ),
    };
  }

  private readDelta(value: Prisma.JsonValue): SportsTeamDeltaInput {
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
      objectValue['logo'] &&
      typeof objectValue['logo'] === 'object' &&
      !Array.isArray(objectValue['logo'])
        ? (objectValue['logo'] as SportsTeamDeltaInput['logo'])
        : undefined;
    const memberChanges = Array.isArray(objectValue['memberChanges'])
      ? (objectValue['memberChanges'] as SportsTeamMemberDeltaInput[])
      : undefined;
    const categoryRoleChanges = Array.isArray(
      objectValue['categoryRoleChanges'],
    )
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

  private findConflictingFields(
    baseValue: Prisma.JsonValue,
    currentValue: Prisma.JsonValue,
    delta: SportsTeamDeltaInput,
  ): SportsTeamEditableField[] {
    const base = this.readFieldRevisions(baseValue);
    const current = this.readFieldRevisions(currentValue);
    return TEAM_EDITABLE_FIELDS.filter(
      (field) =>
        (field === 'logo'
          ? delta.logo !== undefined
          : delta.set?.[field] !== undefined) &&
        (current[field] ?? 0) > (base[field] ?? 0),
    );
  }

  private bumpFieldRevisions(
    currentValue: Prisma.JsonValue,
    delta: SportsTeamDeltaInput,
    revision: number,
  ): Record<string, number> {
    const current = this.readFieldRevisions(currentValue);
    for (const field of TEAM_EDITABLE_FIELDS) {
      if (
        (field === 'logo' && delta.logo !== undefined) ||
        (field !== 'logo' && delta.set?.[field] !== undefined)
      ) {
        current[field] = revision;
      }
    }
    return current;
  }

  private readFieldRevisions(value: Prisma.JsonValue): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
        .map(([field, revision]) => [field, Math.trunc(revision)]),
    );
  }

  private buildTeamUpdate(delta: SportsTeamDeltaInput): Prisma.SportsTeamUpdateManyMutationInput {
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

  private assertDeltaMatchesType(
    requestType: SportsTeamChangeRequestType,
    delta: SportsTeamDeltaInput,
  ): void {
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
          throw new BadRequestException(
            'A solicitação de dados da equipe deve conter apenas nome ou instituição.',
          );
        }
        return;
      case SportsTeamChangeRequestType.MEMBER_ADD:
        if (!only('categoryIds')) {
          throw new BadRequestException(
            'A solicitação de novo integrante contém alterações incompatíveis.',
          );
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
          throw new BadRequestException(
            'Informe os integrantes, revisões e status que serão alterados.',
          );
        }
        return;
      case SportsTeamChangeRequestType.MEMBER_REMOVE:
        if (
          !hasMemberChanges ||
          delta.memberChanges?.length === 0 ||
          !only('memberChanges') ||
          delta.memberChanges?.some((change) => change.status !== undefined)
        ) {
          throw new BadRequestException(
            'Informe os integrantes e revisões que serão removidos.',
          );
        }
        return;
      case SportsTeamChangeRequestType.CATEGORY_ROLE:
        if (
          !hasCategoryRoleChanges ||
          delta.categoryRoleChanges?.length === 0 ||
          !only('categoryRoleChanges')
        ) {
          throw new BadRequestException(
            'Informe as funções esportivas que serão alteradas.',
          );
        }
        return;
      case SportsTeamChangeRequestType.LOGO:
        if (!hasLogo || !only('logo')) {
          throw new BadRequestException(
            'A solicitação de logo deve conter apenas o arquivo já validado.',
          );
        }
        return;
      default:
        throw new BadRequestException(
          'Este tipo de alteração não pode ser enviado por representantes.',
        );
    }
  }

  private mergeByKey<T>(
    current: T[],
    incoming: T[],
    key: (value: T) => string,
  ): T[] {
    const merged = new Map(current.map((value) => [key(value), value]));
    for (const value of incoming) {
      merged.set(key(value), value);
    }
    return [...merged.values()];
  }

  private normalizeChildId(value: string, label: string): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > 128) {
      throw new BadRequestException(`O identificador de ${label} é inválido.`);
    }
    return normalized;
  }

  private normalizeClientKey(clientKey: string): string {
    const normalized = clientKey.trim();
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(normalized)) {
      throw new BadRequestException('Identificador local da solicitação inválido.');
    }
    return normalized;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private async getRepresentativeRequest(tx: Prisma.TransactionClient, requestId: string) {
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

  private async recordReviewAudit(
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
