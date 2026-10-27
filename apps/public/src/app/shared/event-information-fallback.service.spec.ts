import { TestBed } from '@angular/core/testing';
import { AuthService } from '@cacic-fct/shared-angular';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import { createParticipationInformationFixture } from '@cacic-fct/event-manager-public-testing';
import { firstValueFrom, of } from 'rxjs';
import { AttendancesApiService } from '../profile/attendance/attendances-api.service';
import { NetworkStatusService } from './network-status.service';
import { EventInformationFallbackService } from './event-information-fallback.service';

const unavailable = new Error('Public catalog unavailable');

describe('EventInformationFallbackService', () => {
  const data = createParticipationInformationFixture();
  const getAttendanceDetail = vi.fn();
  const getEventDetails = vi.fn();
  const getMajorEventDetails = vi.fn();
  const getEventGroupDetails = vi.fn();
  let userId: string | null;
  let online: boolean;
  let service: EventInformationFallbackService;

  beforeEach(() => {
    vi.resetAllMocks();
    userId = 'participant';
    online = true;
    getAttendanceDetail.mockResolvedValue(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user: () => (userId ? { sub: userId } : null) } },
        { provide: PublicDataAccessService, useValue: { getAttendanceDetail } },
        { provide: AttendancesApiService, useValue: { getEventDetails, getMajorEventDetails, getEventGroupDetails } },
        { provide: NetworkStatusService, useValue: { isOnline: () => online } },
      ],
    });
    service = TestBed.inject(EventInformationFallbackService);
  });

  it('restores the current user’s saved event and attendance without network requests', async () => {
    online = false;
    getAttendanceDetail.mockResolvedValue({
      eventType: 'event',
      details: {
        subscription: data.eventSubscription(data.events[0]),
        attendance: null,
      },
    });
    const result = await firstValueFrom(service.eventPage(data.targetId, unavailable));
    expect(result.event.id).toBe(data.targetId);
    expect(result.currentUserSubscription?.eventId).toBe(data.targetId);
    expect(result.subscriptionSummary.hasAvailableSlots).toBe(false);
    expect(getAttendanceDetail).toHaveBeenCalledWith('participant', 'event', data.targetId);
    expect(getEventDetails).not.toHaveBeenCalled();
  });

  it('recovers a certificate-only historical event from authorized private data', async () => {
    getEventDetails.mockReturnValue(
      of({ subscription: null, event: data.events[0], attendance: null, hasIssuedCertificate: true }),
    );
    expect((await firstValueFrom(service.eventPage(data.targetId, unavailable))).event).toEqual(data.events[0]);
  });

  it('does not treat a public event with no participation as a private fallback', async () => {
    getEventDetails.mockReturnValue(of({ subscription: null, event: data.events[0], attendance: null }));
    await expect(firstValueFrom(service.eventPage(data.targetId, unavailable))).rejects.toBe(unavailable);
  });

  it('does not read another account’s cached details for a guest', async () => {
    userId = null;
    await expect(firstValueFrom(service.eventPage(data.targetId, unavailable))).rejects.toBe(unavailable);
    expect(getAttendanceDetail).not.toHaveBeenCalled();
    expect(getEventDetails).not.toHaveBeenCalled();
  });

  it('restores a saved major event and its selected activities', async () => {
    const major = createParticipationInformationFixture({ targetType: 'major-event' });
    getAttendanceDetail.mockResolvedValue({
      eventType: 'major-event',
      details: {
        subscription: major.subscription,
        attendances: [],
      },
    });
    const result = await firstValueFrom(service.majorEvent(major.targetId, unavailable));
    expect(result.event).toEqual(major.majorEvent);
    expect(result.details.subscription?.selectedEvents).toHaveLength(3);
  });

  it('restores an attendance-only event group from the current account’s saved details', async () => {
    const group = createParticipationInformationFixture({
      targetType: 'event-group',
      subscribed: false,
      attended: true,
    });
    getAttendanceDetail.mockResolvedValue({
      eventType: 'event-group',
      details: {
        subscription: null,
        eventGroup: group.eventGroup,
        events: group.events,
        attendances: group.attendances,
      },
    });
    const result = await firstValueFrom(service.eventGroup(group.targetId, unavailable));
    expect(result.group).toEqual(group.eventGroup);
    expect(result.events).toHaveLength(3);
    expect(getEventGroupDetails).not.toHaveBeenCalled();
  });

  it('still loads authorized data when the browser cache fails', async () => {
    getAttendanceDetail.mockRejectedValue(new Error('Storage unavailable'));
    getMajorEventDetails.mockReturnValue(
      of({ subscription: null, majorEvent: data.majorEvent, attendances: [], isLecturer: true }),
    );
    expect((await firstValueFrom(service.majorEvent(data.majorEvent.id, unavailable))).event).toEqual(data.majorEvent);
  });
});
