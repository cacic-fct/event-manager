import {
  OfflineEventAttendanceCommitResult,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { CurrentUserContextService } from '../context.service';
import { GraphqlContext } from '../selects';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';

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
  if (error instanceof ConflictException) {
    return errorMessage(error).includes('Presença já registrada') ? 'DUPLICATE' : 'CONFLICT';
  }

  if (error instanceof HttpException && [401, 403].includes(error.getStatus())) {
    return 'FORBIDDEN';
  }

  return 'FAILED';
}

export function isRequiredLocationError(error: unknown): boolean {
  if (!(error instanceof BadRequestException)) {
    return false;
  }

  return [
    'Localização precisa é obrigatória para registrar presença.',
    'Ative a localização precisa para registrar presença.',
  ].includes(errorMessage(error));
}

export function errorMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response && 'message' in response) {
      const message = (response as { message?: unknown }).message;
      if (Array.isArray(message)) {
        return message.filter((item): item is string => typeof item === 'string').join('\n');
      }

      if (typeof message === 'string') {
        return message;
      }
    }
  }

  return error instanceof Error ? error.message : 'Não foi possível sincronizar a presença.';
}
