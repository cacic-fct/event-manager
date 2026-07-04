import type {
  OfflineEventAttendanceCommitResult,
  OfflineEventAttendanceResolutionIssue,
} from '@cacic-fct/shared-data-types';
import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';

export type OfflineAttendanceResolution = {
  issue: OfflineEventAttendanceResolutionIssue;
  message: string;
  status: OfflineEventAttendanceCommitResult['status'];
  stageable: boolean;
};

export function classifyOfflineAttendanceError(error: unknown): OfflineAttendanceResolution {
  const message = errorMessage(error);
  const issue = classifyOfflineAttendanceMessage(message);

  if (issue === 'DUPLICATE_ATTENDANCE') {
    return { issue, message, status: 'DUPLICATE', stageable: false };
  }

  if (error instanceof ConflictException) {
    return { issue, message, status: 'CONFLICT', stageable: true };
  }

  if (error instanceof ForbiddenException) {
    return { issue, message, status: 'FORBIDDEN', stageable: true };
  }

  if (error instanceof BadRequestException || error instanceof NotFoundException) {
    return {
      issue,
      message,
      status: 'FAILED',
      stageable: isStageableBadRequestOrNotFound(issue),
    };
  }

  if (error instanceof HttpException && [400, 403, 404, 409].includes(error.getStatus())) {
    return { issue, message, status: error.getStatus() === 403 ? 'FORBIDDEN' : 'FAILED', stageable: true };
  }

  return { issue, message, status: 'FAILED', stageable: false };
}

export function classifyOfflineAttendanceMessage(
  message: string | null | undefined,
): OfflineEventAttendanceResolutionIssue {
  const normalized = message?.trim() ?? '';
  if (!normalized) {
    return 'UNKNOWN';
  }

  if (normalized.includes('Presença já registrada')) {
    return 'DUPLICATE_ATTENDANCE';
  }

  if (normalized.startsWith('Pessoa tem registros duplicados')) {
    return 'DUPLICATE_PERSON';
  }

  if (
    normalized.includes('Nenhuma pessoa encontrada') ||
    normalized.includes('Person for user') ||
    normalized.includes('was not found')
  ) {
    return 'PERSON_NOT_FOUND';
  }

  if (normalized.includes('Código Aztec incompatível')) {
    return 'INVALID_SCANNER_CODE';
  }

  if (normalized.includes('Origem da presença off-line incompatível')) {
    return 'UNSUPPORTED_METHOD';
  }

  if (normalized.includes('Localização precisa é obrigatória')) {
    return 'LOCATION_MISSING';
  }

  if (normalized.includes('Ative a localização precisa')) {
    return 'LOCATION_IMPRECISE';
  }

  if (normalized.includes('não está aberta')) {
    return 'COLLECTION_WINDOW_EXPIRED';
  }

  if (normalized.includes('congelad') || normalized.includes('bloquead')) {
    return 'EVENT_LOCKED';
  }

  if (normalized.includes('deleted') || normalized.includes('removido') || normalized.includes('removida')) {
    return 'EVENT_DELETED';
  }

  return 'UNKNOWN';
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

export function isRequiredLocationIssue(issue: OfflineEventAttendanceResolutionIssue): boolean {
  return issue === 'LOCATION_MISSING' || issue === 'LOCATION_IMPRECISE';
}

function isStageableBadRequestOrNotFound(issue: OfflineEventAttendanceResolutionIssue): boolean {
  return ['DUPLICATE_PERSON', 'INVALID_SCANNER_CODE', 'PERSON_NOT_FOUND', 'UNKNOWN'].includes(issue);
}
