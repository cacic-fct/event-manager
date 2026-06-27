import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { EventGroupInput } from '../../graphql/models';
import { PublicationApiService } from '../../graphql/publishing-api.service';
import {
  createAdminEvent,
  createAdminEventGroup,
  createAdminEventSummary,
} from '../../testing/admin-entity-fixtures';
import { WorkspaceEventGroupsService } from './workspace-event-groups.service';
import { WorkspaceEventsService } from './workspace-events.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';

describe('WorkspaceEventGroupsService', () => {
  let service: WorkspaceEventGroupsService;
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
    };
    router = {
      navigate: vi.fn(),
    };

    await TestBed.configureTestingModule({
      providers: [
        WorkspaceEventGroupsService,
        { provide: EventGroupApiService, useValue: api },
        { provide: EventApiService, useValue: eventApi },
        { provide: PublicationApiService, useValue: publicationApi },
        { provide: WorkspaceEventsService, useValue: eventsService },
        { provide: WorkspacePermissionsService, useValue: { hasAll: vi.fn(() => true) } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: Router, useValue: router },
      ],
    }).compileComponents();

    service = TestBed.inject(WorkspaceEventGroupsService);
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
      shouldIssuePartialCertificate: true,
    });
  });

  it('keeps empty groups as saved drafts instead of publishing an empty set', async () => {
    await service.saveEventGroup('PUBLISH');

    expect(api.createEventGroup).toHaveBeenCalledWith(expect.objectContaining({ name: 'Trilha de Minicursos' }));
    expect(publicationApi.setPublicationState).not.toHaveBeenCalled();
    expect(service.selectedEventGroup()).toBeNull();
  });

  it('moves linked events back to draft when saving an existing group as draft', async () => {
    service.eventGroupForm.controls.id.setValue('event-group-1');
    service.selectedEventGroup.set(createAdminEventGroup({ id: 'event-group-1' }));
    service.eventGroupEvents.set([createAdminEvent({ id: 'event-1', eventGroupId: 'event-group-1' })]);

    await service.saveEventGroup('DRAFT');

    expect(api.updateEventGroup).toHaveBeenCalledWith('event-group-1', expect.objectContaining({ name: 'Trilha de Minicursos' }));
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
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    });
    const event = createAdminEvent({
      id: 'event-1',
      shouldIssueCertificate: true,
      shouldIssueCertificateForNonPayingAttendees: true,
      shouldIssueCertificateForNonSubscribedAttendees: true,
    });
    service.selectedEventGroup.set(group);
    eventApi.listEventsSummary.mockReturnValue(of([createAdminEventSummary({ id: event.id, eventGroupId: group.id })]));

    await service.addEventToSelectedGroup(event);

    expect(eventApi.updateEvent).toHaveBeenCalledWith('event-1', {
      eventGroupId: 'event-group-1',
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
    });
    expect(eventsService.loadEvents).toHaveBeenCalled();
  });
});
