import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  createPublicEvent,
  createPublicMajorEvent,
  publicFixtureDateFromNow,
} from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom } from 'rxjs';
import { OnlineAttendanceApiService } from './online-attendance-api.service';

describe('OnlineAttendanceApiService', () => {
  let httpTesting: HttpTestingController;
  let service: OnlineAttendanceApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    httpTesting = TestBed.inject(HttpTestingController);
    service = TestBed.inject(OnlineAttendanceApiService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('opens a public walk-in attendance event without requiring an interest or subscription', async () => {
    const event = createPublicEvent({
      id: 'event-1', attendanceEligibility: 'ANYONE', shouldCollectAttendance: true, isOnlineAttendanceAllowed: true,
      onlineAttendanceStartDate: publicFixtureDateFromNow(-1), onlineAttendanceEndDate: publicFixtureDateFromNow(1),
      endDate: publicFixtureDateFromNow(1), majorEvent: null, majorEventId: null,
    });
    const result = firstValueFrom(service.getWalkInEvent(event.id));
    httpTesting.expectOne('/api/graphql').flush({ data: { publicEvent: event, currentUserEventAttendance: null } });
    await expect(result).resolves.toEqual({ eventId: event.id, event });
  });

  it('does not expose restricted events through the manual walk-in fallback', async () => {
    const event = createPublicEvent({
      attendanceEligibility: 'REGISTERED_ONLY', shouldCollectAttendance: true, isOnlineAttendanceAllowed: true,
      onlineAttendanceStartDate: publicFixtureDateFromNow(-1), onlineAttendanceEndDate: publicFixtureDateFromNow(1),
    });
    const result = firstValueFrom(service.getWalkInEvent(event.id));
    httpTesting.expectOne('/api/graphql').flush({ data: { publicEvent: event, currentUserEventAttendance: null } });
    await expect(result).resolves.toBeNull();
  });

  it('loads pending online attendance events with major-event context', async () => {
    const event = createPublicEvent({
      id: 'event-1',
      name: 'Evento aberto',
      startDate: publicFixtureDateFromNow(0, 12),
      majorEvent: createPublicMajorEvent({ id: 'major-1', name: 'Grande evento' }),
    });
    const pending = [
      {
        eventId: 'event-1',
        event,
      },
    ];
    const result = firstValueFrom(service.listPendingEvents());
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('query CurrentUserPendingOnlineAttendanceEvents');
    expect(request.request.body.query).toContain('currentUserPendingOnlineAttendanceEvents');
    expect(request.request.body.variables).toBeUndefined();
    request.flush({ data: { currentUserPendingOnlineAttendanceEvents: pending } });

    await expect(result).resolves.toEqual(pending);
  });

  it('confirms attendance with the selected event and normalized code payload', async () => {
    const attendedAt = publicFixtureDateFromNow(0, 12);
    const attendance = {
      eventId: 'event-1',
      attendedAt,
      createdAt: attendedAt,
    };
    const result = firstValueFrom(service.confirmAttendance('event-1', 'A1B2'));
    const request = httpTesting.expectOne('/api/graphql');

    expect(request.request.body.query).toContain('mutation ConfirmCurrentUserOnlineAttendance');
    expect(request.request.body.query).toContain('confirmCurrentUserOnlineAttendance');
    expect(request.request.body.variables).toEqual({ eventId: 'event-1', code: 'A1B2' });
    request.flush({ data: { confirmCurrentUserOnlineAttendance: attendance } });

    await expect(result).resolves.toEqual(attendance);
  });

  it('maps GraphQL validation errors from pending-event and confirmation requests', async () => {
    const pendingResult = firstValueFrom(service.listPendingEvents());
    httpTesting.expectOne('/api/graphql').flush({ errors: [{ message: 'Sessão expirada.' }] });
    await expect(pendingResult).rejects.toThrow('Sessão expirada.');

    const confirmationResult = firstValueFrom(service.confirmAttendance('event-1', '0000'));
    httpTesting.expectOne('/api/graphql').flush({
      errors: [{ message: 'Código inválido.' }, { message: 'A presença não foi registrada.' }],
    });

    await expect(confirmationResult).rejects.toThrow('Código inválido.\nA presença não foi registrada.');
  });

  it('rejects responses without GraphQL data', async () => {
    const result = firstValueFrom(service.confirmAttendance('event-1', 'A1B2'));
    httpTesting.expectOne('/api/graphql').flush({});

    await expect(result).rejects.toThrow('Resposta GraphQL sem dados.');
  });
});
