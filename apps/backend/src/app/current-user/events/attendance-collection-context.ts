import {
  OfflineEventAttendanceCommitResult,
} from '@cacic-fct/shared-data-types';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  classifyOfflineAttendanceError,
  errorMessage,
  isRequiredLocationIssue,
} from '../../events/attendances/offline-attendance-resolution';

export function getAuthenticatedUser(
  currentUserContext: CurrentUserContextService,
  context: GraphqlContext,
): AuthenticatedUser | undefined {
  return (
    currentUserContext.getAuthenticatedUser?.(context) ??
    context.req?.user ??
    context.request?.user
  );
}

export function getActorId(context: GraphqlContext): string | undefined {
  return context.req?.user?.sub ?? context.request?.user?.sub ?? undefined;
}

export function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function parseUserAztecCode(code: string): string | null {
  const [kind, userId, ...extraParts] = code.trim().split(':');
  if (kind !== 'user' || !userId || extraParts.length > 0) {
    return null;
  }

  return userId;
}

export function commitStatusForError(error: unknown): OfflineEventAttendanceCommitResult['status'] {
  return classifyOfflineAttendanceError(error).status;
}

export function isRequiredLocationError(error: unknown): boolean {
  return isRequiredLocationIssue(classifyOfflineAttendanceError(error).issue);
}

export { errorMessage };
