import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceCreationMethod,
  AuditLogEntityType,
  AuditLogOperation,
  EventAttendanceStatus,
  Prisma,
  PublicationState,
  SportsEligibilityStatus,
  SportsMatchState,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserDefaultRedirectService } from '../../current-user/default-redirect/current-user-default-redirect.service';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';
import { SportsAutoroutingService } from '../routing/sports-autorouting.service';
import { runSerializableSportsTransaction } from '../sports-transaction';

export interface SportsRosterEntryWrite {
  registrationMemberId: string;
  role: SportsRosterRole;
}

export interface SportsRosterWrite {
  matchId: string;
  registrationId: string;
  expectedRevision?: number;
  entries: SportsRosterEntryWrite[];
}

type SportsAuditActor = AuthenticatedUser | AuditActor;

@Injectable()
export class SportsMatchRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceCategories: AttendanceCategoryService,
    private readonly auditLog: AuditLogService,
    private readonly realtime: SportsRealtimeService,
    private readonly autorouting: SportsAutoroutingService,
    private readonly defaultRedirect: CurrentUserDefaultRedirectService,
  ) {}

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

  async checkIn(
    matchId: string,
    rosterEntryId: string,
    checkedInAt: Date,
    officialPersonId: string,
    actor: SportsAuditActor,
  ) {
    const attendance = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const entry = await tx.sportsMatchRosterEntry.findFirst({
        where: {
          id: rosterEntryId,
          deletedAt: null,
          status: SportsRosterEntryStatus.APPROVED,
          roster: {
            matchId,
            status: SportsRosterStatus.APPROVED,
            deletedAt: null,
          },
          registrationMember: {
            deletedAt: null,
            eligibility: SportsEligibilityStatus.ELIGIBLE,
            registration: {
              deletedAt: null,
              status: {
                in: [
                  SportsRegistrationStatus.APPROVED,
                  SportsRegistrationStatus.ACTIVE,
                ],
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
        },
        include: {
          registrationMember: {
            include: {
              teamMember: {
                include: {
                  participant: { select: { personId: true, status: true } },
                },
              },
            },
          },
          roster: {
            include: {
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
          },
        },
      });
      if (!entry) {
        throw new NotFoundException(`Sports roster entry ${rosterEntryId} was not found.`);
      }
      if (entry.registrationMember.teamMember.participant.status !== SportsParticipantStatus.ACTIVE) {
        throw new ConflictException('A participação desta pessoa não está efetiva.');
      }
      if (
        !(
          [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
          ] as SportsMatchState[]
        ).includes(
          entry.roster.match.state,
        )
      ) {
        throw new ConflictException('O check-in desta partida foi encerrado.');
      }

      const personId = entry.registrationMember.teamMember.participant.personId;
      const eventId = entry.roster.match.eventId;
      const attendance = await tx.eventAttendance.upsert({
        where: { personId_eventId: { personId, eventId } },
        create: {
          personId,
          eventId,
          attendedAt: checkedInAt,
          status: EventAttendanceStatus.PRESENT,
          createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
          createdById: officialPersonId,
          committedById: officialPersonId,
        },
        update: {
          attendedAt: checkedInAt,
          status: EventAttendanceStatus.PRESENT,
          committedById: officialPersonId,
        },
      });
      await this.attendanceCategories.refreshForAttendance(personId, eventId, tx);
      await tx.sportsMatchRosterEntry.update({
        where: { id: entry.id },
        data: {
          checkedInAt,
          checkedInById: officialPersonId,
          updatedById: officialPersonId,
        },
      });
      if (entry.roster.match.state === SportsMatchState.SCHEDULED) {
        await tx.sportsMatch.update({
          where: { id: entry.roster.match.id },
          data: {
            state: SportsMatchState.CHECK_IN,
            revision: { increment: 1 },
            updatedById: officialPersonId,
          },
        });
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH_ROSTER,
          entityId: entry.roster.id,
          entityLabel: `Check-in da partida ${entry.roster.match.id}`,
          operation: AuditLogOperation.SCAN,
          actor,
          after: {
            rosterEntryId: entry.id,
            attendanceStatus: attendance.status,
          },
          summary: 'Presença de atleta registrada na escalação.',
          scope: {
            majorEventId: entry.roster.match.category.tournament.majorEventId,
            eventGroupId: entry.roster.match.category.eventGroupId,
            eventId,
          },
          force: true,
        },
        tx,
      );
      return attendance;
    });
    await this.afterRosterMutation(matchId, 'PLAYER_CHECKED_IN', rosterEntryId);
    return attendance;
  }

  async copyApprovedRosterForWinner(
    tx: Prisma.TransactionClient,
    sourceMatchId: string,
    destinationMatchId: string,
    winnerRegistrationId: string,
    actorId: string,
  ): Promise<void> {
    const source = await tx.sportsMatchRoster.findFirst({
      where: {
        matchId: sourceMatchId,
        registrationId: winnerRegistrationId,
        status: SportsRosterStatus.APPROVED,
        deletedAt: null,
      },
      include: {
        entries: {
          where: {
            deletedAt: null,
            status: SportsRosterEntryStatus.APPROVED,
          },
        },
      },
    });
    if (!source) {
      return;
    }
    const existing = await tx.sportsMatchRoster.findFirst({
      where: {
        matchId: destinationMatchId,
        registrationId: winnerRegistrationId,
        deletedAt: null,
      },
      include: { entries: { where: { deletedAt: null } } },
    });
    if (existing?.manuallyEdited) {
      return;
    }
    if (existing) {
      await tx.sportsMatchRosterEntry.updateMany({
        where: { rosterId: existing.id, deletedAt: null },
        data: { deletedAt: new Date(), updatedById: actorId },
      });
    }
    const destination = existing
      ? await tx.sportsMatchRoster.update({
          where: { id: existing.id },
          data: {
            status: SportsRosterStatus.APPROVED,
            revision: { increment: 1 },
            copiedFromRosterId: source.id,
            updatedById: actorId,
          },
        })
      : await tx.sportsMatchRoster.create({
          data: {
            matchId: destinationMatchId,
            registrationId: winnerRegistrationId,
            status: SportsRosterStatus.APPROVED,
            copiedFromRosterId: source.id,
            createdById: actorId,
            updatedById: actorId,
          },
        });
    if (source.entries.length > 0) {
      await tx.sportsMatchRosterEntry.createMany({
        data: source.entries.map((entry) => ({
          rosterId: destination.id,
          registrationMemberId: entry.registrationMemberId,
          status: SportsRosterEntryStatus.APPROVED,
          role: entry.role,
          createdById: actorId,
          updatedById: actorId,
        })),
      });
    }
  }

  private normalizeEntries(entries: SportsRosterEntryWrite[]): SportsRosterEntryWrite[] {
    const result = entries.map((entry) => ({
      registrationMemberId: entry.registrationMemberId.trim(),
      role: entry.role,
    }));
    if (result.some((entry) => !entry.registrationMemberId)) {
      throw new BadRequestException('Integrante inválido na escalação.');
    }
    if (new Set(result.map((entry) => entry.registrationMemberId)).size !== result.length) {
      throw new BadRequestException('Uma pessoa não pode aparecer duas vezes na mesma escalação.');
    }
    return result;
  }

  private async afterRosterMutation(
    matchId: string,
    type: string,
    entityId: string,
  ): Promise<void> {
    const match = await this.prisma.sportsMatch.findFirst({
      where: {
        id: matchId,
        deletedAt: null,
      },
      select: {
        id: true,
        revision: true,
        category: {
          select: {
            tournamentId: true,
          },
        },
        event: {
          select: {
            deletedAt: true,
            publiclyVisible: true,
            publicationState: true,
          },
        },
      },
    });
    if (!match) {
      return;
    }
    const payload = {
      type,
      matchId,
      entityId,
      revision: match.revision,
    };
    const isPublic =
      !match.event.deletedAt &&
      match.event.publiclyVisible &&
      match.event.publicationState === PublicationState.PUBLISHED;
    const people = await this.autorouting.affectedPeopleForMatch(match.id);
    await Promise.all([
      this.realtime.publish(
        this.realtime.scope('review', match.id),
        payload,
      ),
      ...(isPublic
        ? [
            this.realtime.publish(
              this.realtime.scope('match', match.id),
              payload,
            ),
            this.realtime.publish(
              this.realtime.scope(
                'tournament',
                match.category.tournamentId,
              ),
              payload,
            ),
          ]
        : []),
      this.defaultRedirect.invalidatePeople(people),
    ]);
  }
}
