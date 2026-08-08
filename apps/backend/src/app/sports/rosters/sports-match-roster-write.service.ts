import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  
  AuditLogEntityType,
  AuditLogOperation,
  Prisma,
  SportsEligibilityStatus,
  SportsMatchState,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { runSerializableSportsTransaction } from '../sports-transaction';

export interface SportsRosterEntryWrite {
  registrationMemberId: string;
  role: SportsRosterRole;
  shirtNumber?: string | null;
  roleMetadata?: Prisma.InputJsonValue | Prisma.NullTypes.DbNull;
}

export interface SportsRosterWrite {
  matchId: string;
  registrationId: string;
  expectedRevision?: number;
  entries: SportsRosterEntryWrite[];
}

type SportsAuditActor = AuthenticatedUser | AuditActor;
import { SportsMatchRosterCheckInService } from './sports-match-roster-check-in.service';

export abstract class SportsMatchRosterWriteService extends SportsMatchRosterCheckInService {
  async upsert(
    input: SportsRosterWrite,
    actorId: string,
    actor: SportsAuditActor,
    trustedAdmin: boolean,
  ) {
    const roster = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const match = await tx.sportsMatch.findFirst({
        where: { id: input.matchId, deletedAt: null },
        include: {
          category: {
            select: {
              id: true,
              eventGroupId: true,
              maximumRosterSize: true,
              tournament: { select: { majorEventId: true } },
            },
          },
        },
      });
      if (!match) {
        throw new NotFoundException(`Sports match ${input.matchId} was not found.`);
      }
      if (
        !trustedAdmin &&
        !(
          [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
          ] as SportsMatchState[]
        ).includes(match.state)
      ) {
        throw new ConflictException('A escalação não pode ser alterada após o início da partida.');
      }
      if (
        input.registrationId !== match.homeRegistrationId &&
        input.registrationId !== match.awayRegistrationId
      ) {
        throw new BadRequestException('A equipe não participa desta partida.');
      }

      const entries = this.normalizeEntries(input.entries);
      const members = await tx.sportsRegistrationMember.findMany({
        where: {
          id: { in: entries.map((entry) => entry.registrationMemberId) },
          registrationId: input.registrationId,
          categoryId: match.categoryId,
          deletedAt: null,
          eligibility: SportsEligibilityStatus.ELIGIBLE,
          registration: {
            deletedAt: null,
            status: {
              in: [SportsRegistrationStatus.APPROVED, SportsRegistrationStatus.ACTIVE],
            },
          },
          teamMember: {
            deletedAt: null,
            status: SportsTeamMemberStatus.APPROVED,
            participant: {
              deletedAt: null,
              status: SportsParticipantStatus.ACTIVE,
            },
          },
        },
        select: { id: true, role: true },
      });
      if (members.length !== entries.length) {
        throw new BadRequestException(
          'Uma ou mais pessoas não estão aprovadas, elegíveis ou ativas nesta modalidade.',
        );
      }
      const memberRoleById = new Map(members.map((member) => [member.id, member.role]));
      if (
        entries.some(
          (entry) => memberRoleById.get(entry.registrationMemberId) !== entry.role,
        )
      ) {
        throw new BadRequestException('A função da escalação não corresponde à função aprovada.');
      }

      const playerCount = entries.filter((entry) => entry.role === SportsRosterRole.PLAYER).length;
      const maximumRosterSize = match.category.maximumRosterSize;
      if (maximumRosterSize !== null && playerCount > maximumRosterSize) {
        throw new BadRequestException(
          `A escalação permite no máximo ${maximumRosterSize} jogadores.`,
        );
      }

      const existing = await tx.sportsMatchRoster.findFirst({
        where: {
          matchId: match.id,
          registrationId: input.registrationId,
          deletedAt: null,
        },
        include: { entries: { where: { deletedAt: null } } },
      });
      if (
        existing &&
        (input.expectedRevision === undefined ||
          existing.revision !== input.expectedRevision)
      ) {
        throw new ConflictException('A escalação mudou. Recarregue os dados e tente novamente.');
      }

      const rosterStatus = trustedAdmin
        ? SportsRosterStatus.APPROVED
        : SportsRosterStatus.SUBMITTED;
      let roster;
      if (existing) {
        const changed = await tx.sportsMatchRoster.updateMany({
          where: {
            id: existing.id,
            revision: input.expectedRevision,
            deletedAt: null,
          },
          data: {
            status: rosterStatus,
            revision: { increment: 1 },
            manuallyEdited: true,
            updatedById: actorId,
          },
        });
        if (changed.count !== 1) {
          throw new ConflictException(
            'A escalação mudou. Recarregue os dados e tente novamente.',
          );
        }
        roster = await tx.sportsMatchRoster.findUniqueOrThrow({
          where: { id: existing.id },
        });
      } else {
        roster = await tx.sportsMatchRoster.create({
            data: {
              matchId: match.id,
              registrationId: input.registrationId,
              status: rosterStatus,
              manuallyEdited: true,
              createdById: actorId,
              updatedById: actorId,
            },
          });
      }

      const requestedMemberIds = new Set(
        entries.map((entry) => entry.registrationMemberId),
      );
      await tx.sportsMatchRosterEntry.updateMany({
        where: {
          rosterId: roster.id,
          deletedAt: null,
          registrationMemberId: { notIn: [...requestedMemberIds] },
        },
        data: {
          deletedAt: new Date(),
          updatedById: actorId,
        },
      });
      for (const entry of entries) {
        const current = await tx.sportsMatchRosterEntry.findFirst({
          where: {
            rosterId: roster.id,
            registrationMemberId: entry.registrationMemberId,
            deletedAt: null,
          },
        });
        if (current) {
          await tx.sportsMatchRosterEntry.update({
            where: { id: current.id },
            data: {
              role: entry.role,
              shirtNumber: entry.shirtNumber,
              ...(entry.roleMetadata !== undefined
                ? { roleMetadata: entry.roleMetadata }
                : {}),
              status: trustedAdmin
                ? SportsRosterEntryStatus.APPROVED
                : SportsRosterEntryStatus.SUBMITTED,
              updatedById: actorId,
            },
          });
        } else {
          await tx.sportsMatchRosterEntry.create({
            data: {
              rosterId: roster.id,
              registrationMemberId: entry.registrationMemberId,
              role: entry.role,
              shirtNumber: entry.shirtNumber,
              ...(entry.roleMetadata !== undefined
                ? { roleMetadata: entry.roleMetadata }
                : {}),
              status: trustedAdmin
                ? SportsRosterEntryStatus.APPROVED
                : SportsRosterEntryStatus.SUBMITTED,
              createdById: actorId,
              updatedById: actorId,
            },
          });
        }
      }

      const result = await tx.sportsMatchRoster.findUniqueOrThrow({
        where: { id: roster.id },
        include: { entries: { where: { deletedAt: null } } },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH_ROSTER,
          entityId: roster.id,
          entityLabel: `Escalação da partida ${match.id}`,
          operation: existing ? AuditLogOperation.UPDATE : AuditLogOperation.CREATE,
          actor,
          before: existing
            ? {
                status: existing.status,
                revision: existing.revision,
                entryCount: existing.entries.length,
              }
            : undefined,
          after: {
            status: result.status,
            revision: result.revision,
            entryCount: result.entries.length,
          },
          summary: trustedAdmin
            ? 'Escalação atualizada por administrador.'
            : 'Escalação enviada para análise.',
          scope: {
            majorEventId: match.category.tournament.majorEventId,
            eventGroupId: match.category.eventGroupId,
            eventId: match.eventId,
          },
        },
        tx,
      );
      return result;
    });
    await this.afterRosterMutation(
      input.matchId,
      trustedAdmin ? 'ROSTER_APPROVED' : 'ROSTER_SUBMITTED',
      roster.id,
    );
    return roster;
  }

  async review(
    rosterId: string,
    decision: 'APPROVE' | 'REJECT',
    actorId: string,
    actor: AuthenticatedUser,
  ) {
    const roster = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const roster = await tx.sportsMatchRoster.findFirst({
        where: { id: rosterId, deletedAt: null },
        include: {
          entries: { where: { deletedAt: null } },
          match: {
            include: {
              category: {
                select: {
                  eventGroupId: true,
                  tournament: { select: { majorEventId: true } },
                },
              },
            },
          },
        },
      });
      if (!roster) {
        throw new NotFoundException(`Sports roster ${rosterId} was not found.`);
      }
      if (roster.status !== SportsRosterStatus.SUBMITTED) {
        throw new ConflictException('Somente escalações enviadas podem ser analisadas.');
      }
      const approved = decision === 'APPROVE';
      const status = approved ? SportsRosterStatus.APPROVED : SportsRosterStatus.REJECTED;
      const entryStatus = approved
        ? SportsRosterEntryStatus.APPROVED
        : SportsRosterEntryStatus.REJECTED;
      const result = await tx.sportsMatchRoster.update({
        where: { id: roster.id },
        data: {
          status,
          revision: { increment: 1 },
          updatedById: actorId,
          entries: {
            updateMany: {
              where: { deletedAt: null },
              data: { status: entryStatus, updatedById: actorId },
            },
          },
        },
        include: { entries: { where: { deletedAt: null } } },
      });
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH_ROSTER,
          entityId: roster.id,
          entityLabel: `Escalação da partida ${roster.matchId}`,
          operation: approved ? AuditLogOperation.APPROVE : AuditLogOperation.REJECT,
          actor,
          before: { status: roster.status, revision: roster.revision },
          after: { status: result.status, revision: result.revision },
          summary: approved ? 'Escalação aprovada.' : 'Escalação rejeitada.',
          scope: {
            majorEventId: roster.match.category.tournament.majorEventId,
            eventGroupId: roster.match.category.eventGroupId,
            eventId: roster.match.eventId,
          },
        },
        tx,
      );
      return result;
    });
    await this.afterRosterMutation(
      roster.matchId,
      decision === 'APPROVE' ? 'ROSTER_APPROVED' : 'ROSTER_REJECTED',
      roster.id,
    );
    return roster;
  }
}


