import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  Prisma,
  SportsRegistrationStatus,
  SportsRosterRole,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsPaymentService } from '../sports-payment.service';
import { SportsAdminSupport } from './sports-admin-support';

export abstract class SportsAdminLookupService extends SportsAdminSupport {
  public constructor(
    protected readonly prisma: PrismaService,
    protected readonly frozen: FrozenResourceService,
    protected readonly auditLog: AuditLogService,
    protected readonly payments: SportsPaymentService,
  ) {
    super();
  }

  protected async findRegistration(
    tx: Prisma.TransactionClient,
    registrationId: string | null | undefined,
    categoryId: string,
  ) {
    if (!registrationId) {
      return null;
    }
    const registration = await tx.sportsRegistration.findFirst({
      where: {
        id: registrationId,
        categoryId,
        deletedAt: null,
        status: {
          in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
        },
      },
      include: {
        team: {
          select: { name: true },
        },
      },
    });
    if (!registration) {
      throw new BadRequestException('A equipe selecionada não está aprovada nesta modalidade.');
    }
    return registration;
  }

  protected async findVenue(
    tx: Prisma.TransactionClient,
    venueId: string | null | undefined,
    tournamentId: string,
  ) {
    if (!venueId) {
      return null;
    }
    const venue = await tx.sportsVenue.findFirst({
      where: {
        id: venueId,
        tournamentId,
        deletedAt: null,
      },
      include: { placePreset: true },
    });
    if (!venue) {
      throw new BadRequestException('O local selecionado não pertence ao torneio.');
    }
    return venue;
  }

  protected async findStage(
    tx: Prisma.TransactionClient,
    stageId: string | null | undefined,
    categoryId: string,
  ) {
    if (!stageId) {
      return null;
    }
    const stage = await tx.sportsStage.findFirst({
      where: { id: stageId, categoryId, deletedAt: null },
    });
    if (!stage) {
      throw new BadRequestException('A etapa selecionada não pertence à modalidade.');
    }
    return stage;
  }

  protected async assertRoleLimit(
    tx: Prisma.TransactionClient,
    category: {
      id: string;
      maximumCaptains: number | null;
      maximumCoaches: number | null;
    },
    registrationId: string,
    role: SportsRosterRole,
  ): Promise<void> {
    const limit =
      role === SportsRosterRole.CAPTAIN
        ? category.maximumCaptains
        : role === SportsRosterRole.COACH
          ? category.maximumCoaches
          : null;
    if (limit === null) {
      return;
    }
    const count = await tx.sportsRegistrationMember.count({
      where: {
        registrationId,
        role,
        deletedAt: null,
      },
    });
    if (count >= limit) {
      throw new ConflictException(
        role === SportsRosterRole.CAPTAIN
          ? 'A equipe atingiu o limite de capitães.'
          : 'A equipe atingiu o limite de técnicos.',
      );
    }
  }

  protected async hasCrossTeamParticipants(tx: Prisma.TransactionClient, tournamentId: string): Promise<boolean> {
    const participants = await tx.sportsTournamentParticipant.findMany({
      where: {
        tournamentId,
        deletedAt: null,
        teamMemberships: {
          some: {
            deletedAt: null,
            team: {
              deletedAt: null,
            },
          },
        },
      },
      select: {
        teamMemberships: {
          where: {
            deletedAt: null,
            team: {
              deletedAt: null,
            },
          },
          select: {
            teamId: true,
          },
        },
      },
    });
    return participants.some(
      (participant) => new Set(participant.teamMemberships.map((membership) => membership.teamId)).size > 1,
    );
  }

}

