import { Injectable, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
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

  readonly eventGroups = signal<EventGroup[]>([]);
  readonly selectedEventGroup = signal<EventGroup | null>(null);
  readonly eventGroupEvents = signal<Event[]>([]);
  readonly eventGroupEventSearchResults = signal<Event[]>([]);

  readonly eventGroupForm = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    emoji: [DEFAULT_EVENT_GROUP_EMOJI],
    shouldIssueCertificate: [false],
    shouldIssueCertificateForEachEvent: [false],
    shouldIssuePartialCertificate: [false],
  });

  readonly eventGroupEventSearchForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

  async loadEventGroups(): Promise<void> {
    this.eventGroups.set(
      await firstValueFrom(this.api.listEventGroups({ take: 200 })),
    );
    const selectedGroup = this.selectedEventGroup();
    if (selectedGroup) {
      const refreshed = this.eventGroups().find(
        (group) => group.id === selectedGroup.id,
      );
      if (refreshed) {
        this.selectedEventGroup.set(refreshed);
      }
    }
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
      shouldIssueCertificateForEachEvent:
        raw.shouldIssueCertificateForEachEvent,
      shouldIssuePartialCertificate: raw.shouldIssuePartialCertificate,
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
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
    });
    await this.loadEventGroups();
    const selectedGroup = this.selectedEventGroup();
    if (selectedGroup) {
      await this.loadEventsForGroup(selectedGroup.id);
    }
  }

  startNewEventGroup(): void {
    this.selectedEventGroup.set(null);
    this.eventGroupEvents.set([]);
    this.eventGroupEventSearchResults.set([]);
    this.eventGroupForm.reset({
      id: '',
      name: '',
      emoji: DEFAULT_EVENT_GROUP_EMOJI,
      shouldIssueCertificate: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
    });
    this.eventGroupEventSearchForm.reset({
      query: '',
    });
  }

  pickEventGroup(group: EventGroup): void {
    this.selectedEventGroup.set(group);
    this.eventGroupForm.reset({
      id: group.id,
      name: group.name,
      emoji: group.emoji || DEFAULT_EVENT_GROUP_EMOJI,
      shouldIssueCertificate: group.shouldIssueCertificate,
      shouldIssueCertificateForEachEvent:
        group.shouldIssueCertificateForEachEvent,
      shouldIssuePartialCertificate: group.shouldIssuePartialCertificate,
    });
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
      this.selectedEventGroup.set(null);
      this.eventGroupEvents.set([]);
      this.eventGroupEventSearchResults.set([]);
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

    const events = await firstValueFrom(
      this.eventsApi.listEvents({ query, take: 20 }),
    );
    this.eventGroupEventSearchResults.set(
      events.filter((eventItem) => eventItem.eventGroupId !== selectedGroup.id),
    );
  }

  async addEventToSelectedGroup(eventItem: Event): Promise<void> {
    const selectedGroup = this.selectedEventGroup();
    if (!selectedGroup) {
      return;
    }

    await firstValueFrom(
      this.eventsApi.updateEvent(eventItem.id, {
        eventGroupId: selectedGroup.id,
      }),
    );
    await Promise.all([
      this.eventsService.loadEvents(),
      this.loadEventsForGroup(selectedGroup.id),
    ]);
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
    await Promise.all([
      this.eventsService.loadEvents(),
      this.loadEventsForGroup(selectedGroup.id),
    ]);
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
  }
}
