import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AttendanceCreationMethod,
  AuditLogEntityType,
  AuditLogOperation,
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
import { upsertPresentEventAttendance } from '../../events/attendances/shared/event-attendance-writer';
import { parseUserAztecCode } from '../../events/attendances/user-scanner-code';
import { runSerializableSportsTransaction } from '../sports-transaction';
import {
  requireSportsCheckInUploaderUserId,
  resolveSportsCheckInCollector,
  sportsCheckInProvenanceMetadata,
  type SportsOfflineCollectorInput,
} from './sports-check-in-provenance';

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
    collectorInput: SportsOfflineCollectorInput = {},
    attendanceCreationMethod: AttendanceCreationMethod = AttendanceCreationMethod.MANUAL_INPUT,
  ) {
    const clientId = clientIdValue.trim();
    if (!clientId || clientId.length > 200) {
      throw new BadRequestException('Informe um identificador offline válido para o check-in.');
    }
    requireSportsCheckInUploaderUserId(officialUserId);
    const requestedCheckedInAt = checkedInAt?.toISOString() ?? null;
    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const collector = await resolveSportsCheckInCollector({
        prisma: tx,
        matchId,
        checkedInAt,
        offline,
        uploader: { personId: officialPersonId, userId: officialUserId, role: officialRole },
        input: collectorInput,
      });
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify({
            matchId,
            rosterEntryId,
            checkedInAt: requestedCheckedInAt,
            present,
            collectorPersonId: collector.personId,
          }),
        )
        .digest('hex');
      const existingAction = await tx.sportsMatchAction.findUnique({
        where: { clientId },
      });
      if (
        existingAction &&
        (existingAction.matchId !== matchId ||
          existingAction.type !== SportsMatchActionType.CHECK_IN ||
          existingAction.payloadHash !== payloadHash ||
          existingAction.actorUserId !== collector.userId)
      ) {
        throw new ConflictException('O identificador offline já foi usado por um check-in diferente.');
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
        ).includes(entry.roster.match.state)
      ) {
        throw new ConflictException('O check-in desta partida foi encerrado.');
      }

      const personId = entry.registrationMember.teamMember.participant.personId;
      const eventId = entry.roster.match.eventId;
      if (existingAction) {
        const replayedAttendance = await tx.eventAttendance.findUnique({
          where: { personId_eventId: { personId, eventId } },
        });
        if ((present && (!replayedAttendance || !entry.checkedInAt)) || (!present && entry.checkedInAt)) {
          throw new ConflictException('O check-in offline foi registrado parcialmente. Recarregue a partida.');
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
          actorPersonId: collector.actorPersonId,
          actorUserId: collector.userId,
          actorRole: collector.role,
          authoredAt: effectiveCheckedInAt,
          offline,
          reviewedAt: new Date(),
          reviewedById: officialUserId,
        },
      });
      const attendance = present
        ? await upsertPresentEventAttendance({
            tx,
            attendanceCategories: this.attendanceCategories,
            input: {
              personId,
              eventId,
              attendedAt: effectiveCheckedInAt,
              createdByMethod: attendanceCreationMethod,
              createdById: collector.userId,
              committedById: officialUserId,
            },
          })
        : await tx.eventAttendance.findUnique({
            where: { personId_eventId: { personId, eventId } },
          });
      if (!present) {
        await this.attendanceCategories.refreshForAttendance(personId, eventId, tx);
      }
      await tx.sportsMatchRosterEntry.update({
        where: { id: entry.id },
        data: {
          checkedInAt: present ? effectiveCheckedInAt : null,
          checkedInById: present ? collector.personId : null,
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
            present && entry.roster.match.state === SportsMatchState.SCHEDULED
              ? SportsMatchState.CHECK_IN
              : entry.roster.match.state,
          revision: { increment: 1 },
          operationSequence: { increment: 1 },
          updatedById: officialPersonId,
        },
      });
      if (updatedMatch.count !== 1) {
        throw new ConflictException('A partida mudou durante o check-in. Tente enviar novamente.');
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
            attendanceStatus: attendance?.status ?? null,
            rosterCheckedIn: present,
          },
          summary: present
            ? 'Presença de atleta registrada na escalação.'
            : 'Check-in de atleta removido da escalação.',
          scope: {
            majorEventId: entry.roster.match.category.tournament.majorEventId,
            eventGroupId: entry.roster.match.category.eventGroupId,
            eventId,
          },
          metadata: sportsCheckInProvenanceMetadata({
            collector,
            uploader: { personId: officialPersonId, userId: officialUserId, role: officialRole },
            offline,
            clientId,
          }),
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

  async checkInOfficial(
    matchId: string,
    officialAssignmentId: string,
    checkedInAt: Date | undefined,
    clientIdValue: string,
    offline: boolean,
    present: boolean,
    uploaderPersonId: string,
    uploaderUserId: string | null,
    uploaderRole: string,
    actor: SportsAuditActor,
    collectorInput: SportsOfflineCollectorInput = {},
  ) {
    const clientId = clientIdValue.trim();
    if (!clientId || clientId.length > 200) {
      throw new BadRequestException('Informe um identificador offline válido para o check-in.');
    }
    requireSportsCheckInUploaderUserId(uploaderUserId);
    const requestedCheckedInAt = checkedInAt?.toISOString() ?? null;
    const result = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const match = await tx.sportsMatch.findFirst({
        where: { id: matchId, deletedAt: null },
        select: {
          id: true,
          eventId: true,
          categoryId: true,
          revision: true,
          operationSequence: true,
          state: true,
          category: {
            select: {
              id: true,
              eventGroupId: true,
              tournament: { select: { id: true, majorEventId: true } },
            },
          },
        },
      });
      if (!match) {
        throw new NotFoundException(`Sports match ${matchId} was not found.`);
      }
      if (
        !(
          [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
            SportsMatchState.LIVE,
            SportsMatchState.PAUSED,
          ] as SportsMatchState[]
        ).includes(match.state)
      ) {
        throw new ConflictException('O check-in desta partida foi encerrado.');
      }

      const assignment = await tx.sportsOfficialAssignment.findFirst({
        where: {
          id: officialAssignmentId,
          tournamentId: match.category.tournament.id,
          active: true,
          revokedAt: null,
          person: { deletedAt: null },
          OR: [
            { matchId: match.id },
            { categoryId: match.categoryId, matchId: null },
            { categoryId: null, matchId: null },
          ],
        },
        select: {
          id: true,
          personId: true,
          role: true,
          person: { select: { name: true } },
        },
      });
      if (!assignment) {
        throw new NotFoundException(`Sports official assignment ${officialAssignmentId} was not found.`);
      }

      const collector = await resolveSportsCheckInCollector({
        prisma: tx,
        matchId,
        checkedInAt,
        offline,
        uploader: { personId: uploaderPersonId, userId: uploaderUserId, role: uploaderRole },
        input: collectorInput,
      });
      const payloadHash = createHash('sha256')
        .update(
          JSON.stringify({
            matchId,
            officialAssignmentId,
            personId: assignment.personId,
            checkedInAt: requestedCheckedInAt,
            present,
            collectorPersonId: collector.personId,
          }),
        )
        .digest('hex');
      const existingAction = await tx.sportsMatchAction.findUnique({
        where: { clientId },
      });
      if (
        existingAction &&
        (existingAction.matchId !== matchId ||
          existingAction.type !== SportsMatchActionType.CHECK_IN ||
          existingAction.payloadHash !== payloadHash ||
          existingAction.actorUserId !== collector.userId)
      ) {
        throw new ConflictException('O identificador offline já foi usado por um check-in diferente.');
      }
      if (existingAction) {
        const replayedAttendance = await tx.eventAttendance.findUnique({
          where: { personId_eventId: { personId: assignment.personId, eventId: match.eventId } },
        });
        if (present && (!replayedAttendance || replayedAttendance.status !== 'PRESENT')) {
          throw new ConflictException('O check-in offline foi registrado parcialmente. Recarregue a partida.');
        }
        return { attendance: replayedAttendance, replayed: true };
      }

      const effectiveCheckedInAt = checkedInAt ?? new Date();
      await tx.sportsMatchAction.create({
        data: {
          clientId,
          matchId,
          payloadHash,
          baseRevision: match.revision,
          sequence: match.operationSequence + 1,
          type: SportsMatchActionType.CHECK_IN,
          payload: {
            kind: 'OFFICIAL_CHECK_IN',
            officialAssignmentId,
            personId: assignment.personId,
            role: assignment.role,
            checkedInAt: effectiveCheckedInAt.toISOString(),
            present,
          },
          reviewStatus: SportsReviewStatus.APPROVED,
          actorPersonId: collector.actorPersonId,
          actorUserId: collector.userId,
          actorRole: collector.role,
          authoredAt: effectiveCheckedInAt,
          offline,
          reviewedAt: new Date(),
          reviewedById: uploaderUserId,
        },
      });
      const attendance = present
        ? await upsertPresentEventAttendance({
            tx,
            attendanceCategories: this.attendanceCategories,
            input: {
              personId: assignment.personId,
              eventId: match.eventId,
              attendedAt: effectiveCheckedInAt,
              createdByMethod: AttendanceCreationMethod.MANUAL_INPUT,
              createdById: collector.userId,
              committedById: uploaderUserId,
            },
          })
        : await tx.eventAttendance.findUnique({
            where: { personId_eventId: { personId: assignment.personId, eventId: match.eventId } },
          });
      const updatedMatch = await tx.sportsMatch.updateMany({
        where: {
          id: match.id,
          revision: match.revision,
          operationSequence: match.operationSequence,
          deletedAt: null,
        },
        data: {
          state:
            present && match.state === SportsMatchState.SCHEDULED ? SportsMatchState.CHECK_IN : match.state,
          revision: { increment: 1 },
          operationSequence: { increment: 1 },
          updatedById: uploaderPersonId,
        },
      });
      if (updatedMatch.count !== 1) {
        throw new ConflictException('A partida mudou durante o check-in. Tente enviar novamente.');
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH_ROSTER,
          entityId: match.id,
          entityLabel: `Check-in da partida ${match.id}`,
          operation: AuditLogOperation.SCAN,
          actor,
          after: {
            officialAssignmentId,
            personId: assignment.personId,
            role: assignment.role,
            attendanceStatus: attendance?.status ?? null,
          },
          summary: present
            ? 'Presença de integrante da arbitragem registrada na partida.'
            : 'Check-in de integrante da arbitragem removido da partida.',
          scope: {
            majorEventId: match.category.tournament.majorEventId,
            eventGroupId: match.category.eventGroupId,
            eventId: match.eventId,
          },
          metadata: sportsCheckInProvenanceMetadata({
            collector,
            uploader: { personId: uploaderPersonId, userId: uploaderUserId, role: uploaderRole },
            offline,
            clientId,
          }),
          force: true,
        },
        tx,
      );
      return { attendance, replayed: false };
    });
    if (!result.replayed) {
      await this.afterRosterMutation(
        matchId,
        present ? 'OFFICIAL_CHECKED_IN' : 'OFFICIAL_CHECK_IN_REMOVED',
        officialAssignmentId,
      );
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
    collectorInput: SportsOfflineCollectorInput = {},
  ) {
    const normalizedClientId = clientId.trim();
    if (!normalizedClientId || normalizedClientId.length > 200) {
      throw new BadRequestException('Informe um identificador offline válido para o check-in.');
    }
    requireSportsCheckInUploaderUserId(officialUserId);
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
        normalizedClientId,
        offline,
        true,
        officialPersonId,
        officialUserId,
        officialRole,
        actor,
        collectorInput,
        AttendanceCreationMethod.SCANNER,
      );
    }

    const at = checkedInAt ?? new Date();
    const collector = await resolveSportsCheckInCollector({
      prisma: this.prisma,
      matchId,
      checkedInAt,
      offline,
      uploader: { personId: officialPersonId, userId: officialUserId, role: officialRole },
      input: collectorInput,
    });
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          matchId,
          personId: person.id,
          checkedInAt: at.toISOString(),
          collectorPersonId: collector.personId,
        }),
      )
      .digest('hex');
    const attendance = await runSerializableSportsTransaction(this.prisma, async (tx) => {
      const existingAction = await tx.sportsMatchAction.findUnique({
        where: { clientId: normalizedClientId },
      });
      if (
        existingAction &&
        (existingAction.matchId !== matchId ||
          existingAction.type !== SportsMatchActionType.CHECK_IN ||
          existingAction.payloadHash !== payloadHash ||
          existingAction.actorUserId !== collector.userId)
      ) {
        throw new ConflictException('O identificador offline já foi usado por um check-in diferente.');
      }
      if (existingAction) {
        const replayedAttendance = await tx.eventAttendance.findUnique({
          where: { personId_eventId: { personId: person.id, eventId: context.eventId } },
        });
        if (!replayedAttendance) {
          throw new ConflictException('O check-in offline foi registrado parcialmente. Recarregue a partida.');
        }
        return replayedAttendance;
      }

      const match = await tx.sportsMatch.findFirst({
        where: { id: matchId, deletedAt: null },
        select: { revision: true, operationSequence: true, state: true },
      });
      if (!match) {
        throw new NotFoundException(`Sports match ${matchId} was not found.`);
      }
      if (
        !(
          [
            SportsMatchState.SCHEDULED,
            SportsMatchState.CHECK_IN,
            SportsMatchState.LIVE,
            SportsMatchState.PAUSED,
          ] as SportsMatchState[]
        ).includes(match.state)
      ) {
        throw new ConflictException('O check-in desta partida foi encerrado.');
      }
      await tx.sportsMatchAction.create({
        data: {
          clientId: normalizedClientId,
          matchId,
          payloadHash,
          baseRevision: match.revision,
          sequence: match.operationSequence + 1,
          type: SportsMatchActionType.CHECK_IN,
          payload: {
            kind: 'NON_ROSTER_ATTENDANCE_SCAN',
            personId: person.id,
            checkedInAt: at.toISOString(),
          },
          reviewStatus: SportsReviewStatus.APPROVED,
          actorPersonId: collector.actorPersonId,
          actorUserId: collector.userId,
          actorRole: collector.role,
          authoredAt: at,
          offline,
          reviewedAt: new Date(),
          reviewedById: officialUserId,
        },
      });
      const stored = await upsertPresentEventAttendance({
        tx,
        attendanceCategories: this.attendanceCategories,
        input: {
          personId: person.id,
          eventId: context.eventId,
          attendedAt: at,
          createdByMethod: AttendanceCreationMethod.SCANNER,
          createdById: collector.userId,
          committedById: officialUserId,
        },
      });
      const updatedMatch = await tx.sportsMatch.updateMany({
        where: {
          id: matchId,
          revision: match.revision,
          operationSequence: match.operationSequence,
          deletedAt: null,
        },
        data: {
          revision: { increment: 1 },
          operationSequence: { increment: 1 },
          updatedById: officialPersonId,
        },
      });
      if (updatedMatch.count !== 1) {
        throw new ConflictException('A partida mudou durante o check-in. Tente enviar novamente.');
      }
      await this.auditLog.record(
        {
          entityType: AuditLogEntityType.SPORTS_MATCH_ROSTER,
          entityId: matchId,
          entityLabel: `Scanner da partida ${matchId}`,
          operation: AuditLogOperation.SCAN,
          actor,
          after: {
            personId: person.id,
            attendanceKey: `${person.id}:${context.eventId}`,
            rosterAthlete: false,
            clientId: normalizedClientId,
            offline,
          },
          summary: 'Presença de pessoa fora da escalação registrada para auditoria.',
          scope: {
            majorEventId: context.category.tournament.majorEventId,
            eventGroupId: context.category.eventGroupId,
            eventId: context.eventId,
          },
          metadata: sportsCheckInProvenanceMetadata({
            collector,
            uploader: { personId: officialPersonId, userId: officialUserId, role: officialRole },
            offline,
            clientId: normalizedClientId,
          }),
          force: true,
        },
        tx,
      );
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
