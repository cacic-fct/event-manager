import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  AttendanceCreationMethod,
  AuditLogEntityType,
  AuditLogOperation,
  EventAttendanceStatus,
  Prisma,
  SportsEligibilityStatus,
  SportsMatchActionType,
  SportsMatchState,
  SportsParticipantStatus,
  SportsRegistrationStatus,
  SportsRosterEntryStatus,
  SportsRosterRole,
  SportsRosterStatus,
  SportsReviewStatus,
  SportsTeamMemberStatus,
} from '@prisma/client';
import { AuditActor } from '../../audit-log/audit-log.types';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { parseUserAztecCode } from '../../events/attendances/user-scanner-code';
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
import { SportsMatchRosterCopyService } from './sports-match-roster-copy.service';

export abstract class SportsMatchRosterCheckInService extends SportsMatchRosterCopyService {
  async checkIn(
    matchId: string,
    rosterEntryId: string,
    checkedInAt: Date | undefined,
    clientIdValue: string,
    offline: boolean,
    present: boolean,
    officialPersonId: string,
    officialUserId: string | null,
    officialRole: string,
    actor: SportsAuditActor,
  ) {
    const clientId = clientIdValue.trim();
    if (!clientId || clientId.length > 200) {
      throw new BadRequestException(
        'Informe um identificador offline válido para o check-in.',
      );
    }
    const requestedCheckedInAt = checkedInAt?.toISOString() ?? null;
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          matchId,
          rosterEntryId,
          checkedInAt: requestedCheckedInAt,
          present,
          officialPersonId,
        }),
      )
      .digest('hex');
    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const existingAction = await tx.sportsMatchAction.findUnique({
        where: { clientId },
      });
      if (
        existingAction &&
        (existingAction.matchId !== matchId ||
          existingAction.type !== SportsMatchActionType.CHECK_IN ||
          existingAction.payloadHash !== payloadHash ||
          existingAction.actorPersonId !== officialPersonId)
      ) {
        throw new ConflictException(
          'O identificador offline já foi usado por um check-in diferente.',
        );
      }
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
        !existingAction &&
        !(
          [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
            SportsMatchState.LIVE,
            SportsMatchState.PAUSED,
          ] as SportsMatchState[]
        ).includes(
          entry.roster.match.state,
        )
      ) {
        throw new ConflictException('O check-in desta partida foi encerrado.');
      }

      const personId = entry.registrationMember.teamMember.participant.personId;
      const eventId = entry.roster.match.eventId;
      if (existingAction) {
        const replayedAttendance = await tx.eventAttendance.findUnique({
          where: { personId_eventId: { personId, eventId } },
        });
        if (
          (present && (!replayedAttendance || !entry.checkedInAt)) ||
          (!present && (replayedAttendance || entry.checkedInAt))
        ) {
          throw new ConflictException(
            'O check-in offline foi registrado parcialmente. Recarregue a partida.',
          );
        }
        return {
          attendance: replayedAttendance,
          replayed: true,
        };
      }

      const effectiveCheckedInAt = checkedInAt ?? new Date();
      const sequence = entry.roster.match.operationSequence + 1;
      await tx.sportsMatchAction.create({
        data: {
          clientId,
          matchId,
          payloadHash,
          baseRevision: entry.roster.match.revision,
          sequence,
          type: SportsMatchActionType.CHECK_IN,
          payload: {
            kind: 'ROSTER_ENTRY_CHECK_IN',
            rosterEntryId,
            checkedInAt: effectiveCheckedInAt.toISOString(),
            present,
          },
          reviewStatus: SportsReviewStatus.APPROVED,
          actorPersonId: officialPersonId,
          actorUserId: officialUserId,
          actorRole: officialRole,
          authoredAt: effectiveCheckedInAt,
          offline,
          reviewedAt: new Date(),
          reviewedById: officialUserId,
        },
      });
      const attendance = present
        ? await tx.eventAttendance.upsert({
            where: { personId_eventId: { personId, eventId } },
            create: {
              personId,
              eventId,
              attendedAt: effectiveCheckedInAt,
              status: EventAttendanceStatus.PRESENT,
              createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
              createdById: officialPersonId,
              committedById: officialPersonId,
            },
            update: {
              attendedAt: effectiveCheckedInAt,
              status: EventAttendanceStatus.PRESENT,
              committedById: officialPersonId,
            },
          })
        : await tx.eventAttendance
            .delete({
              where: { personId_eventId: { personId, eventId } },
            })
            .catch(() => null);
      await this.attendanceCategories.refreshForAttendance(personId, eventId, tx);
      await tx.sportsMatchRosterEntry.update({
        where: { id: entry.id },
        data: {
          checkedInAt: present ? effectiveCheckedInAt : null,
          checkedInById: present ? officialPersonId : null,
          updatedById: officialPersonId,
        },
      });
      const updatedMatch = await tx.sportsMatch.updateMany({
        where: {
          id: entry.roster.match.id,
          revision: entry.roster.match.revision,
          operationSequence: entry.roster.match.operationSequence,
          deletedAt: null,
        },
        data: {
          state:
            entry.roster.match.state === SportsMatchState.SCHEDULED
              ? SportsMatchState.CHECK_IN
              : entry.roster.match.state,
          revision: { increment: 1 },
          operationSequence: { increment: 1 },
          updatedById: officialPersonId,
        },
      });
      if (updatedMatch.count !== 1) {
        throw new ConflictException(
          'A partida mudou durante o check-in. Tente enviar novamente.',
        );
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
            attendanceStatus: present ? attendance?.status : 'REMOVED',
          },
          summary: present
            ? 'Presença de atleta registrada na escalação.'
            : 'Presença de atleta removida da escalação.',
          scope: {
            majorEventId: entry.roster.match.category.tournament.majorEventId,
            eventGroupId: entry.roster.match.category.eventGroupId,
            eventId,
          },
          force: true,
        },
        tx,
      );
      return { attendance, replayed: false };
    });
    if (!result.replayed) {
      await this.afterRosterMutation(matchId, 'PLAYER_CHECKED_IN', rosterEntryId);
    }
    return result.attendance;
  }

  async checkInFromScanner(
    matchId: string,
    code: string,
    checkedInAt: Date | undefined,
    clientId: string,
    offline: boolean,
    officialPersonId: string,
    officialUserId: string | null,
    officialRole: string,
    actor: SportsAuditActor,
  ) {
    const userId = parseUserAztecCode(code);
    if (!userId) {
      throw new BadRequestException('Código Aztec incompatível.');
    }
    const context = await this.prisma.sportsMatch.findFirst({
      where: { id: matchId, deletedAt: null },
      select: {
        id: true,
        eventId: true,
        revision: true,
        state: true,
        category: { select: { eventGroupId: true, tournament: { select: { majorEventId: true } } } },
      },
    });
    if (!context) throw new NotFoundException(`Sports match ${matchId} was not found.`);
    if (
      !(
        [
          SportsMatchState.SCHEDULED,
          SportsMatchState.CHECK_IN,
          SportsMatchState.LIVE,
          SportsMatchState.PAUSED,
        ] as SportsMatchState[]
      ).includes(context.state)
    ) {
      throw new ConflictException('O check-in desta partida foi encerrado.');
    }
    const person = await this.prisma.people.findFirst({
      where: { userId, deletedAt: null, mergedIntoId: null },
      select: { id: true },
    });
    if (!person) throw new NotFoundException('A pessoa do código lido não foi encontrada.');
    const athlete = await this.prisma.sportsMatchRosterEntry.findFirst({
      where: {
        deletedAt: null,
        status: SportsRosterEntryStatus.APPROVED,
        roster: { matchId, deletedAt: null, status: SportsRosterStatus.APPROVED },
        registrationMember: {
          deletedAt: null,
          teamMember: { deletedAt: null, participant: { personId: person.id, deletedAt: null } },
        },
      },
      select: { id: true },
    });
    if (athlete) {
      return this.checkIn(
        matchId,
        athlete.id,
        checkedInAt,
        clientId,
        offline,
        true,
        officialPersonId,
        officialUserId,
        officialRole,
        actor,
      );
    }

    const at = checkedInAt ?? new Date();
    const attendance = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const stored = await tx.eventAttendance.upsert({
        where: { personId_eventId: { personId: person.id, eventId: context.eventId } },
        create: {
          personId: person.id,
          eventId: context.eventId,
          attendedAt: at,
          status: EventAttendanceStatus.PRESENT,
          createdByMethod: AttendanceCreationMethod.SCANNER,
          createdById: officialPersonId,
          committedById: officialPersonId,
        },
        update: { attendedAt: at, status: EventAttendanceStatus.PRESENT, committedById: officialPersonId },
      });
      await this.attendanceCategories.refreshForAttendance(person.id, context.eventId, tx);
      await this.auditLog.record({
        entityType: AuditLogEntityType.SPORTS_MATCH_ROSTER,
        entityId: matchId,
        entityLabel: `Scanner da partida ${matchId}`,
        operation: AuditLogOperation.SCAN,
        actor,
        after: { personId: person.id, attendanceKey: `${person.id}:${context.eventId}`, rosterAthlete: false, clientId, offline },
        summary: 'Presença de pessoa fora da escalação registrada para auditoria.',
        scope: {
          majorEventId: context.category.tournament.majorEventId,
          eventGroupId: context.category.eventGroupId,
          eventId: context.eventId,
        },
        force: true,
      }, tx);
      return stored;
    });
    // The match feed is replayable. Consumers reload the roster; because this
    // person is not an athlete, they remain intentionally absent from that list.
    await this.afterRosterMutation(
      matchId,
      'NON_ROSTER_ATTENDANCE_SCANNED',
      `${attendance.personId}:${attendance.eventId}`,
    );
    return attendance;
  }
}


