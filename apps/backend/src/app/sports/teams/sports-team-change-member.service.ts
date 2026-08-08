import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  
  Prisma,
  SportsEligibilityStatus,
  SportsIdentityClaimStatus,
  SportsIdentityType,
  SportsMatchState,
  SportsParticipantSource,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsRosterRole,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
} from '@prisma/client';

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
import { SportsTeamChangeRoleService } from './sports-team-change-role.service';

export abstract class SportsTeamChangeMemberService extends SportsTeamChangeRoleService {
  protected async resolveAndAddMembers(
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

  protected async assertPlayerMayJoinTeam(
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

  protected async applyMemberChanges(
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

  protected async refreshMemberEligibility(
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
}

