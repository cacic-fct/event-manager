import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  AuditLogEntityType,
  AuditLogOperation,
  SportsParticipantSource,
  SportsTeamMemberStatus,
  SportsTeamStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { FrozenResourceService } from '../../common/frozen-resource.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsPaymentService } from '../sports-payment.service';
import { runSerializableSportsTransaction } from '../sports-transaction';

export class SportsTeamDuplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: SportsPaymentService,
    private readonly auditLog: AuditLogService,
    private readonly frozen: FrozenResourceService,
  ) {}

  async cloneTeam(
    input: {
      sourceTeamId: string;
      destinationTournamentId: string;
      name?: string;
      includeLogo?: boolean;
      includeRepresentatives?: boolean;
      includeMembers?: boolean;
    },
    actor: AuthenticatedUser,
  ) {
    const actorId = this.requireActorId(actor);
    const destinationScope = await this.prisma.sportsTournament.findFirst({
      where: { id: input.destinationTournamentId, deletedAt: null },
      select: { majorEventId: true },
    });
    if (!destinationScope) {
      throw new NotFoundException(
        'Torneio esportivo de destino não encontrado.',
      );
    }
    await this.frozen.assertMajorEventMutable(
      destinationScope.majorEventId,
      actor,
      'edit',
    );
    return runSerializableSportsTransaction(this.prisma, async (tx) => {
      const [source, destination] = await Promise.all([
        tx.sportsTeam.findFirst({
          where: { id: input.sourceTeamId, deletedAt: null },
          include: {
            representatives: { where: { active: true, revokedAt: null } },
            members: {
              where: {
                deletedAt: null,
                status: SportsTeamMemberStatus.APPROVED,
              },
              include: { participant: true },
            },
          },
        }),
        tx.sportsTournament.findFirst({
          where: { id: input.destinationTournamentId, deletedAt: null },
        }),
      ]);
      if (!source || !destination) {
        throw new NotFoundException('Equipe de origem ou torneio de destino não encontrado.');
      }
      const team = await tx.sportsTeam.create({
        data: {
          tournamentId: destination.id,
          name: input.name?.trim() || source.name,
          institution: source.institution,
          status: SportsTeamStatus.DRAFT,
          fieldRevisions: { name: 1, institution: 1, logo: 1 },
          createdById: actorId,
          updatedById: actorId,
        },
      });
      if (input.includeRepresentatives) {
        await tx.sportsTeamRepresentative.createMany({
          data: source.representatives.map((representative) => ({
            teamId: team.id,
            personId: representative.personId,
            assignedById: actorId,
          })),
        });
      }
      if (input.includeMembers) {
        for (const member of source.members) {
          const participant = await this.payments.ensureParticipant(tx, {
            tournamentId: destination.id,
            personId: member.participant.personId,
            source: SportsParticipantSource.ADMIN,
            actorId,
            approved: true,
          });
          await tx.sportsTeamMember.create({
            data: {
              teamId: team.id,
              participantId: participant.id,
              status: SportsTeamMemberStatus.APPROVED,
              approvedAt: new Date(),
              approvedById: actorId,
              createdById: actorId,
              updatedById: actorId,
            },
          });
        }
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_TEAM,
          entityId: team.id,
          entityLabel: team.name,
          operation: AuditLogOperation.CREATE,
          actor,
          after: {
            sourceTeamId: source.id,
            includeLogo: input.includeLogo ?? false,
            includeRepresentatives: input.includeRepresentatives ?? false,
            includeMembers: input.includeMembers ?? false,
          },
          summary: 'Equipe esportiva duplicada.',
          scope: { majorEventId: destination.majorEventId },
          force: true,
        },
        tx,
      );
      return team;
    });
  }

  private requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O administrador autenticado não possui identificador.');
    }
    return actor.sub;
  }
}
