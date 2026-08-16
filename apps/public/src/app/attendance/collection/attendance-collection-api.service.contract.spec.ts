import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { createPublicEvent, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import {
  AttendanceCollectionApiService,
  AttendanceCollectionLocation,
  OfflineAttendanceCommitPayload,
} from './attendance-collection-api.service';

describe('AttendanceCollectionApiService GraphQL contracts', () => {
  let service: AttendanceCollectionApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AttendanceCollectionApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists collection events without inventing variables and preserves the API response', async () => {
    const result = firstValueFrom(service.listCollectionEvents());

    const request = http.expectOne('/api/graphql');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.query).toContain('query CurrentUserAttendanceCollectionEvents');
    expect(request.request.body.variables).toBeUndefined();

    const events = [{ eventId: 'event-1', event: createPublicEvent({ id: 'event-1', name: 'Evento' }) }];
    request.flush({ data: { currentUserAttendanceCollectionEvents: events } });

    await expect(result).resolves.toEqual(events);
  });

  it('lists the scanner feed with the event id variable', async () => {
    const result = firstValueFrom(service.listFeed('event-1'));

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('query CurrentUserAttendanceCollectionFeed');
    expect(request.request.body.variables).toEqual({ eventId: 'event-1' });

    const feed = [
      {
        personId: 'person-1',
        eventId: 'event-1',
        fullName: 'Pessoa',
        status: 'PRESENT' as const,
        createdByMethod: 'SCANNER' as const,
      },
    ];
    request.flush({ data: { currentUserAttendanceCollectionFeed: feed } });

    await expect(result).resolves.toEqual(feed);
  });

  it('lists the oral roster with the event id variable', async () => {
    const result = firstValueFrom(service.listOralRoster('event-oral'));

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('query CurrentUserAttendanceOralRoster');
    expect(request.request.body.variables).toEqual({ eventId: 'event-oral' });

    const roster = [
      {
        personId: 'person-1',
        eventId: 'event-oral',
        fullName: 'Pessoa',
        status: 'ABSENT' as const,
      },
    ];
    request.flush({ data: { currentUserAttendanceOralRoster: roster } });

    await expect(result).resolves.toEqual(roster);
  });

  it('sends scanner collection input including the complete location', async () => {
    const location: AttendanceCollectionLocation = {
      latitude: -22.12,
      longitude: -51.4,
      accuracyMeters: 12,
    };
    const result = firstValueFrom(service.registerScannerCode('event-1', 'QR-CODE', location));

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('mutation CollectCurrentUserAttendanceFromScannerCode');
    expect(request.request.body.variables).toEqual({ input: { eventId: 'event-1', code: 'QR-CODE', location } });

    const attendedAt = publicFixtureDateFromNow(0, 12);
    const attendance = {
      eventId: 'event-1',
      personId: 'person-1',
      attendedAt,
      category: 'NON_SUBSCRIBED' as const,
    };
    request.flush({ data: { collectCurrentUserAttendanceFromScannerCode: attendance } });

    await expect(result).resolves.toEqual(attendance);
  });

  it('sends manual collection input including the complete location', async () => {
    const location: AttendanceCollectionLocation = {
      latitude: -22.13,
      longitude: -51.41,
      accuracyMeters: 8,
    };
    const result = firstValueFrom(service.registerManual('event-1', '123456789', location));

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('mutation CollectCurrentUserManualAttendance');
    expect(request.request.body.variables).toEqual({ input: { eventId: 'event-1', value: '123456789', location } });

    const attendedAt = publicFixtureDateFromNow(0, 12);
    const attendance = {
      eventId: 'event-1',
      personId: 'person-1',
      attendedAt,
      category: 'REGULAR' as const,
    };
    request.flush({ data: { collectCurrentUserManualAttendance: attendance } });

    await expect(result).resolves.toEqual(attendance);
  });

  it('sends immutable offline commit items under the expected input envelope', async () => {
    const location: AttendanceCollectionLocation = {
      latitude: -22.14,
      longitude: -51.42,
      accuracyMeters: 20,
    };
    const item: OfflineAttendanceCommitPayload = {
      clientId: 'client-1',
      eventId: 'event-1',
      createdByMethod: 'MANUAL_INPUT',
      value: '123456789',
      location,
      collectedAt: publicFixtureDateFromNow(0, 12),
      authorUserId: 'collector-1',
      authorName: 'Coletor',
      authorEmail: 'coletor@example.test',
    };
    const items = Object.freeze([item]);
    const result = firstValueFrom(service.commitOfflineAttendances(items));

    const request = http.expectOne('/api/graphql');
    expect(request.request.body.query).toContain('mutation CommitCurrentUserOfflineAttendances');
    expect(request.request.body.variables).toEqual({ input: { attendances: items } });

    const commitResults = [
      {
        clientId: 'client-1',
        eventId: 'event-1',
        status: 'STAGED' as const,
        message: 'Aguardando processamento',
        stagedSubmission: { id: 'submission-1', eventId: 'event-1', status: 'PENDING' as const },
      },
    ];
    request.flush({ data: { commitCurrentUserOfflineAttendances: commitResults } });

    await expect(result).resolves.toEqual(commitResults);
    expect(items).toEqual([item]);
  });

  it('joins GraphQL errors into one actionable error', async () => {
    const result = firstValueFrom(service.listFeed('event-1'));
    const request = http.expectOne('/api/graphql');

    request.flush({ errors: [{ message: 'Não autorizado' }, { message: 'Evento encerrado' }] });

    await expect(result).rejects.toThrow('Não autorizado\nEvento encerrado');
  });

  it('rejects successful HTTP responses that omit GraphQL data', async () => {
    const result = firstValueFrom(service.listOralRoster('event-1'));
    const request = http.expectOne('/api/graphql');

    request.flush({});

    await expect(result).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});
