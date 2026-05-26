import { PrismaService } from '../../../prisma/prisma.service';
import { AttendanceCategoryService } from '../../attendance-category.service';
import { GraphqlContext } from './types';

export abstract class EventAttendancesCoreSupport {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly attendanceCategories: AttendanceCategoryService,
  ) {}

  protected getActorId(context: GraphqlContext): string | undefined {
    return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
  }

  protected getFirstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }

  protected parseUserAztecCode(code: string): string | null {
    const trimmedCode = code.trim();
    if (!trimmedCode.startsWith('user:')) {
      return null;
    }

    const userId = trimmedCode.slice('user:'.length).trim();
    return userId.length > 0 ? userId : null;
  }
}
