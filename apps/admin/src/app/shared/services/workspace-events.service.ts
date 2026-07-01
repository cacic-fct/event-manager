import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { compareIsoDateDesc } from '@cacic-fct/shared-utils';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { PublicationApiService } from '../../graphql/publishing-api.service';
import {
  Event,
  EventDraft,
  EventGroup,
  EventInput,
  Person,
  PlacePresetInput,
} from '@cacic-fct/event-manager-admin-contracts';
import { ConfirmationDialogComponent } from '../components/confirmation-dialog.component';
import {
  CloneAssetDialogComponent,
  CloneAssetDialogResult,
} from '../../workspace/dialogs/clone-asset-dialog.component';
import {
  EventDraftSelectorDialogComponent,
  EventDraftSelectorResult,
} from '../../workspace/dialogs/event-draft-selector-dialog.component';
import { PersonCreateDialogComponent } from '../../workspace/dialogs/person-create-dialog.component';
import { getErrorMessage } from '../error-message';
import { buildEventListFilters, resetEventFiltersForm } from '../event-list-filters';
import {
  DEFAULT_DRAFT_EVENT_EMOJI,
  DEFAULT_DRAFT_EVENT_NAME,
  calculateDurationMinutes,
  createOnlineAttendanceCode,
  eventFromDraft,
  fromIsoToLocalInput,
  resolveEventDates,
  toOptionalIsoDateTime,
  toOptionalNumber,
} from './workspace-event-form.helpers';
import {
  WORKSPACE_LIST_PAGE_SIZE,
  applyPagedResult,
  createWorkspaceListPagination,
  resetPagination,
} from '../list-pagination';
import { bindLiveSearch } from '../live-search';
import { WorkspaceEventPeopleService } from './workspace-event-people.service';
import { WorkspaceEventFormStateService } from './workspace-event-form-state.service';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';
import { WorkspacePlacePresetsService } from './workspace-place-presets.service';
import { WorkspaceUiService } from './workspace-ui.service';

type CreationPublicationAction = 'DRAFT' | 'PUBLISH' | 'SCHEDULE';
type EventSelectionOptions = { draftId?: string; forceOriginal?: boolean; skipIfCurrent?: boolean };
type DraftSelectionResult = EventDraft | null | undefined;
type EventGroupResolution =
  | { status: 'none' }
  | { status: 'found'; group: EventGroup }
  | { status: 'unresolved' };

