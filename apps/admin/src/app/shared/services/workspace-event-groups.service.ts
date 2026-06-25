import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { PublicationApiService } from '../../graphql/publishing-api.service';
import { Event, EventGroup, EventGroupInput, EventSummary } from '../../graphql/models';
import { CloneAssetDialogComponent, CloneAssetDialogResult } from '../../workspace/dialogs/clone-asset-dialog.component';
import { getErrorMessage } from '../error-message';
import { WorkspaceEventsService } from './workspace-events.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';

const DEFAULT_EVENT_GROUP_EMOJI = '❔';
const DEFAULT_DRAFT_EVENT_GROUP_NAME = 'Grupo sem título';
type CreationPublicationAction = 'DRAFT' | 'PUBLISH' | 'SCHEDULE';

@Injectable({
  providedIn: 'root',
})
export class WorkspaceEventGroupsService {
  private readonly api = inject(EventGroupApiService);
  private readonly eventsApi = inject(EventApiService);
  private readonly publicationApi = inject(PublicationApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly eventsService = inject(WorkspaceEventsService);
  private readonly permissions = inject(WorkspacePermissionsService);
  private readonly router = inject(Router);

  readonly eventGroups = signal<EventGroup[]>([]);
  readonly eventSummaries = signal<EventSummary[]>([]);
  readonly selectedEventGroup = signal<EventGroup | null>(null);
  readonly eventGroupEvents = signal<Event[]>([]);
  readonly eventGroupEventSearchResults = signal<Event[]>([]);
  readonly savingEventGroup = signal(false);
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
    const events = this.eventSummaries();
    const firstEventsByGroup = new Map<string, EventSummary | undefined>();
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
    await this.refreshEventSummaries();
    const selectedGroup = this.selectedEventGroup();
    if (selectedGroup) {
      const refreshed = this.eventGroups().find((group) => group.id === selectedGroup.id);
      if (refreshed) {
        this.selectedEventGroup.set(refreshed);
      }
    }
  }

  private async refreshEventSummaries(): Promise<void> {
    this.eventSummaries.set(await firstValueFrom(this.eventsApi.listEventsSummary({ take: 200, isInGroup: true })));
  }

