import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { EventGroupInput } from '@cacic-fct/event-manager-admin-contracts';
import { PublicationApiService } from '../graphql/publishing-api.service';
import {
  createAdminEvent,
  createAdminEventGroup,
  createAdminEventSummary,
  createAdminMajorEvent,
} from '../testing/admin-entity-fixtures';
import { EventGroupsService } from './event-groups.service';
import { EventsService } from '../events/events.service';
import { PermissionsService } from '../permissions/permissions.service';

describe('EventGroupsService', () => {
  let service: EventGroupsService;
  let lastPayload: EventGroupInput | null;
  let api: {
    createEventGroup: ReturnType<typeof vi.fn>;
    updateEventGroup: ReturnType<typeof vi.fn>;
    listEventGroups: ReturnType<typeof vi.fn>;
    getEventGroup: ReturnType<typeof vi.fn>;
  };
  let eventApi: {
    listEventsSummary: ReturnType<typeof vi.fn>;
    listEvents: ReturnType<typeof vi.fn>;
    updateEvent: ReturnType<typeof vi.fn>;
  };
  let publicationApi: {
    setPublicationState: ReturnType<typeof vi.fn>;
  };
  let eventsService: {
    loadEvents: ReturnType<typeof vi.fn>;
    eventGroupLookupForm: { reset: ReturnType<typeof vi.fn> };
    majorEvents: ReturnType<typeof signal>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    lastPayload = null;
    api = {
      createEventGroup: vi.fn((payload: EventGroupInput) => {
        lastPayload = payload;
        return of(createAdminEventGroup({ id: 'event-group-1', ...payload }));
      }),
      updateEventGroup: vi.fn((id: string, payload: EventGroupInput) => {
        lastPayload = payload;
        return of(createAdminEventGroup({ id, ...payload }));
      }),
      listEventGroups: vi.fn(() => of([])),
      getEventGroup: vi.fn(() => of(createAdminEventGroup())),
    };
    eventApi = {
      listEventsSummary: vi.fn(() => of([])),
      listEvents: vi.fn(() => of([])),
      updateEvent: vi.fn(() => of({ id: 'event-1' })),
    };
    publicationApi = {
      setPublicationState: vi.fn(() => of({ ok: true })),
    };
    eventsService = {
      loadEvents: vi.fn(() => Promise.resolve()),
      eventGroupLookupForm: { reset: vi.fn() },
      majorEvents: signal([]),
    };
    router = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        EventGroupsService,
        { provide: EventGroupApiService, useValue: api },
        { provide: EventApiService, useValue: eventApi },
        { provide: PublicationApiService, useValue: publicationApi },
        { provide: EventsService, useValue: eventsService },
        { provide: PermissionsService, useValue: { hasAll: vi.fn(() => true) } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    service = TestBed.inject(EventGroupsService);
    service.eventGroupForm.patchValue({
      name: 'Trilha de Minicursos',
      emoji: 'school',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssueCertificateForEachEvent: true,
      shouldIssuePartialCertificate: true,
    });
  });

  it('publishes a saved group when it has linked events', async () => {
    service.eventGroupEvents.set([createAdminEvent({ id: 'event-1', eventGroupId: 'event-group-1' })]);

    await service.saveEventGroup('PUBLISH');

    expect(api.createEventGroup).toHaveBeenCalled();
    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'EVENT_GROUP',
      targetId: 'event-group-1',
      state: 'PUBLISHED',
    });
    expect(lastPayload).toMatchObject({
      name: 'Trilha de Minicursos',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
      shouldIssuePartialCertificate: true,
    });
  });

  it('keeps empty groups as saved drafts instead of publishing an empty set', async () => {
    await service.saveEventGroup('PUBLISH');

    expect(api.createEventGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Trilha de Minicursos' }));
    expect(publicationApi.setPublicationState).not.toHaveBeenCalled();
    expect(service.selectedEventGroup()).toBeNull();
  });

  it('persists independent interest and inherited attendance eligibility settings', async () => {
    service.eventGroupForm.patchValue({
      interestEnabled: true,
      attendanceEligibility: null,
    });

    await service.saveEventGroup('DRAFT');

    expect(lastPayload).toMatchObject({
      interestEnabled: true,
      attendanceEligibility: null,
    });
  });

  it('preserves invitation IDs when the API hides invitee details', async () => {
    const group = createAdminEventGroup({ audienceInvitations: [{ personId: 'private-person', person: null }] });
    await service.pickEventGroup(group);
    expect(service.eventGroupAudienceInvitations()).toEqual([{ id: 'private-person', name: 'Pessoa convidada (dados indisponíveis)', email: null, unresolved: true }]);
    await service.saveEventGroup('DRAFT');
    expect(lastPayload).toMatchObject({ invitationPersonIds: ['private-person'] });
  });

  it('serializes selected invitees for invitation-only groups', async () => {
    service.eventGroupForm.patchValue({ audience: 'PUBLIC' });
    service.setEventGroupAudienceInvitations([{ id: 'person-1', name: 'Ana', email: 'ana@example.com' }]);

    await service.saveEventGroup('DRAFT');

    expect(lastPayload).toMatchObject({
      audience: 'PUBLIC',
      audienceCourseCodes: [],
      invitationPersonIds: ['person-1'],
    });
  });

  it('keeps invitation-only attendance visible independently of access audience', async () => {
    service.eventGroupForm.patchValue({
      audience: 'PUBLIC',
      attendanceEligibility: 'INVITED_ONLY',
    });

    expect(service.shouldManageAttendanceInvitations()).toBe(true);
    expect(service.audiencePublicationBlocked()).toBe(true);
    await service.saveEventGroup('PUBLISH');
    expect(api.createEventGroup).not.toHaveBeenCalled();

    await service.saveEventGroup('DRAFT');
    expect(api.createEventGroup).toHaveBeenCalled();
  });

  it('reports an unavailable parent rule instead of assuming public access', () => {
    service.selectedEventGroup.set(createAdminEventGroup({ majorEventId: 'major-event-1' }));

    expect(service.audienceParentRestrictions()).toEqual([
      expect.objectContaining({
        audience: null,
        unavailable: true,
      }),
    ]);
  });

  it('uses linked event metadata to resolve an inherited parent rule', async () => {
    const majorEvent = createAdminMajorEvent({
      id: 'major-event-1',
      audience: 'UNESP_ONLY',
      attendanceEligibility: 'INVITED_ONLY',
    });
    const group = createAdminEventGroup({ majorEventId: majorEvent.id });
    eventApi.listEvents.mockReturnValueOnce(
      of([createAdminEvent({ eventGroupId: group.id, majorEventId: majorEvent.id, majorEvent })]),
    );

    await service.pickEventGroup(group);
    await Promise.resolve();

    expect(service.audienceParentRestrictions()).toEqual([
      expect.objectContaining({ audience: 'UNESP_ONLY', attendanceEligibility: 'INVITED_ONLY' }),
    ]);
    expect(service.shouldManageAttendanceInvitations()).toBe(true);
  });

  it('moves linked events back to draft when saving an existing group as draft', async () => {
    service.eventGroupForm.controls.id.setValue('event-group-1');
    service.selectedEventGroup.set(createAdminEventGroup({ id: 'event-group-1' }));
    service.eventGroupEvents.set([createAdminEvent({ id: 'event-1', eventGroupId: 'event-group-1' })]);

    await service.saveEventGroup('DRAFT');

    expect(api.updateEventGroup).toHaveBeenCalledWith(
      'event-group-1',
      expect.objectContaining({ name: 'Trilha de Minicursos' }),
    );
    expect(publicationApi.setPublicationState).toHaveBeenCalledWith({
      targetType: 'EVENT_GROUP',
      targetId: 'event-group-1',
      state: 'DRAFT',
    });
  });

  it('links events using the selected group certificate restrictions', async () => {
    const group = createAdminEventGroup({
      id: 'event-group-1',
      shouldIssueCertificate: false,
    });
    const event = createAdminEvent({
      id: 'event-1',
      shouldIssueCertificate: true,
    });
    service.selectedEventGroup.set(group);
    eventApi.listEventsSummary.mockReturnValue(of([createAdminEventSummary({ id: event.id, eventGroupId: group.id })]));

    await service.addEventToSelectedGroup(event);

    expect(eventApi.updateEvent).toHaveBeenCalledWith('event-1', {
      eventGroupId: 'event-group-1',
      shouldIssueCertificate: false,
    });
    expect(eventsService.loadEvents).toHaveBeenCalled();
  });

  it('searches event groups from the first page using the entered query', async () => {
    service.eventGroupsPagination.pageIndex.set(2);
    service.eventGroupsSearchForm.controls.query.setValue('minicursos', { emitEvent: false });

    await service.searchEventGroups();

    expect(api.listEventGroups).toHaveBeenCalledWith({ query: 'minicursos', skip: 0, take: 51 });
    expect(service.eventGroupsPagination.pageIndex()).toBe(0);
  });

  it('omits the query when loading the unfiltered event-group list', async () => {
    await service.loadEventGroups();

    expect(api.listEventGroups).toHaveBeenCalledWith({ skip: 0, take: 51 });
  });
});
