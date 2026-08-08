import {
  BadRequestException,
} from '@nestjs/common';
import {
  
  Prisma,
  PublicationState,
  SportsRosterRole,
} from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserDefaultRedirectService } from '../../current-user/default-redirect/current-user-default-redirect.service';
import { SportsRealtimeService } from '../realtime/sports-realtime.service';
import { SportsAutoroutingService } from '../routing/sports-autorouting.service';

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

export abstract class SportsMatchRosterSupportService {
  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly attendanceCategories: AttendanceCategoryService,
    protected readonly auditLog: AuditLogService,
    protected readonly realtime: SportsRealtimeService,
    protected readonly autorouting: SportsAutoroutingService,
    protected readonly defaultRedirect: CurrentUserDefaultRedirectService,
  ) {}

  protected normalizeEntries(entries: SportsRosterEntryWrite[]): SportsRosterEntryWrite[] {
    const result = entries.map((entry) => ({
      registrationMemberId: entry.registrationMemberId.trim(),
      role: entry.role,
      shirtNumber: entry.shirtNumber?.trim() || null,
      roleMetadata: entry.roleMetadata,
    }));
    if (result.some((entry) => !entry.registrationMemberId)) {
      throw new BadRequestException('Integrante inválido na escalação.');
    }
    if (new Set(result.map((entry) => entry.registrationMemberId)).size !== result.length) {
      throw new BadRequestException('Uma pessoa não pode aparecer duas vezes na mesma escalação.');
    }
    if (
      result.some(
        (entry) =>
          entry.shirtNumber !== null &&
          (entry.shirtNumber.length > 12 ||
            !/^[\p{L}\p{N}._-]+$/u.test(entry.shirtNumber)),
      )
    ) {
      throw new BadRequestException(
        'O número de camisa deve ter até 12 letras ou números.',
      );
    }
    const playerShirtNumbers = result
      .filter(
        (entry) =>
          entry.role === SportsRosterRole.PLAYER && entry.shirtNumber !== null,
      )
      .map((entry) => entry.shirtNumber?.toLocaleLowerCase('pt-BR'));
    if (new Set(playerShirtNumbers).size !== playerShirtNumbers.length) {
      throw new BadRequestException(
        'O número de camisa não pode se repetir na mesma escalação.',
      );
    }
    return result;
  }

  protected async afterRosterMutation(
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
      this.realtime.publishAutorouteInvalidations(people),
    ]);
  }
}

