import { PrismaService } from '../../../prisma/prisma.service';
import { AttendanceCategoryService } from '../../attendance-category.service';
import { parseUserAztecCode } from '../user-scanner-code';
import { GraphqlContext } from './types';
import { PersonCsvImportSupport } from '../../../common/person-csv-import-support';

export abstract class EventAttendancesCoreSupport extends PersonCsvImportSupport {
  constructor(prisma: PrismaService, protected readonly attendanceCategories: AttendanceCategoryService) {
    super(prisma);
  }

  protected getActorId(context: GraphqlContext): string | undefined {
    return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
  }

  protected getFirstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }

  protected parseUserAztecCode(code: string): string | null {
    return parseUserAztecCode(code);
  }
}
