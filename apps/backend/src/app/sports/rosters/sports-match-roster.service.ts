import { Injectable } from '@nestjs/common';
import { Prisma, SportsRosterRole } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { AttendanceCategoryService } from '../../events/attendance-category.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsMutationEventsService } from '../realtime/sports-mutation-events.service';

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

import { SportsMatchRosterWriteService } from './sports-match-roster-write.service';

@Injectable()
export class SportsMatchRosterService extends SportsMatchRosterWriteService {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    auditLog: AuditLogService,
    mutationEvents: SportsMutationEventsService,
  ) {
    super(prisma, attendanceCategories, auditLog, mutationEvents);
  }
}
