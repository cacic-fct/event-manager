import { AttendanceCreationMethod, OfflineEventAttendanceSubmissionStatus } from '@cacic-fct/shared-data-types';
import {
  mapOfflineSubmissionForResponse,
  offlineSubmissionActorIds,
  offlineSubmissionActorNameMap,
  OfflineSubmissionResponseSource,
} from './offline-submission-response';

describe('offline submission response helpers', () => {
  it('deduplicates actor ids while ignoring missing commit and rejection actors', () => {
    expect(
      offlineSubmissionActorIds([
        createSubmission({ submittedById: 'collector-1', committedById: 'reviewer-1' }),
        createSubmission({ submittedById: 'collector-1', rejectedById: 'reviewer-2' }),
      ]),
    ).toEqual(['collector-1', 'reviewer-1', 'reviewer-2']);
  });

  it('normalizes null actor names to undefined', () => {
    const names = offlineSubmissionActorNameMap([
      { id: 'collector-1', name: 'Ana Silva' },
      { id: 'reviewer-1', name: null },
    ]);

    expect(names.get('collector-1')).toBe('Ana Silva');
    expect(names.get('reviewer-1')).toBeUndefined();
  });

  it('maps optional submission fields and reviewer names for API responses', () => {
    const collectedAt = new Date('2026-07-07T12:00:00.000Z');
    const submittedAt = new Date('2026-07-07T12:01:00.000Z');
    const committedAt = new Date('2026-07-07T12:02:00.000Z');
    const actorNames = offlineSubmissionActorNameMap([
      { id: 'collector-1', name: 'Ana Silva' },
      { id: 'reviewer-1', name: 'Bruno Souza' },
    ]);

    expect(
      mapOfflineSubmissionForResponse(
        createSubmission({
          scannerCode: 'scanner-code',
          manualValue: 'manual-value',
          authorUserId: 'author-1',
          authorName: 'Autora',
          authorEmail: 'autora@example.com',
          collectedAt,
          submittedAt,
          stagedReason: 'Presença já registrada',
          collectedLatitude: -22.12,
          collectedLongitude: -51.4,
          collectedAccuracyMeters: 8,
          committedAt,
          committedById: 'reviewer-1',
        }),
        actorNames,
      ),
    ).toMatchObject({
      scannerCode: 'scanner-code',
      manualValue: 'manual-value',
      authorUserId: 'author-1',
      authorName: 'Autora',
      authorEmail: 'autora@example.com',
      submittedByFullName: 'Ana Silva',
      stagedReason: 'Presença já registrada',
      resolutionIssue: 'DUPLICATE_ATTENDANCE',
      collectedLatitude: -22.12,
      collectedLongitude: -51.4,
      collectedAccuracyMeters: 8,
      committedAt,
      committedById: 'reviewer-1',
      committedByFullName: 'Bruno Souza',
      rejectedAt: undefined,
      rejectedById: undefined,
      rejectedByFullName: undefined,
      rejectionReason: undefined,
    });
  });

  it('maps null optional submission fields to undefined for API responses', () => {
    expect(mapOfflineSubmissionForResponse(createSubmission(), new Map())).toMatchObject({
      event: undefined,
      personId: undefined,
      person: undefined,
      scannerCode: undefined,
      manualValue: undefined,
      authorUserId: undefined,
      authorName: undefined,
      authorEmail: undefined,
      submittedByFullName: undefined,
      stagedReason: undefined,
      resolutionError: undefined,
      resolutionIssue: 'UNKNOWN',
      collectedLatitude: undefined,
      collectedLongitude: undefined,
      collectedAccuracyMeters: undefined,
      committedAt: undefined,
      committedById: undefined,
      committedByFullName: undefined,
      rejectedAt: undefined,
      rejectedById: undefined,
      rejectedByFullName: undefined,
      rejectionReason: undefined,
    });
  });
});

function createSubmission(overrides: Partial<OfflineSubmissionResponseSource> = {}): OfflineSubmissionResponseSource {
  const collectedAt = new Date('2026-07-07T12:00:00.000Z');
  const submittedAt = new Date('2026-07-07T12:01:00.000Z');

  return {
    id: 'submission-1',
    clientId: 'client-1',
    eventId: 'event-1',
    event: null,
    personId: null,
    person: null,
    status: OfflineEventAttendanceSubmissionStatus.PENDING,
    createdByMethod: AttendanceCreationMethod.MANUAL,
    scannerCode: null,
    manualValue: null,
    collectedAt,
    authorUserId: null,
    authorName: null,
    authorEmail: null,
    submittedById: 'collector-1',
    submittedAt,
    stagedReason: null,
    resolutionError: null,
    collectedLatitude: null,
    collectedLongitude: null,
    collectedAccuracyMeters: null,
    committedAt: null,
    committedById: null,
    rejectedAt: null,
    rejectedById: null,
    rejectionReason: null,
    ...overrides,
  };
}
