import { Injectable } from '@nestjs/common';
import { Prisma, SportsRosterRole } from '@prisma/client';
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

import { SportsMatchRosterWriteService } from './sports-match-roster-write.service';

@Injectable()
export class SportsMatchRosterService extends SportsMatchRosterWriteService {
  constructor(
    prisma: PrismaService,
    attendanceCategories: AttendanceCategoryService,
    auditLog: AuditLogService,
    realtime: SportsRealtimeService,
    autorouting: SportsAutoroutingService,
    defaultRedirect: CurrentUserDefaultRedirectService,
  ) {
    super(prisma, attendanceCategories, auditLog, realtime, autorouting, defaultRedirect);
  }
}
