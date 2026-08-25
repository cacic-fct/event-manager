import { BadRequestException, Logger } from '@nestjs/common';
import { Prisma, SportsRosterRole } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsMutationEventsService } from '../realtime/sports-mutation-events.service';

export interface SportsRosterEntryWrite {
  registrationMemberId: string;
  teamMemberId?: string | null;
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
  protected readonly logger = new Logger(SportsMatchRosterSupportService.name);

  protected constructor(
    protected readonly prisma: PrismaService,
    protected readonly attendanceCategories: AttendanceCategoryService,
    protected readonly auditLog: AuditLogService,
    protected readonly mutationEvents: SportsMutationEventsService,
  ) {}

  protected normalizeEntries(entries: SportsRosterEntryWrite[]): SportsRosterEntryWrite[] {
    const result = entries.map((entry) => ({
      registrationMemberId: entry.registrationMemberId.trim(),
      teamMemberId: entry.teamMemberId?.trim() || null,
      role: entry.role,
      shirtNumber: entry.shirtNumber?.trim() || null,
      roleMetadata: entry.roleMetadata,
    }));
    if (result.some((entry) => !entry.registrationMemberId)) {
      throw new BadRequestException('Integrante inválido na escalação.');
    }
    if (new Set(result.map((entry) => entry.teamMemberId ?? entry.registrationMemberId)).size !== result.length) {
      throw new BadRequestException('Uma pessoa não pode aparecer duas vezes na mesma escalação.');
    }
    if (
      result.some(
        (entry) =>
          entry.shirtNumber !== null &&
          (entry.shirtNumber.length > 12 || !/^[\p{L}\p{N}._-]+$/u.test(entry.shirtNumber)),
      )
    ) {
      throw new BadRequestException('O número de camisa deve ter até 12 letras, números ou os símbolos ., _ e -.');
    }
    const playerShirtNumbers = result
      .filter((entry) => entry.role === SportsRosterRole.PLAYER && entry.shirtNumber !== null)
      .map((entry) => entry.shirtNumber?.toLocaleLowerCase('pt-BR'));
    if (new Set(playerShirtNumbers).size !== playerShirtNumbers.length) {
      throw new BadRequestException('O número de camisa não pode se repetir na mesma escalação.');
    }
    return result;
  }

  protected async afterRosterMutation(matchId: string, type: string, entityId: string): Promise<void> {
    try {
      await this.mutationEvents.publishRosterMutation(matchId, type, entityId);
    } catch (error: unknown) {
      this.logger.warn(
        `Could not publish sports roster mutation ${entityId}; the committed roster remains authoritative.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