@Injectable({
  providedIn: 'root',
})
export class WorkspaceEventsService {
  private readonly api = inject(EventApiService);
  private readonly publicationApi = inject(PublicationApiService);
  private readonly eventGroupsApi = inject(EventGroupApiService);
  private readonly eventPeople = inject(WorkspaceEventPeopleService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formState = inject(WorkspaceEventFormStateService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly majorEventsService = inject(WorkspaceMajorEventsService);
  private readonly permissions = inject(WorkspacePermissionsService);
  readonly placePresetsService = inject(WorkspacePlacePresetsService);
  private readonly ui = inject(WorkspaceUiService);

  readonly majorEvents = this.majorEventsService.majorEvents;
  readonly loading = this.ui.loading;

  readonly events = signal<Event[]>([]);
  readonly eventDraftsByEventId = signal<Record<string, EventDraft[]>>({});
  readonly eventsPagination = createWorkspaceListPagination();
  readonly selectedEvent = signal<Event | null>(null);
  readonly selectedEventDraft = signal<EventDraft | null>(null);
  readonly eventLecturers = signal<{ personId: string; name: string }[]>([]);
  readonly eventAttendanceCollectors = signal<{ personId: string; name: string }[]>([]);
  readonly selectedEventGroupName = signal('');
  readonly selectedEventGroupAllowsCertificates = signal<boolean | null>(true);
  readonly selectedEventGroupAllowsNonPayingCertificates = signal<boolean | null>(true);
  readonly selectedEventGroupAllowsNonSubscribedCertificates = signal<boolean | null>(true);
  readonly eventGroupSearchResults = signal<EventGroup[]>([]);
  readonly lecturerSearchResults = signal<Person[]>([]);
  readonly attendanceCollectorSearchResults = signal<Person[]>([]);
  readonly groupLecturerSuggestions = signal<Person[]>([]);
  readonly suggestedGroupLecturers = computed(() => {
    const linkedPersonIds = new Set(this.eventLecturers().map((lecturer) => lecturer.personId));
    return this.groupLecturerSuggestions().filter((person) => !linkedPersonIds.has(person.id));
  });

  readonly eventFiltersForm = this.formState.createEventFiltersForm();
  readonly eventForm = this.formState.createEventForm();
  readonly eventGroupLookupForm = this.formState.createLookupForm();
  readonly lecturerLookupForm = this.formState.createLookupForm(true);
  readonly attendanceCollectorLookupForm = this.formState.createLookupForm(true);

  constructor() {
    bindLiveSearch({
      control: this.eventFiltersForm,
      destroyRef: this.destroyRef,
      search: () => this.loadEvents(),
    });
    bindLiveSearch({
      control: this.eventGroupLookupForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.searchEventGroupsForEvent(),
    });
    bindLiveSearch({
      control: this.lecturerLookupForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.searchLecturerCandidates(),
    });
    bindLiveSearch({
      control: this.attendanceCollectorLookupForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.searchAttendanceCollectorCandidates(),
    });
    this.syncOnlineAttendanceControls();
    this.eventForm.controls.isOnlineAttendanceAllowed.valueChanges.subscribe(() => this.syncOnlineAttendanceControls());
    this.eventForm.controls.shouldIssueCertificate.valueChanges.subscribe(() => this.syncCertificateControl());
  }

  async loadEvents(): Promise<void> {
    const items = await firstValueFrom(
      this.api.listEvents({
        ...buildEventListFilters(this.eventFiltersForm.value, WORKSPACE_LIST_PAGE_SIZE + 1),
        skip: this.eventsPagination.pageIndex() * WORKSPACE_LIST_PAGE_SIZE,
      }),
    );
    const events = applyPagedResult(items, this.eventsPagination);
    this.events.set(events);
    await this.loadDraftsForEvents(events.map((eventItem) => eventItem.id));
  }

  async applyEventFilters(): Promise<void> {
    resetPagination(this.eventsPagination);
    await this.loadEvents();
  }

  async resetEventFilters(): Promise<void> {
    resetEventFiltersForm(this.eventFiltersForm, { emitEvent: false });
    resetPagination(this.eventsPagination);
    await this.loadEvents();
  }

  async previousEventsPage(): Promise<void> {
    this.eventsPagination.pageIndex.update((page) => Math.max(0, page - 1));
    await this.loadEvents();
  }

  async nextEventsPage(): Promise<void> {
    if (!this.eventsPagination.hasNextPage()) {
      return;
    }
    this.eventsPagination.pageIndex.update((page) => page + 1);
    await this.loadEvents();
  }

  async selectEvent(eventItem: Event): Promise<void> {
    if (await this.selectEventById(eventItem.id)) {
      void this.router.navigate(['/events', eventItem.id]);
    }
  }

  async selectEventDraft(eventItem: Event, draft: EventDraft): Promise<void> {
    if (await this.selectEventById(eventItem.id, { draftId: draft.id })) {
      void this.router.navigate(['/events', eventItem.id]);
    }
  }

  async selectEventById(
    eventId: string,
    options: EventSelectionOptions = {},
  ): Promise<boolean> {
    if (options.skipIfCurrent && this.selectedEvent()?.id === eventId && !options.draftId && !options.forceOriginal) {
      return true;
    }

    const eventDetails = await firstValueFrom(this.api.getEvent(eventId));
    const canLoadDrafts = this.permissions.canEdit(Permission.Event.Update);
    const drafts = canLoadDrafts ? await firstValueFrom(this.api.listEventDrafts({ sourceEventId: eventId })) : [];
    this.mergeDraftsForEvent(eventId, drafts);

    const selectedDraft = await this.resolveDraftSelection(eventDetails, drafts, options);
    if (selectedDraft === undefined) {
      return false;
    }

    this.selectedEvent.set(eventDetails);
    this.selectedEventDraft.set(selectedDraft);
    await this.populateEventForm(selectedDraft ? eventFromDraft(eventDetails, selectedDraft) : eventDetails);
    this.eventGroupSearchResults.set([]);
    await Promise.all([this.loadEventLecturers(eventId), this.loadEventAttendanceCollectors(eventId)]);
    await this.loadGroupLecturerSuggestions();
    return true;
  }

  resetEventForm(): void {
    void this.router.navigate(['/events']);
    this.selectedEvent.set(null);
    this.selectedEventDraft.set(null);
    this.eventLecturers.set([]);
    this.eventAttendanceCollectors.set([]);
    this.eventGroupSearchResults.set([]);
    this.groupLecturerSuggestions.set([]);
    this.attendanceCollectorSearchResults.set([]);
    this.eventGroupLookupForm.reset(
      {
        query: '',
      },
      { emitEvent: false },
    );
    this.selectedEventGroupName.set('');
    this.selectedEventGroupAllowsCertificates.set(true);
    this.selectedEventGroupAllowsNonPayingCertificates.set(true);
    this.selectedEventGroupAllowsNonSubscribedCertificates.set(true);
    this.eventForm.reset({
      id: '',
      name: '',
      creditDisplayMode: 'hours',
      creditValue: null,
      startDate: '',
      endDate: '',
      emoji: '',
      type: 'OTHER',
      description: '',
      shortDescription: '',
      latitude: '',
      longitude: '',
      locationDescription: '',
      locationPresetId: 'PERSONALIZADO',
      majorEventId: '',
      eventGroupId: '',
      allowSubscription: false,
      subscriptionStartDate: '',
      subscriptionEndDate: '',
      slots: '',
      autoSubscribe: false,
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldCollectAttendance: false,
      isOnlineAttendanceAllowed: false,
      shouldProvideSubscriberListToLecturer: false,
      onlineAttendanceCode: '',
      onlineAttendanceStartDate: '',
      onlineAttendanceEndDate: '',
      publiclyVisible: true,
      youtubeCode: '',
      buttonText: '',
      buttonLink: '',
    });
    this.syncOnlineAttendanceControls();
    this.syncCertificateControl();
  }

  randomizeOnlineAttendanceCode(): void {
    this.eventForm.controls.onlineAttendanceCode.setValue(createOnlineAttendanceCode());
  }

  async saveEvent(action: CreationPublicationAction = 'DRAFT'): Promise<void> {
    if (action === 'PUBLISH' && this.eventForm.invalid) {
      this.eventForm.markAllAsTouched();
      return;
    }

    const eventId = this.eventForm.controls.id.value;
    const payload = this.buildEventPayload(!eventId, { allowIncompleteDraft: action !== 'PUBLISH' });
    const manualPlace = this.buildManualPlacePresetPayload();
    const selectedEvent = this.selectedEvent();
    const selectedDraft = this.selectedEventDraft();

    this.ui.loading.set(true);
    try {
      if (eventId && selectedEvent && (selectedDraft || this.shouldSaveSeparateDraft(selectedEvent, action))) {
        const savedDraft = await firstValueFrom(
          this.api.saveEventDraft({
            sourceEventId: selectedEvent.id,
            draftId: selectedDraft?.id,
            input: payload,
          }),
        );
        this.selectedEventDraft.set(savedDraft);
        this.mergeDraftsForEvent(selectedEvent.id, [
          savedDraft,
          ...this.draftsForEvent(selectedEvent.id).filter((draft) => draft.id !== savedDraft.id),
        ]);

        if (manualPlace) {
          await this.placePresetsService.ensurePresetForManualLocation(manualPlace);
        }

        if (action === 'PUBLISH') {
          await firstValueFrom(this.api.applyEventDraft(savedDraft.id));
          this.snackbar.open('Rascunho aplicado à publicação.', 'Fechar', { duration: 2500 });
          await this.loadEvents();
          await this.selectEventById(selectedEvent.id, { forceOriginal: true });
          return;
        }

        this.snackbar.open('Rascunho salvo sem alterar a publicação.', 'Fechar', { duration: 3500 });
        await this.loadEvents();
        if (action === 'SCHEDULE') {
          void this.router.navigate(this.eventPublicationRoute(selectedEvent.id));
        }
        return;
      }

      let savedEventId;
      if (eventId) {
        const updated = await firstValueFrom(this.api.updateEvent(eventId, payload));
        savedEventId = updated.id;
      } else {
        const created = await firstValueFrom(this.api.createEvent(payload));
        savedEventId = created.id;
      }

      if (manualPlace) {
        await this.placePresetsService.ensurePresetForManualLocation(manualPlace);
      }

      if (action === 'PUBLISH') {
        await firstValueFrom(
          this.publicationApi.setPublicationState({
            targetType: 'EVENT',
            targetId: savedEventId,
            state: 'PUBLISHED',
          }),
        );
        this.snackbar.open('Evento publicado.', 'Fechar', { duration: 2500 });
      } else {
        await firstValueFrom(
          this.publicationApi.setPublicationState({
            targetType: 'EVENT',
            targetId: savedEventId,
            state: 'DRAFT',
          }),
        );
        this.snackbar.open(action === 'SCHEDULE' ? 'Evento salvo como rascunho.' : 'Rascunho salvo.', 'Fechar', {
          duration: 2500,
        });
      }

      await this.loadEvents();
      if (action === 'SCHEDULE') {
        void this.router.navigate(this.eventPublicationRoute(savedEventId));
        return;
      }
      this.resetEventForm();
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar o evento.'), 'Fechar', { duration: 5000 });
    } finally {
      this.ui.loading.set(false);
    }
  }

  openEventPublication(): void {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      return;
    }

    void this.router.navigate(this.eventPublicationRoute(selectedEvent.id));
  }

  openEventForms(): void {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      return;
    }

    void this.router.navigate(['/forms', 'event', selectedEvent.id]);
  }

