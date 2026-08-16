import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { FakeEventSource, installFakeEventSource } from '@cacic-fct/shared-angular/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import {
  adminFixtureDate,
  adminFixtureDateFromNow,
  createAdminEvent,
  createAdminEventAttendance,
  createAdminMajorEvent,
  createAdminMajorEventUserAttendance,
  createAdminOfflineEventAttendanceSubmission,
  createAdminPerson,
} from '../testing/admin-entity-fixtures';
import { AttendanceApiService } from './attendance-api.service';
import { GraphqlHttpService } from './graphql-http.service';

describe('AttendanceApiService operation contracts', () => {
  let graphqlHttp: { request: ReturnType<typeof vi.fn> };
  let service: AttendanceApiService;

  beforeEach(() => {
    graphqlHttp = {
      request: vi.fn((query: string) => {
        if (query.includes('EventAttendanceOralRoster')) {
          return of({ eventAttendanceOralRoster: [attendanceFixture()] });
        }
        if (query.includes('SetEventOralAttendances')) {
          return of({ setEventOralAttendances: [attendanceFixture()] });
        }
        if (query.includes('EventAttendanceAnalytics')) {
          return of({ eventAttendanceAnalytics: analyticsFixture() });
        }
        if (query.includes('AttendanceReviewEventSummaries')) {
          return of({ attendanceReviewEventSummaries: [reviewSummaryFixture()] });
        }
        if (query.includes('ReviewAttendanceFlag')) {
          return of({ reviewAttendanceFlag: reviewItemFixture() });
        }
        if (query.includes('CreateEventAttendanceFromScannerCode')) {
          return of({ createEventAttendanceFromScannerCode: attendanceFixture() });
        }
        if (query.includes('CreateEventAttendanceFromManualInput')) {
          return of({ createEventAttendanceFromManualInput: attendanceFixture() });
        }
        if (query.includes('CreateEventAttendanceFromAztecCode')) {
          return of({ createEventAttendanceFromAztecCode: attendanceFixture() });
        }
        if (query.includes('ImportEventAttendancesFromCsv')) {
          return of({ importEventAttendancesFromCsv: csvImportFixture() });
        }
        if (query.includes('ImportMajorEventSubscriptionsFromCsv')) {
          return of({ importMajorEventSubscriptionsFromCsv: majorCsvImportFixture() });
        }
        if (query.includes('ListEventAttendances')) {
          return of({ eventAttendances: [attendanceFixture()] });
        }
        if (query.includes('EventAttendanceCount')) {
          return of({ eventAttendanceCount: 4 });
        }
        if (query.includes('OfflineEventAttendanceSubmissions')) {
          return of({ offlineEventAttendanceSubmissions: [offlineSubmissionFixture()] });
        }
        if (query.includes('UpdateOfflineEventAttendanceSubmission')) {
          return of({ updateOfflineEventAttendanceSubmission: offlineSubmissionFixture() });
        }
        if (query.includes('ApproveOfflineEventAttendanceSubmissions')) {
          return of({ approveOfflineEventAttendanceSubmissions: [offlineSubmissionFixture()] });
        }
        if (query.includes('ApproveOfflineEventAttendanceSubmission')) {
          return of({ approveOfflineEventAttendanceSubmission: offlineSubmissionFixture() });
        }
        if (query.includes('RejectOfflineEventAttendanceSubmissions')) {
          return of({ rejectOfflineEventAttendanceSubmissions: [offlineSubmissionFixture()] });
        }
        if (query.includes('RejectOfflineEventAttendanceSubmission')) {
          return of({ rejectOfflineEventAttendanceSubmission: offlineSubmissionFixture() });
        }
        if (query.includes('EventAttendanceScannerFeed')) {
          return of({ eventAttendanceScannerFeed: [scannerFeedFixture()] });
        }
        if (query.includes('ListMajorEventUserAttendances')) {
          return of({ majorEventUserAttendances: [majorEventAttendanceFixture()] });
        }
        return of({ createEventAttendanceFromManualInput: attendanceFixture() });
      }),
    };

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), AttendanceApiService, { provide: GraphqlHttpService, useValue: graphqlHttp }],
    });

    service = TestBed.inject(AttendanceApiService);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('maps oral roster, analytics, review, and collector GraphQL operations', async () => {
    const eventId = 'event / 1';
    const oralInputs = [
      {
        eventId,
        personId: 'person-1',
        status: 'PRESENT',
        collectedAt: adminFixtureDate,
        collectedByUserId: 'collector-1',
      },
    ] as const;
    const scannerInput = { eventId, code: 'AZTEC-123' };
    const manualInput = { eventId, value: 'Ada Lovelace', personId: 'person-1' };

    await expect(firstValueFrom(service.listEventAttendanceOralRoster(eventId))).resolves.toEqual([attendanceFixture()]);
    await expect(firstValueFrom(service.setEventOralAttendances(oralInputs))).resolves.toEqual([attendanceFixture()]);
    await expect(firstValueFrom(service.getEventAttendanceAnalytics(eventId, 30))).resolves.toEqual(analyticsFixture());
    await expect(firstValueFrom(service.listAttendanceReviewEventSummaries())).resolves.toEqual([reviewSummaryFixture()]);
    await expect(
      firstValueFrom(service.reviewAttendanceFlag('flag-1', eventId, 'RESOLVED', 'Reviewed by admin')),
    ).resolves.toEqual(
      reviewItemFixture(),
    );
    await expect(firstValueFrom(service.createEventAttendanceFromScannerCode(scannerInput))).resolves.toEqual(
      attendanceFixture(),
    );
    await expect(firstValueFrom(service.createEventAttendanceFromManualInput(manualInput))).resolves.toEqual(
      attendanceFixture(),
    );

    expect(graphqlHttp.request).toHaveBeenNthCalledWith(1, expect.stringContaining('query EventAttendanceOralRoster'), {
      eventId,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(2, expect.stringContaining('mutation SetEventOralAttendances'), {
      inputs: oralInputs,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(3, expect.stringContaining('query EventAttendanceAnalytics'), {
      eventId,
      windowMinutes: 30,
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(4, expect.stringContaining('query AttendanceReviewEventSummaries'));
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(5, expect.stringContaining('mutation ReviewAttendanceFlag'), {
      flagId: 'flag-1',
      eventId,
      status: 'RESOLVED',
      note: 'Reviewed by admin',
    });
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('mutation CreateEventAttendanceFromScannerCode'),
      { input: scannerInput },
    );
    expect(graphqlHttp.request).toHaveBeenNthCalledWith(
      7,
      expect.stringContaining('mutation CreateEventAttendanceFromManualInput'),
      { input: manualInput },
    );

    const oralRosterQuery = graphqlHttp.request.mock.calls[0][0] as string;
    expect(oralRosterQuery).toContain('eventAttendanceOralRoster');
    expect(oralRosterQuery).toContain('personId');
    const analyticsQuery = graphqlHttp.request.mock.calls[2][0] as string;
    expect(analyticsQuery).toContain('pendingOfflineCount');
    expect(analyticsQuery).toContain('reviewItems');
    const reviewQuery = graphqlHttp.request.mock.calls[4][0] as string;
    expect(reviewQuery).toContain('reviewAttendanceFlag');
    expect(reviewQuery).toContain('deepLink');
  });

  it('propagates GraphQL errors from the attendance operation boundary', async () => {
    const error = new Error('attendance operation failed');
    graphqlHttp.request.mockReturnValueOnce(throwError(() => error));

    await expect(firstValueFrom(service.reviewAttendanceFlag('flag-1', 'event-1', 'DISMISSED'))).rejects.toBe(error);
  });

  it('maps attendance imports, listings, offline decisions, scanner feed, and major-event reads', async () => {
    const eventId = 'event-1';
    const offlineInput = { createdByMethod: 'MANUAL_INPUT' as const, manualValue: 'ada@example.com' };
    const eventCsvInput = {
      eventId,
      csvContent: 'email\nada@example.com',
      selectedHeader: 'email',
    };
    const majorCsvInput = {
      majorEventId: 'major-event-1',
      csvContent: 'email\nevent@example.com',
      subscriptionStatus: 'CONFIRMED' as const,
      columnMapping: { subscribedEventIdsHeader: 'events' },
    };

    await expect(
      firstValueFrom(service.createEventAttendanceFromAztecCode({ eventId, code: 'AZTEC-1' })),
    ).resolves.toEqual(attendanceFixture());
    await expect(firstValueFrom(service.importEventAttendancesFromCsv(eventCsvInput))).resolves.toEqual(
      csvImportFixture(),
    );
    await expect(firstValueFrom(service.importMajorEventSubscriptionsFromCsv(majorCsvInput))).resolves.toEqual(
      majorCsvImportFixture(),
    );
    await expect(
      firstValueFrom(service.listEventAttendances(eventId, { status: 'PRESENT', skip: 2, take: 10 })),
    ).resolves.toEqual([attendanceFixture()]);
    await expect(firstValueFrom(service.getEventAttendanceCount(eventId, 'PRESENT'))).resolves.toBe(4);
    await expect(firstValueFrom(service.listOfflineEventAttendanceSubmissions(eventId))).resolves.toEqual([
      offlineSubmissionFixture(),
    ]);
    await expect(firstValueFrom(service.updateOfflineEventAttendanceSubmission('offline-1', offlineInput))).resolves.toEqual(
      offlineSubmissionFixture(),
    );
    await expect(firstValueFrom(service.approveOfflineEventAttendanceSubmission('offline-1'))).resolves.toEqual(
      offlineSubmissionFixture(),
    );
    await expect(firstValueFrom(service.approveOfflineEventAttendanceSubmissions(['offline-1', 'offline-2']))).resolves.toEqual([
      offlineSubmissionFixture(),
    ]);
    await expect(firstValueFrom(service.rejectOfflineEventAttendanceSubmission('offline-1', 'Sem correspondência'))).resolves.toEqual(
      offlineSubmissionFixture(),
    );
    await expect(firstValueFrom(service.rejectOfflineEventAttendanceSubmissions(['offline-1'], null))).resolves.toEqual([
      offlineSubmissionFixture(),
    ]);
    await expect(firstValueFrom(service.listEventAttendanceScannerFeed(eventId))).resolves.toEqual([scannerFeedFixture()]);
    await expect(
      firstValueFrom(service.listMajorEventUserAttendances('major-event-1', { personId: 'person-1', skip: 1, take: 10 })),
    ).resolves.toEqual([majorEventAttendanceFixture()]);

    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation CreateEventAttendanceFromAztecCode'),
      { eventId, code: 'AZTEC-1' },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation ImportEventAttendancesFromCsv'),
      { input: eventCsvInput },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation ImportMajorEventSubscriptionsFromCsv'),
      { input: majorCsvInput },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('query ListEventAttendances'),
      { eventId, status: 'PRESENT', skip: 2, take: 10 },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('query EventAttendanceCount'),
      { eventId, status: 'PRESENT' },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation UpdateOfflineEventAttendanceSubmission'),
      { submissionId: 'offline-1', input: offlineInput },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation ApproveOfflineEventAttendanceSubmission'),
      { submissionId: 'offline-1' },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation ApproveOfflineEventAttendanceSubmissions'),
      { submissionIds: ['offline-1', 'offline-2'] },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation RejectOfflineEventAttendanceSubmission'),
      { submissionId: 'offline-1', reason: 'Sem correspondência' },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('mutation RejectOfflineEventAttendanceSubmissions'),
      { submissionIds: ['offline-1'], reason: null },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('query EventAttendanceScannerFeed'),
      { eventId },
    );
    expect(graphqlHttp.request).toHaveBeenCalledWith(
      expect.stringContaining('query ListMajorEventUserAttendances'),
      { majorEventId: 'major-event-1', personId: 'person-1', skip: 1, take: 10 },
    );
  });

  it('watches analytics for an encoded event and requested time window', async () => {
    installFakeEventSource();
    const analytics = firstValueFrom(service.watchEventAttendanceAnalytics('event / 1', 120));
    const source = FakeEventSource.instances[0] as FakeEventSource;

    expect(source.url).toBe('/api/event-attendances/events/event%20%2F%201/analytics/events?windowMinutes=120');
    expect(source.init).toEqual({ withCredentials: true });
    source.emitMessage({ type: 'event-attendance-analytics', snapshot: analyticsFixture(120) });

    await expect(analytics).resolves.toEqual(analyticsFixture(120));
    expect(source.close).toHaveBeenCalledOnce();
  });
});

function attendanceFixture() {
  return createAdminEventAttendance(
    {},
    createAdminPerson({ id: 'person-1', name: 'Ada Lovelace' }),
    createAdminEvent({ id: 'event-1', name: 'Credenciamento' }),
  );
}

function offlineSubmissionFixture() {
  return createAdminOfflineEventAttendanceSubmission(
    { id: 'offline-1', eventId: 'event-1' },
    createAdminEvent({ id: 'event-1', name: 'Credenciamento' }),
    createAdminPerson({ id: 'person-1', name: 'Ada Lovelace' }),
  );
}

function majorEventAttendanceFixture() {
  return createAdminMajorEventUserAttendance(
    { majorEventId: 'major-event-1' },
    createAdminPerson({ id: 'person-1', name: 'Ada Lovelace' }),
    createAdminMajorEvent({ id: 'major-event-1', name: 'Semana' }),
  );
}

function scannerFeedFixture() {
  return { eventId: 'event-1', personId: 'person-1', status: 'PRESENT' };
}

function csvImportFixture() {
  return {
    createdCount: 1,
    duplicateCount: 0,
    failedCount: 0,
    failedValues: [],
    inferredMatchType: 'EMAIL',
    ambiguousValues: [],
  };
}

function majorCsvImportFixture() {
  return {
    createdSubscriptionCount: 1,
    updatedSubscriptionCount: 0,
    duplicateCount: 0,
    createdPeopleCount: 0,
    failedCount: 0,
    failedRows: [],
    createdPeople: [],
  };
}

function analyticsFixture(windowMinutes = 30) {
  return {
    eventId: 'event-1',
    eventName: 'Evento',
    windowMinutes,
    presentCount: 1,
    noShowCount: 0,
    pendingReviewCount: 0,
    pendingOfflineCount: 0,
    reviewItems: [],
  };
}

function reviewSummaryFixture() {
  return {
    eventId: 'event-1',
    eventName: 'Evento',
    emoji: '🎫',
    pendingCount: 1,
    startDate: adminFixtureDate,
  };
}

function reviewItemFixture() {
  return {
    id: 'flag-1',
    eventId: 'event-1',
    kind: 'DUPLICATE_SCAN',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    title: 'Duplicate scan',
    summary: 'Duplicate scan detected',
    detectedAt: adminFixtureDateFromNow(-1),
    deepLink: '/admin/attendances/event-1',
  };
}
