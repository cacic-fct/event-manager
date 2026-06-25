import {
  OfflineEventAttendanceSubmission,
  OfflineEventAttendanceSubmissionStatus,
} from '@cacic-fct/shared-data-types';

export type OfflineSubmissionResponseSource = {
  id: string;
  clientId: string;
  eventId: string;
  event?: OfflineEventAttendanceSubmission['event'] | null;
  personId: string | null;
  person?: OfflineEventAttendanceSubmission['person'] | null;
  status: OfflineEventAttendanceSubmissionStatus;
  createdByMethod: OfflineEventAttendanceSubmission['createdByMethod'];
  scannerCode: string | null;
  manualValue: string | null;
  collectedAt: Date;
  authorUserId: string | null;
  authorName: string | null;
  authorEmail: string | null;
  submittedById: string;
  submittedAt: Date;
  stagedReason: string | null;
  resolutionError: string | null;
  collectedLatitude: number | null;
  collectedLongitude: number | null;
  collectedAccuracyMeters: number | null;
  committedAt: Date | null;
  committedById: string | null;
  rejectedAt: Date | null;
  rejectedById: string | null;
  rejectionReason: string | null;
};

export type OfflineSubmissionActor = {
  id: string;
  name: string | null;
};

export function offlineSubmissionActorIds(
  submissions: readonly OfflineSubmissionResponseSource[],
): string[] {
  return [
    ...new Set(
      submissions
        .flatMap((submission) => [
          submission.submittedById,
          submission.committedById,
          submission.rejectedById,
        ])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
}

export function offlineSubmissionActorNameMap(
  actors: readonly OfflineSubmissionActor[],
): Map<string, string | undefined> {
  return new Map(actors.map((actor) => [actor.id, actor.name ?? undefined]));
}

export function mapOfflineSubmissionForResponse(
  submission: OfflineSubmissionResponseSource,
  actorNameById: ReadonlyMap<string, string | undefined>,
): OfflineEventAttendanceSubmission {
  return {
    ...submission,
    event: submission.event ?? undefined,
    personId: submission.personId ?? undefined,
    person: submission.person ?? undefined,
    scannerCode: submission.scannerCode ?? undefined,
    manualValue: submission.manualValue ?? undefined,
    authorUserId: submission.authorUserId ?? undefined,
    authorName: submission.authorName ?? undefined,
    authorEmail: submission.authorEmail ?? undefined,
    submittedByFullName: actorNameById.get(submission.submittedById),
    stagedReason: submission.stagedReason ?? undefined,
    resolutionError: submission.resolutionError ?? undefined,
    collectedLatitude: submission.collectedLatitude ?? undefined,
    collectedLongitude: submission.collectedLongitude ?? undefined,
    collectedAccuracyMeters: submission.collectedAccuracyMeters ?? undefined,
    committedAt: submission.committedAt ?? undefined,
    committedById: submission.committedById ?? undefined,
    committedByFullName: submission.committedById ? actorNameById.get(submission.committedById) : undefined,
    rejectedAt: submission.rejectedAt ?? undefined,
    rejectedById: submission.rejectedById ?? undefined,
    rejectedByFullName: submission.rejectedById ? actorNameById.get(submission.rejectedById) : undefined,
    rejectionReason: submission.rejectionReason ?? undefined,
  };
}
