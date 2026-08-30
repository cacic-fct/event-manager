import { Service } from '@angular/core';
import { watchReplayableEventSource, watchReplayableEventSourcePing } from '@cacic-fct/shared-angular';
import type { Observable } from 'rxjs';

export type SportsOperationsApplicationRealtimeReason =
  | 'SUBMITTED'
  | 'REVIEWED'
  | 'RECEIPT_UPLOADED'
  | 'PAYMENT_APPROVED'
  | 'PAYMENT_REJECTED'
  | 'PAYMENT_REVIEW_UNDONE';

export type SportsOperationsApplicationInvalidation =
  | {
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED';
      applicationId: string;
      tournamentId: string;
      reason: SportsOperationsApplicationRealtimeReason;
      status?: string;
      paymentTier?: string | null;
      occurredAt?: string;
    }
  | {
      type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED';
      tournamentId: string;
      subscriptionId: string;
      reason: SportsOperationsApplicationRealtimeReason;
      subscriptionStatus: string;
      participantStatus: string;
      paymentStatus: string;
      applications: Array<{ id: string; status: string }>;
      occurredAt: string;
    };

const SPORTS_APPLICATION_STREAM_URL = '/api/sports/applications/current/events';
const SPORTS_APPLICATION_STREAM_ERROR = 'Não foi possível acompanhar sua inscrição esportiva em tempo real.';
const APPLICATION_EVENT_TYPE = 'SPORTS_PLAYER_APPLICATION_CHANGED';
const PAYMENT_EVENT_TYPE = 'SPORTS_PARTICIPANT_PAYMENT_CHANGED';
const APPLICATION_REASONS = new Set<SportsOperationsApplicationRealtimeReason>([
  'SUBMITTED',
  'REVIEWED',
  'RECEIPT_UPLOADED',
  'PAYMENT_APPROVED',
  'PAYMENT_REJECTED',
  'PAYMENT_REVIEW_UNDONE',
]);

@Service()
export class SportsOperationsRealtimeService {
  watchCurrentUserApplications(): Observable<SportsOperationsApplicationInvalidation> {
    return watchReplayableEventSource(SPORTS_APPLICATION_STREAM_URL, {
      decode: (event) => decodeSportsOperationsApplicationInvalidation(event),
      errorMessage: SPORTS_APPLICATION_STREAM_ERROR,
    });
  }

  watchRepresentativeTeam(teamId: string): Observable<void> {
    return watchReplayableEventSourcePing(
      `/api/sports/teams/${encodeURIComponent(teamId)}/representative-events`,
      'Não foi possível manter a equipe atualizada em tempo real.',
    );
  }
}

function decodeSportsOperationsApplicationInvalidation(
  event: MessageEvent<string>,
): SportsOperationsApplicationInvalidation | null {
  const parsed: unknown = JSON.parse(event.data);
  if (!isRecord(parsed) || typeof parsed['type'] !== 'string') {
    return null;
  }

  if (parsed['type'] === APPLICATION_EVENT_TYPE) {
    const applicationId = readRequiredString(parsed['applicationId']);
    const tournamentId = readRequiredString(parsed['tournamentId']);
    const reason = readReason(parsed['reason']);
    if (typeof applicationId !== 'string' || !applicationId || !tournamentId || !reason) {
      return null;
    }

    const status = readOptionalString(parsed['status']);
    const paymentTier = readOptionalStringOrNull(parsed['paymentTier']);
    const occurredAt = readOptionalString(parsed['occurredAt']);
    if (status === undefined && parsed['status'] !== undefined) {
      return null;
    }
    if (paymentTier === undefined && parsed['paymentTier'] !== undefined && parsed['paymentTier'] !== null) {
      return null;
    }
    if (occurredAt === undefined && parsed['occurredAt'] !== undefined) {
      return null;
    }

    return {
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId,
      tournamentId,
      reason,
      ...(status === undefined ? {} : { status }),
      ...(paymentTier === undefined ? {} : { paymentTier }),
      ...(occurredAt === undefined ? {} : { occurredAt }),
    };
  }

  if (parsed['type'] !== PAYMENT_EVENT_TYPE) {
    return null;
  }

  const subscriptionId = readRequiredString(parsed['subscriptionId']);
  const tournamentId = readRequiredString(parsed['tournamentId']);
  const reason = readReason(parsed['reason']);
  const subscriptionStatus = readRequiredString(parsed['subscriptionStatus']);
  const participantStatus = readRequiredString(parsed['participantStatus']);
  const paymentStatus = readRequiredString(parsed['paymentStatus']);
  const occurredAt = readRequiredString(parsed['occurredAt']);
  const applications = readApplications(parsed['applications']);
  if (
    typeof subscriptionId !== 'string' ||
    !subscriptionId ||
    !tournamentId ||
    !reason ||
    !subscriptionStatus ||
    !participantStatus ||
    !paymentStatus ||
    !occurredAt ||
    !applications
  ) {
    return null;
  }

  return {
    type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
    tournamentId,
    subscriptionId,
    reason,
    subscriptionStatus,
    participantStatus,
    paymentStatus,
    applications,
    occurredAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRequiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function readOptionalStringOrNull(value: unknown): string | null | undefined {
  return value === null ? null : readOptionalString(value);
}

function readReason(value: unknown): SportsOperationsApplicationRealtimeReason | null {
  return typeof value === 'string' && APPLICATION_REASONS.has(value as SportsOperationsApplicationRealtimeReason)
    ? (value as SportsOperationsApplicationRealtimeReason)
    : null;
}

function readApplications(value: unknown): Array<{ id: string; status: string }> | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const applications = value.map((application) => {
    if (!isRecord(application)) {
      return null;
    }
    const id = readRequiredString(application['id']);
    const status = readRequiredString(application['status']);
    return id && status ? { id, status } : null;
  });
  return applications.every((application): application is { id: string; status: string } => application !== null)
    ? applications
    : null;
}
