import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  
  Prisma,
  SportsCategoryStatus,
  SportsEligibilityStatus,
  SportsIdentityType,
  SportsParticipantStatus,
  SportsPaymentStatus,
  SportsRegistrationStatus,
  SportsRosterRole,
  SportsTeamChangeRequestType,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../../common/brazilian-phone';

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
import { SportsTeamChangeDeltaService } from './sports-team-change-delta.service';

export abstract class SportsTeamChangeRoleService extends SportsTeamChangeDeltaService {
  protected async applyCategoryRoleChanges(
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

  protected assertCategoryRoleChanges(
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

  protected assertRoleCount(
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

  protected resolveCategoryRoleEligibility(
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

  protected isParticipantEffective(participant: {
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

  protected participantIneligibility(
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

  protected async resolvePeople(
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
}