  async saveEventGroup(action: CreationPublicationAction = 'DRAFT'): Promise<void> {
    if (this.savingEventGroup()) {
      return;
    }

    if (action === 'PUBLISH' && this.eventGroupForm.invalid) {
      this.eventGroupForm.markAllAsTouched();
      return;
    }

    const raw = this.eventGroupForm.getRawValue();
    const payload = this.buildEventGroupPayload(action !== 'PUBLISH');

    this.savingEventGroup.set(true);
    try {
      let savedGroup: EventGroup;
      if (raw.id) {
        savedGroup = await firstValueFrom(this.api.updateEventGroup(raw.id, payload));
      } else {
        savedGroup = await firstValueFrom(this.api.createEventGroup(payload));
      }
      this.eventGroupForm.controls.id.setValue(savedGroup.id, { emitEvent: false });
      this.selectedEventGroup.set(savedGroup);

      if (action === 'PUBLISH') {
        if (this.eventGroupEvents().length === 0) {
          this.snackbar.open('Grupo salvo. Adicione eventos antes de publicar o conjunto.', 'Fechar', {
            duration: 4000,
          });
        } else {
          await firstValueFrom(
            this.publicationApi.setPublicationState({
              targetType: 'EVENT_GROUP',
              targetId: savedGroup.id,
              state: 'PUBLISHED',
            }),
          );
          this.snackbar.open('Grupo publicado.', 'Fechar', { duration: 2500 });
        }
      } else {
        if (this.eventGroupEvents().length > 0) {
          await firstValueFrom(
            this.publicationApi.setPublicationState({
              targetType: 'EVENT_GROUP',
              targetId: savedGroup.id,
              state: 'DRAFT',
            }),
          );
        }
        this.snackbar.open(action === 'SCHEDULE' ? 'Grupo salvo como rascunho.' : 'Rascunho salvo.', 'Fechar', {
          duration: 2500,
        });
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
      if (!raw.id && action !== 'SCHEDULE') {
        this.selectedEventGroup.set(null);
        this.eventGroupEvents.set([]);
      }
      this.syncCertificateRuleControls();
      await this.loadEventGroups();
      if (action === 'SCHEDULE') {
        void this.router.navigate(this.eventGroupPublicationRoute(savedGroup.id));
        return;
      }
      const selectedGroup = this.selectedEventGroup();
      if (selectedGroup) {
        await this.loadEventsForGroup(selectedGroup.id);
      }
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar o grupo.'), 'Fechar', { duration: 5000 });
    } finally {
      this.savingEventGroup.set(false);
    }
  }

  openEventGroupPublication(): void {
    const selectedGroup = this.selectedEventGroup();
    if (!selectedGroup) {
      return;
    }

    void this.router.navigate(this.eventGroupPublicationRoute(selectedGroup.id));
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
    try {
      await firstValueFrom(this.api.deleteEventGroup(id));
      this.snackbar.open('Grupo excluído.', 'Fechar', { duration: 2500 });
      if (this.selectedEventGroup()?.id === id) {
        this.startNewEventGroup();
      }
      await this.loadEventGroups();
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível excluir o grupo.'), 'Fechar', { duration: 5000 });
    }
  }

  async cloneEventGroup(group: EventGroup): Promise<void> {
    const result = await this.openCloneDialog(group);
    if (!result) {
      return;
    }

    try {
      const created = await firstValueFrom(
        this.api.cloneEventGroup(group.id, {
          name: result.name,
          parts: {
            certificateConfig: Boolean(result.parts.certificateConfig),
          },
        }),
      );
      this.snackbar.open('Grupo duplicado.', 'Fechar', { duration: 2500 });
      await this.loadEventGroups();
      await this.pickEventGroup(created);
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível duplicar o grupo.'), 'Fechar', { duration: 5000 });
    }
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
    await Promise.all([this.eventsService.loadEvents(), this.loadEventsForGroup(selectedGroup.id), this.refreshEventSummaries()]);
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
    await Promise.all([this.eventsService.loadEvents(), this.loadEventsForGroup(selectedGroup.id), this.refreshEventSummaries()]);
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

  getFirstEventForGroupDisplay(groupId: string): EventSummary | undefined {
    return this.firstEventsByGroupId().get(groupId);
  }

  private getFirstEventForGroup(groupId: string, events: EventSummary[]): EventSummary | undefined {
    return events
      .filter((event) => event.eventGroupId === groupId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .at(0);
  }

  private buildEventGroupPayload(allowIncompleteDraft: boolean): EventGroupInput {
    const raw = this.eventGroupForm.getRawValue();
    return {
      name: raw.name.trim() || (allowIncompleteDraft ? DEFAULT_DRAFT_EVENT_GROUP_NAME : ''),
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
  }

  private eventGroupPublicationRoute(groupId: string): string[] {
    return ['/publication', 'event-group', groupId];
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

  private async openCloneDialog(group: EventGroup): Promise<CloneAssetDialogResult | null | undefined> {
    const canCopyCertificateConfig = this.permissions.hasAll([
      Permission.CertificateConfig.Read,
      Permission.CertificateConfig.Create,
    ]);
    const dialogRef = this.dialog.open(CloneAssetDialogComponent, {
      width: '52rem',
      maxWidth: '95vw',
      data: {
        title: 'Duplicar grupo de eventos',
        sourceLabel: 'Grupo existente',
        sourceName: group.name,
        defaultName: `${group.name} (cópia)`,
        parts: [
          {
            key: 'certificateConfig',
            label: 'Configuração de certificado',
            description: 'Copia regras de emissão e modelos de certificado do grupo.',
            defaultSelected: true,
            disabled: !canCopyCertificateConfig,
            disabledReason: 'Exige permissão para visualizar e criar configurações de certificado.',
          },
        ],
      },
    });

    return firstValueFrom(dialogRef.afterClosed());
  }
}
