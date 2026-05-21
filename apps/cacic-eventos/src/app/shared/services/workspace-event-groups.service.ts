import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { Event, EventGroup, EventGroupInput } from '../../graphql/models';
import { WorkspaceEventsService } from './workspace-events.service';

const DEFAULT_EVENT_GROUP_EMOJI = '❔';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceEventGroupsService {
  private readonly api = inject(EventGroupApiService);
  private readonly eventsApi = inject(EventApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly eventsService = inject(WorkspaceEventsService);
  private readonly router = inject(Router);

  readonly eventGroups = signal<EventGroup[]>([]);
  readonly allEvents = signal<Event[]>([]);
  readonly selectedEventGroup = signal<EventGroup | null>(null);
  readonly eventGroupEvents = signal<Event[]>([]);
  readonly eventGroupEventSearchResults = signal<Event[]>([]);
  readonly selectedEventGroupHasMajorEventEvents = computed(() =>
    this.eventGroupEvents().some((eventItem) => eventItem.majorEventId),
  );
  readonly sortedEventGroups = computed(() => {
    const groups = this.eventGroups();
    const firstEventsByGroup = this.firstEventsByGroupId();

    return [...groups].sort((a, b) => {
      const aFirstEvent = firstEventsByGroup.get(a.id);
      const bFirstEvent = firstEventsByGroup.get(b.id);

      // Groups without events come first
      if (!aFirstEvent && !bFirstEvent) return 0;
      if (!aFirstEvent) return -1;
      if (!bFirstEvent) return 1;

      // Sort by start date descending
      const aDate = new Date(aFirstEvent.startDate).getTime();
      const bDate = new Date(bFirstEvent.startDate).getTime();
      return bDate - aDate;
    });
  });

  private readonly firstEventsByGroupId = computed(() => {
    const groups = this.eventGroups();
    const events = this.allEvents();
    const firstEventsByGroup = new Map<string, Event | undefined>();
    for (const group of groups) {
      firstEventsByGroup.set(group.id, this.getFirstEventForGroup(group.id, events));
    }
    return firstEventsByGroup;
  });

  readonly eventGroupForm = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    emoji: [DEFAULT_EVENT_GROUP_EMOJI],
    shouldIssueCertificate: [false],
    shouldIssueCertificateForNonPayingAttendees: [false],
    shouldIssueCertificateForNonSubscribedAttendees: [false],
    shouldIssueCertificateForEachEvent: [false],
    shouldIssuePartialCertificate: [false],
  });

  readonly eventGroupEventSearchForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

  constructor() {
    this.eventGroupForm.controls.shouldIssueCertificate.valueChanges.subscribe(() =>
      this.syncCertificateRuleControls(),
    );
    effect(() => {
      this.selectedEventGroupHasMajorEventEvents();
      this.syncCertificateRuleControls();
    });
  }

  async loadEventGroups(): Promise<void> {
    this.eventGroups.set(await firstValueFrom(this.api.listEventGroups({ take: 200 })));
    await this.refreshAllEvents();
    const selectedGroup = this.selectedEventGroup();
    if (selectedGroup) {
      const refreshed = this.eventGroups().find((group) => group.id === selectedGroup.id);
      if (refreshed) {
        this.selectedEventGroup.set(refreshed);
      }
    }
  }

  private async refreshAllEvents(): Promise<void> {
    this.allEvents.set(await firstValueFrom(this.eventsApi.listEvents({ take: 200 })));
  }

  async saveEventGroup(): Promise<void> {
    if (this.eventGroupForm.invalid) {
      this.eventGroupForm.markAllAsTouched();
      return;
    }

    const raw = this.eventGroupForm.getRawValue();
    const payload: EventGroupInput = {
      name: raw.name.trim(),
      emoji: raw.emoji.trim() || DEFAULT_EVENT_GROUP_EMOJI,
      shouldIssueCertificate: raw.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees:
        raw.shouldIssueCertificate && raw.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees:
        raw.shouldIssueCertificate && raw.shouldIssueCertificateForNonSubscribedAttendees,
      shouldIssueCertificateForEachEvent:
        raw.shouldIssueCertificate &&
        !this.selectedEventGroupHasMajorEventEvents() &&
        raw.shouldIssueCertificateForEachEvent,
      shouldIssuePartialCertificate: raw.shouldIssueCertificate && raw.shouldIssuePartialCertificate,
    };

    if (raw.id) {
      await firstValueFrom(this.api.updateEventGroup(raw.id, payload));
      this.snackbar.open('Grupo atualizado.', 'Fechar', { duration: 2500 });
    } else {
      await firstValueFrom(this.api.createEventGroup(payload));
      this.snackbar.open('Grupo criado.', 'Fechar', { duration: 2500 });
    }

    this.eventGroupForm.reset({
      id: '',
      name: '',
      emoji: DEFAULT_EVENT_GROUP_EMOJI,
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
    });
    this.syncCertificateRuleControls();
    await this.loadEventGroups();
    const selectedGroup = this.selectedEventGroup();
    if (selectedGroup) {
      await this.loadEventsForGroup(selectedGroup.id);
    }
  }

  startNewEventGroup(): void {
    void this.router.navigate(['/groups']);
    this.selectedEventGroup.set(null);
    this.eventGroupEvents.set([]);
    this.eventGroupEventSearchResults.set([]);
    this.eventGroupForm.reset({
      id: '',
      name: '',
      emoji: DEFAULT_EVENT_GROUP_EMOJI,
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
    });
    this.syncCertificateRuleControls();
    this.eventGroupEventSearchForm.reset({
      query: '',
    });
  }

  async pickEventGroup(group: EventGroup): Promise<void> {
    void this.router.navigate(['/groups', group.id]);
    this.populateEventGroupSelection(group);
  }

  async pickEventGroupById(groupId: string): Promise<void> {
    if (this.selectedEventGroup()?.id === groupId) {
      return;
    }

    const group = await firstValueFrom(this.api.getEventGroup(groupId));
    this.populateEventGroupSelection(group);
  }

  private populateEventGroupSelection(group: EventGroup): void {
    this.selectedEventGroup.set(group);
    this.eventGroupForm.reset({
      id: group.id,
      name: group.name,
      emoji: group.emoji || DEFAULT_EVENT_GROUP_EMOJI,
      shouldIssueCertificate: group.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees: group.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees: group.shouldIssueCertificateForNonSubscribedAttendees,
      shouldIssueCertificateForEachEvent: group.shouldIssueCertificateForEachEvent,
      shouldIssuePartialCertificate: group.shouldIssuePartialCertificate,
    });
    this.syncCertificateRuleControls();
    this.eventGroupEventSearchForm.reset({
      query: '',
    });
    this.eventGroupEventSearchResults.set([]);
    this.eventsService.eventGroupLookupForm.reset({
      query: group.name,
    });
    void this.loadEventsForGroup(group.id);
  }

  async deleteEventGroup(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteEventGroup(id));
    this.snackbar.open('Grupo excluído.', 'Fechar', { duration: 2500 });
    if (this.selectedEventGroup()?.id === id) {
      this.startNewEventGroup();
    }
    await this.loadEventGroups();
  }

  async searchEventsForSelectedGroup(): Promise<void> {
    const selectedGroup = this.selectedEventGroup();
    if (!selectedGroup) {
      return;
    }

    const query = this.eventGroupEventSearchForm.controls.query.value.trim();
    if (!query) {
      this.eventGroupEventSearchResults.set([]);
      return;
    }

    const events = await firstValueFrom(this.eventsApi.listEvents({ query, take: 20 }));
    this.eventGroupEventSearchResults.set(events.filter((eventItem) => eventItem.eventGroupId !== selectedGroup.id));
  }

  async addEventToSelectedGroup(eventItem: Event): Promise<void> {
    const selectedGroup = this.selectedEventGroup();
    if (!selectedGroup) {
      return;
    }

    await firstValueFrom(
      this.eventsApi.updateEvent(eventItem.id, {
        eventGroupId: selectedGroup.id,
        shouldIssueCertificate: selectedGroup.shouldIssueCertificate ? eventItem.shouldIssueCertificate : false,
        shouldIssueCertificateForNonPayingAttendees:
          selectedGroup.shouldIssueCertificate && selectedGroup.shouldIssueCertificateForNonPayingAttendees
            ? eventItem.shouldIssueCertificateForNonPayingAttendees
            : false,
        shouldIssueCertificateForNonSubscribedAttendees:
          selectedGroup.shouldIssueCertificate && selectedGroup.shouldIssueCertificateForNonSubscribedAttendees
            ? eventItem.shouldIssueCertificateForNonSubscribedAttendees
            : false,
      }),
    );
    await Promise.all([this.eventsService.loadEvents(), this.loadEventsForGroup(selectedGroup.id), this.refreshAllEvents()]);
  }

  async removeEventFromSelectedGroup(eventItem: Event): Promise<void> {
    const selectedGroup = this.selectedEventGroup();
    if (!selectedGroup) {
      return;
    }

    await firstValueFrom(
      this.eventsApi.updateEvent(eventItem.id, {
        eventGroupId: null,
      }),
    );
    await Promise.all([this.eventsService.loadEvents(), this.loadEventsForGroup(selectedGroup.id), this.refreshAllEvents()]);
  }

  private async loadEventsForGroup(groupId: string): Promise<void> {
    this.eventGroupEvents.set(
      await firstValueFrom(
        this.eventsApi.listEvents({
          eventGroupId: groupId,
          take: 200,
        }),
      ),
    );
    this.syncCertificateRuleControls();
  }

  getFirstEventForGroupDisplay(groupId: string): Event | undefined {
    return this.firstEventsByGroupId().get(groupId);
  }

  private getFirstEventForGroup(groupId: string, events: Event[]): Event | undefined {
    return events
      .filter((event) => event.eventGroupId === groupId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .at(0);
  }

  private syncCertificateRuleControls(): void {
    const shouldIssueCertificate = this.eventGroupForm.controls.shouldIssueCertificate.value;
    const forEachControl = this.eventGroupForm.controls.shouldIssueCertificateForEachEvent;
    const partialControl = this.eventGroupForm.controls.shouldIssuePartialCertificate;
    const nonPayingControl = this.eventGroupForm.controls.shouldIssueCertificateForNonPayingAttendees;
    const nonSubscribedControl = this.eventGroupForm.controls.shouldIssueCertificateForNonSubscribedAttendees;

    if (!shouldIssueCertificate) {
      nonPayingControl.setValue(false, { emitEvent: false });
      nonSubscribedControl.setValue(false, { emitEvent: false });
      forEachControl.setValue(false, { emitEvent: false });
      partialControl.setValue(false, { emitEvent: false });
      nonPayingControl.disable({ emitEvent: false });
      nonSubscribedControl.disable({ emitEvent: false });
      forEachControl.disable({ emitEvent: false });
      partialControl.disable({ emitEvent: false });
      return;
    }

    nonPayingControl.enable({ emitEvent: false });
    nonSubscribedControl.enable({ emitEvent: false });
    partialControl.enable({ emitEvent: false });

    if (this.selectedEventGroupHasMajorEventEvents()) {
      forEachControl.setValue(false, { emitEvent: false });
      forEachControl.disable({ emitEvent: false });
      return;
    }

    forEachControl.enable({ emitEvent: false });
  }
}