  async deleteEventFromList(eventItem: Event): Promise<void> {
    await this.deleteEventById(eventItem.id);
  }

  async chooseSelectedEventVersion(): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      return;
    }

    const drafts = await firstValueFrom(this.api.listEventDrafts({ sourceEventId: selectedEvent.id }));
    this.mergeDraftsForEvent(selectedEvent.id, drafts);
    const selection = await this.openDraftSelector(selectedEvent, drafts);
    if (!selection) {
      return;
    }

    this.selectedEventDraft.set(selection.kind === 'draft' ? selection.draft : null);
    await this.populateEventForm(
      selection.kind === 'draft' ? eventFromDraft(selectedEvent, selection.draft) : selectedEvent,
    );
  }

  async deleteDraftsForSelectedEvent(): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent || this.draftsForEvent(selectedEvent.id).length === 0) {
      return;
    }

    const confirmed = await this.confirm({
      title: 'Excluir rascunhos?',
      message: 'Todos os rascunhos deste evento serão excluídos permanentemente. A publicação atual não será alterada.',
      confirmLabel: 'Excluir rascunhos',
    });
    if (!confirmed) {
      return;
    }

    this.ui.loading.set(true);
    try {
      await firstValueFrom(this.api.deleteEventDraftsForEvent(selectedEvent.id));
      this.mergeDraftsForEvent(selectedEvent.id, []);
      this.selectedEventDraft.set(null);
      await this.populateEventForm(selectedEvent);
      this.snackbar.open('Rascunhos excluídos.', 'Fechar', { duration: 2500 });
      await this.loadEvents();
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível excluir os rascunhos.'), 'Fechar', {
        duration: 5000,
      });
    } finally {
      this.ui.loading.set(false);
    }
  }

  draftsForEvent(eventId: string | null | undefined): EventDraft[] {
    return eventId ? (this.eventDraftsByEventId()[eventId] ?? []) : [];
  }

  async cloneEvent(eventItem: Event): Promise<void> {
    const result = await this.openCloneDialog(eventItem);
    if (!result) {
      return;
    }

    this.ui.loading.set(true);
    try {
      const created = await firstValueFrom(
        this.api.cloneEvent(eventItem.id, {
          name: result.name,
          parts: {
            lecturers: Boolean(result.parts.lecturers),
            certificateConfig: Boolean(result.parts.certificateConfig),
            subscriptionSettings: Boolean(result.parts.subscriptionSettings),
            attendanceSettings: Boolean(result.parts.attendanceSettings),
            place: Boolean(result.parts.place),
            visibility: Boolean(result.parts.visibility),
          },
        }),
      );
      this.snackbar.open('Evento duplicado.', 'Fechar', { duration: 2500 });
      await this.loadEvents();
      await this.selectEventById(created.id);
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível duplicar o evento.'), 'Fechar', { duration: 5000 });
    } finally {
      this.ui.loading.set(false);
    }
  }

  async searchEventGroupsForEvent(): Promise<void> {
    const query = this.eventGroupLookupForm.controls.query.value.trim();
    if (!query) {
      this.eventGroupSearchResults.set([]);
      return;
    }

    this.eventGroupSearchResults.set(await firstValueFrom(this.eventGroupsApi.listEventGroups({ query, take: 20 })));
  }

  assignEventGroupToEvent(group: EventGroup): void {
    this.eventForm.controls.eventGroupId.setValue(group.id);
    this.applySelectedEventGroup(group, { hasEventGroup: true });
    this.syncCertificateControl();
    this.eventGroupSearchResults.set([]);
    void this.loadGroupLecturerSuggestions();
  }

  clearEventGroupFromEvent(): void {
    this.eventForm.controls.eventGroupId.setValue('');
    this.applySelectedEventGroup(null, { hasEventGroup: false });
    this.syncCertificateControl();
    this.eventGroupSearchResults.set([]);
    this.groupLecturerSuggestions.set([]);
  }

  applyPlacePreset(placeId: string): void {
    this.eventForm.controls.locationPresetId.setValue(placeId);
    if (placeId === 'PERSONALIZADO') {
      return;
    }

    const place = this.placePresetsService.placePresets().find((preset) => preset.id === placeId);
    if (!place) {
      return;
    }

    this.eventForm.controls.latitude.setValue(place.latitude?.toString() ?? '');
    this.eventForm.controls.longitude.setValue(place.longitude?.toString() ?? '');
    this.eventForm.controls.locationDescription.setValue(place.locationDescription ?? place.name);
  }

  eventGroupNameById(groupId: string): string {
    if (!groupId) {
      return 'Nenhum grupo selecionado';
    }

    return (
      (this.selectedEventGroupName() || this.eventGroupSearchResults().find((group) => group.id === groupId)?.name) ??
      this.selectedEvent()?.eventGroup?.name ??
      groupId
    );
  }

  async searchLecturerCandidates(): Promise<void> {
    const query = this.lecturerLookupForm.controls.query.value.trim();
    if (!query) {
      this.lecturerSearchResults.set([]);
      return;
    }
    this.lecturerSearchResults.set(await this.searchPeopleCandidates(query, 10));
  }

  async createAndAddLecturer(): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (this.isEditingSelectedDraft()) {
      this.showDraftRelationWarning();
      return;
    }

    const dialogRef = this.dialog.open(PersonCreateDialogComponent, {
      width: '48rem',
      maxWidth: '95vw',
    });
    const person = await firstValueFrom(dialogRef.afterClosed());
    if (!person) {
      return;
    }

    if (!selectedEvent) {
      this.addPendingLecturer(person);
      return;
    }

    await this.eventPeople.addLecturer(selectedEvent.id, person.id);
    await this.loadEventLecturers(selectedEvent.id);
  }

  async addLecturer(person: Person): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (this.isEditingSelectedDraft()) {
      this.showDraftRelationWarning();
      return;
    }

    if (!selectedEvent) {
      this.addPendingLecturer(person);
      return;
    }
    await this.eventPeople.addLecturer(selectedEvent.id, person.id);
    await this.loadEventLecturers(selectedEvent.id);
  }

  async removeLecturer(personId: string): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (this.isEditingSelectedDraft()) {
      this.showDraftRelationWarning();
      return;
    }

    if (!selectedEvent) {
      this.eventLecturers.update((lecturers) => lecturers.filter((lecturer) => lecturer.personId !== personId));
      return;
    }
    await this.eventPeople.removeLecturer(selectedEvent.id, personId);
    await this.loadEventLecturers(selectedEvent.id);
  }

  async searchAttendanceCollectorCandidates(): Promise<void> {
    const query = this.attendanceCollectorLookupForm.controls.query.value.trim();
    if (!query) {
      this.attendanceCollectorSearchResults.set([]);
      return;
    }
    this.attendanceCollectorSearchResults.set(await this.searchPeopleCandidates(query, 10));
  }

  async addAttendanceCollector(person: Person): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (this.isEditingSelectedDraft()) {
      this.showDraftRelationWarning();
      return;
    }

    if (!selectedEvent) {
      this.addPendingAttendanceCollector(person);
      return;
    }
    await this.eventPeople.addAttendanceCollector(selectedEvent.id, person.id);
    await this.loadEventAttendanceCollectors(selectedEvent.id);
  }

  async removeAttendanceCollector(personId: string): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (this.isEditingSelectedDraft()) {
      this.showDraftRelationWarning();
      return;
    }

    if (!selectedEvent) {
      this.eventAttendanceCollectors.update((collectors) =>
        collectors.filter((collector) => collector.personId !== personId),
      );
      return;
    }
    await this.eventPeople.removeAttendanceCollector(selectedEvent.id, personId);
    await this.loadEventAttendanceCollectors(selectedEvent.id);
  }

  private async loadEventLecturers(eventId: string): Promise<void> {
    this.eventLecturers.set(await this.eventPeople.listLecturers(eventId));
  }

  private async openCloneDialog(eventItem: Event): Promise<CloneAssetDialogResult | null | undefined> {
    const canCopyLecturers = this.permissions.hasAll([Permission.EventLecturer.Read, Permission.EventLecturer.Create]);
    const canCopyCertificateConfig = this.permissions.hasAll([
      Permission.CertificateConfig.Read,
      Permission.CertificateConfig.Create,
    ]);

    const dialogRef = this.dialog.open(CloneAssetDialogComponent, {
      width: '52rem',
      maxWidth: '95vw',
      data: {
        title: 'Duplicar evento',
        sourceLabel: 'Evento existente',
        sourceName: eventItem.name,
        defaultName: `${eventItem.name} (cópia)`,
        parts: [
          {
            key: 'lecturers',
            label: 'Ministrantes',
            description: 'Copia os vínculos com pessoas ministrantes.',
            defaultSelected: true,
            disabled: !canCopyLecturers,
            disabledReason: 'Exige permissão para visualizar e criar ministrantes do evento.',
          },
          {
            key: 'certificateConfig',
            label: 'Configuração de certificado',
            description: 'Copia regras de emissão e modelos de certificado.',
            defaultSelected: true,
            disabled: !canCopyCertificateConfig,
            disabledReason: 'Exige permissão para visualizar e criar configurações de certificado.',
          },
          {
            key: 'subscriptionSettings',
            label: 'Inscrições',
            description: 'Copia janela, vagas e regras administrativas de inscrição.',
            defaultSelected: true,
          },
          {
            key: 'attendanceSettings',
            label: 'Presença',
            description: 'Copia coleta e janelas de presença, sem copiar o código de presença.',
            defaultSelected: true,
          },
          {
            key: 'place',
            label: 'Local',
            description: 'Copia coordenadas e descrição do local.',
            defaultSelected: true,
          },
          {
            key: 'visibility',
            label: 'Visibilidade',
            description: 'Copia se o evento aparece para usuários.',
            defaultSelected: true,
          },
        ],
      },
    });

    return firstValueFrom(dialogRef.afterClosed());
  }

  private async loadEventAttendanceCollectors(eventId: string): Promise<void> {
    this.eventAttendanceCollectors.set(await this.eventPeople.listAttendanceCollectors(eventId));
  }

  private async loadGroupLecturerSuggestions(): Promise<void> {
    const eventGroupId = this.eventForm.controls.eventGroupId.value;
    if (!eventGroupId) {
      this.groupLecturerSuggestions.set([]);
      return;
    }

    const suggestions = await this.eventPeople.listGroupLecturerSuggestions(
      eventGroupId,
      this.eventForm.controls.id.value,
    );

    if (this.eventForm.controls.eventGroupId.value !== eventGroupId) {
      return;
    }

    this.groupLecturerSuggestions.set(suggestions);
  }

  private async searchPeopleCandidates(query: string, take: number): Promise<Person[]> {
    return this.eventPeople.searchCandidates(query, take);
  }

  private async deleteEventById(eventId: string): Promise<void> {
    try {
      await firstValueFrom(this.api.deleteEvent(eventId));
      this.snackbar.open('Evento excluído.', 'Fechar', { duration: 2500 });
      if (this.selectedEvent()?.id === eventId) {
        this.resetEventForm();
      }
      await this.loadEvents();
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível excluir o evento.'), 'Fechar', { duration: 5000 });
    }
  }

  private async loadDraftsForEvents(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0 || !this.permissions.canEdit(Permission.Event.Update)) {
      this.eventDraftsByEventId.set({});
      return;
    }

    const drafts = await firstValueFrom(this.api.listEventDrafts({ sourceEventIds: eventIds }));
    const grouped = Object.fromEntries(eventIds.map((eventId) => [eventId, [] as EventDraft[]]));
    for (const draft of drafts) {
      grouped[draft.sourceEventId] = [...(grouped[draft.sourceEventId] ?? []), draft];
    }
    for (const eventId of eventIds) {
      grouped[eventId] = this.sortDrafts(grouped[eventId]);
    }
    this.eventDraftsByEventId.set(grouped);
  }

  private mergeDraftsForEvent(eventId: string, drafts: EventDraft[]): void {
    this.eventDraftsByEventId.update((current) => ({
      ...current,
      [eventId]: this.sortDrafts(drafts),
    }));
  }

  private sortDrafts(drafts: EventDraft[]): EventDraft[] {
    return [...drafts].sort((left, right) => compareIsoDateDesc(left.updatedAt, right.updatedAt));
  }

  private async resolveDraftSelection(
    eventItem: Event,
    drafts: EventDraft[],
    options: EventSelectionOptions,
  ): Promise<DraftSelectionResult> {
    if (options.forceOriginal) {
      return null;
    }

    if (options.draftId) {
      return drafts.find((draft) => draft.id === options.draftId) ?? null;
    }

    if (drafts.length === 0 || (eventItem.publicationState !== 'PUBLISHED' && eventItem.publicationState !== 'SCHEDULED')) {
      return null;
    }

    if (drafts.length === 1) {
      return drafts[0];
    }

    const selection = await this.openDraftSelector(eventItem, drafts);
    if (selection === undefined) {
      return undefined;
    }

    return selection.kind === 'draft' ? selection.draft : null;
  }

  private isEditingSelectedDraft(): boolean {
    return this.selectedEventDraft() !== null;
  }

  private showDraftRelationWarning(): void {
    this.snackbar.open(
      'Rascunhos salvam apenas os campos do evento. Edite vínculos na versão publicada.',
      'Fechar',
      { duration: 4000 },
    );
  }

  private openDraftSelector(eventItem: Event, drafts: EventDraft[]): Promise<EventDraftSelectorResult | undefined> {
    return firstValueFrom(
      this.dialog
        .open<EventDraftSelectorDialogComponent, { event: Event; drafts: EventDraft[] }, EventDraftSelectorResult>(
          EventDraftSelectorDialogComponent,
          {
            data: { event: eventItem, drafts },
            width: '640px',
          },
        )
        .afterClosed(),
    );
  }

  private shouldSaveSeparateDraft(eventItem: Event, action: CreationPublicationAction): boolean {
    return action === 'DRAFT' && (eventItem.publicationState === 'PUBLISHED' || eventItem.publicationState === 'SCHEDULED');
  }

  private async confirm(data: { title: string; message: string; confirmLabel?: string }): Promise<boolean> {
    const result = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          data,
          width: '420px',
        })
        .afterClosed(),
    );

    return result === true;
  }

  private buildEventPayload(includePeople: boolean, options: { allowIncompleteDraft?: boolean } = {}): EventInput {
    const raw = this.eventForm.getRawValue();
    const creditValue = toOptionalNumber(raw.creditValue);
    const dates = resolveEventDates(raw.startDate, raw.endDate, options.allowIncompleteDraft === true);
    const creditMinutes =
      creditValue == null
        ? raw.startDate && raw.endDate
          ? calculateDurationMinutes(raw.startDate, raw.endDate)
          : null
        : raw.creditDisplayMode === 'hours'
          ? Math.round(creditValue * 60)
          : Math.round(creditValue);
    const isOnlineAttendanceAllowed = raw.isOnlineAttendanceAllowed;

    const payload: EventInput = {
      name: raw.name.trim() || (options.allowIncompleteDraft ? DEFAULT_DRAFT_EVENT_NAME : ''),
      creditMinutes,
      startDate: dates.startDate,
      endDate: dates.endDate,
      emoji: raw.emoji.trim() || (options.allowIncompleteDraft ? DEFAULT_DRAFT_EVENT_EMOJI : ''),
      type: raw.type as EventInput['type'],
      description: raw.description.trim() || null,
      shortDescription: raw.shortDescription.trim() || null,
      latitude: raw.latitude ? Number(raw.latitude) : null,
      longitude: raw.longitude ? Number(raw.longitude) : null,
      locationDescription: raw.locationDescription.trim() || null,
      majorEventId: raw.majorEventId || null,
      eventGroupId: raw.eventGroupId || null,
      allowSubscription: raw.allowSubscription,
      subscriptionStartDate: toOptionalIsoDateTime(raw.subscriptionStartDate),
      subscriptionEndDate: toOptionalIsoDateTime(raw.subscriptionEndDate),
      slots: toOptionalNumber(raw.slots),
      autoSubscribe: raw.autoSubscribe,
      shouldIssueCertificate: raw.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees:
        raw.shouldIssueCertificate &&
        this.selectedEventGroupAllowsNonPayingCertificates() !== false &&
        raw.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees:
        raw.shouldIssueCertificate &&
        this.selectedEventGroupAllowsNonSubscribedCertificates() !== false &&
        raw.shouldIssueCertificateForNonSubscribedAttendees,
      shouldCollectAttendance: raw.shouldCollectAttendance,
      isOnlineAttendanceAllowed,
      shouldProvideSubscriberListToLecturer: raw.shouldProvideSubscriberListToLecturer,
      onlineAttendanceCode: isOnlineAttendanceAllowed ? raw.onlineAttendanceCode.trim() || null : null,
      onlineAttendanceStartDate: isOnlineAttendanceAllowed
        ? toOptionalIsoDateTime(raw.onlineAttendanceStartDate)
        : null,
      onlineAttendanceEndDate: isOnlineAttendanceAllowed
        ? toOptionalIsoDateTime(raw.onlineAttendanceEndDate)
        : null,
      publiclyVisible: raw.publiclyVisible,
      youtubeCode: raw.youtubeCode.trim() || null,
      buttonText: raw.buttonText.trim() || null,
      buttonLink: raw.buttonLink.trim() || null,
    };

    if (includePeople) {
      payload.lecturerPersonIds = this.eventLecturers().map((lecturer) => lecturer.personId);
      payload.attendanceCollectorPersonIds = this.eventAttendanceCollectors().map((collector) => collector.personId);
    }

    return payload;
  }

  private buildManualPlacePresetPayload(): PlacePresetInput | null {
    const raw = this.eventForm.getRawValue();
    if (raw.locationPresetId !== 'PERSONALIZADO') {
      return null;
    }

    const name = raw.locationDescription.trim();
    if (!name) {
      return null;
    }

    return {
      name,
      latitude: raw.latitude ? Number(raw.latitude) : null,
      longitude: raw.longitude ? Number(raw.longitude) : null,
      locationDescription: name,
    };
  }

  private eventPublicationRoute(eventId: string): string[] {
    return ['/publication', 'event', eventId];
  }

  private addPendingLecturer(person: Person): void {
    this.eventLecturers.update((lecturers) =>
      lecturers.some((lecturer) => lecturer.personId === person.id)
        ? lecturers
        : [
            ...lecturers,
            {
              personId: person.id,
              name: person.name,
            },
          ],
    );
  }

  private addPendingAttendanceCollector(person: Person): void {
    this.eventAttendanceCollectors.update((collectors) =>
      collectors.some((collector) => collector.personId === person.id)
        ? collectors
        : [
            ...collectors,
            {
              personId: person.id,
              name: person.name,
            },
          ],
    );
  }

  private async populateEventForm(eventItem: Event): Promise<void> {
    const asHours = (eventItem.creditMinutes ?? 0) / 60;
    const selectedEventGroup = await this.resolveSelectedEventGroup(eventItem);
    this.eventForm.reset({
      id: eventItem.id,
      name: eventItem.name,
      creditDisplayMode: 'hours',
      creditValue: eventItem.creditMinutes == null ? null : Number.isFinite(asHours) ? asHours : null,
      startDate: fromIsoToLocalInput(eventItem.startDate),
      endDate: fromIsoToLocalInput(eventItem.endDate),
      emoji: eventItem.emoji,
      type: eventItem.type,
      description: eventItem.description ?? '',
      shortDescription: eventItem.shortDescription ?? '',
      latitude: eventItem.latitude?.toString() ?? '',
      longitude: eventItem.longitude?.toString() ?? '',
      locationDescription: eventItem.locationDescription ?? '',
      locationPresetId: 'PERSONALIZADO',
      majorEventId: eventItem.majorEventId ?? '',
      eventGroupId: eventItem.eventGroupId ?? '',
      allowSubscription: eventItem.allowSubscription,
      subscriptionStartDate:
        eventItem.subscriptionStartDate != null ? fromIsoToLocalInput(eventItem.subscriptionStartDate) : '',
      subscriptionEndDate:
        eventItem.subscriptionEndDate != null ? fromIsoToLocalInput(eventItem.subscriptionEndDate) : '',
      slots: eventItem.slots?.toString() ?? '',
      autoSubscribe: eventItem.autoSubscribe,
      shouldIssueCertificate: eventItem.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees: eventItem.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees: eventItem.shouldIssueCertificateForNonSubscribedAttendees,
      shouldCollectAttendance: eventItem.shouldCollectAttendance,
      isOnlineAttendanceAllowed: eventItem.isOnlineAttendanceAllowed,
      shouldProvideSubscriberListToLecturer: eventItem.shouldProvideSubscriberListToLecturer ?? false,
      onlineAttendanceCode: eventItem.onlineAttendanceCode ?? '',
      onlineAttendanceStartDate:
        eventItem.onlineAttendanceStartDate != null
          ? fromIsoToLocalInput(eventItem.onlineAttendanceStartDate)
          : '',
      onlineAttendanceEndDate:
        eventItem.onlineAttendanceEndDate != null ? fromIsoToLocalInput(eventItem.onlineAttendanceEndDate) : '',
      publiclyVisible: eventItem.publiclyVisible,
      youtubeCode: eventItem.youtubeCode ?? '',
      buttonText: eventItem.buttonText ?? '',
      buttonLink: eventItem.buttonLink ?? '',
    });
    this.syncOnlineAttendanceControls();
    this.eventGroupLookupForm.controls.query.setValue(
      selectedEventGroup.status === 'found' ? selectedEventGroup.group.name : '',
      { emitEvent: false },
    );
    this.applySelectedEventGroup(selectedEventGroup);
    this.eventGroupSearchResults.set([]);
    this.syncCertificateControl();
  }

  private async resolveSelectedEventGroup(eventItem: Event): Promise<EventGroupResolution> {
    if (!eventItem.eventGroupId) {
      return { status: 'none' };
    }

    if (eventItem.eventGroup?.id === eventItem.eventGroupId) {
      return { status: 'found', group: eventItem.eventGroup };
    }

    try {
      return {
        status: 'found',
        group: await firstValueFrom(this.eventGroupsApi.getEventGroup(eventItem.eventGroupId)),
      };
    } catch {
      return { status: 'unresolved' };
    }
  }

  private applySelectedEventGroup(group: EventGroup | null, options: { hasEventGroup: boolean }): void;
  private applySelectedEventGroup(resolution: EventGroupResolution): void;
  private applySelectedEventGroup(
    value: EventGroup | EventGroupResolution | null,
    options?: { hasEventGroup: boolean },
  ): void {
    const resolution: EventGroupResolution =
      options != null
        ? value == null
          ? options.hasEventGroup
            ? { status: 'unresolved' }
            : { status: 'none' }
          : { status: 'found', group: value as EventGroup }
        : (value as EventGroupResolution);
    const group = resolution.status === 'found' ? resolution.group : null;
    const allowCertificates =
      resolution.status === 'unresolved' ? null : group?.shouldIssueCertificate ?? true;
    this.selectedEventGroupName.set(group?.name ?? '');
    this.selectedEventGroupAllowsCertificates.set(allowCertificates);
    this.selectedEventGroupAllowsNonPayingCertificates.set(
      resolution.status === 'unresolved'
        ? null
        : group?.shouldIssueCertificateForNonPayingAttendees ?? allowCertificates,
    );
    this.selectedEventGroupAllowsNonSubscribedCertificates.set(
      resolution.status === 'unresolved'
        ? null
        : group?.shouldIssueCertificateForNonSubscribedAttendees ?? allowCertificates,
    );
  }

  private syncOnlineAttendanceControls(): void {
    this.formState.syncOnlineAttendanceControls(this.eventForm);
  }

  private syncCertificateControl(): void {
    this.formState.syncCertificateControls(
      this.eventForm,
      this.selectedEventGroupAllowsCertificates(),
      this.selectedEventGroupAllowsNonPayingCertificates(),
      this.selectedEventGroupAllowsNonSubscribedCertificates(),
    );
  }

}
