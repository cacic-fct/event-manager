import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../../graphql/event-api.service';
import { EventGroupApiService } from '../../graphql/event-group-api.service';
import { PeopleApiService } from '../../graphql/people-api.service';
import { PublicationApiService } from '../../graphql/publishing-api.service';
import { Event, EventDraft, EventGroup, EventInput, Person, PlacePresetInput } from '../../graphql/models';
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
import { bindLiveSearch } from '../live-search';
import { WorkspaceMajorEventsService } from './workspace-major-events.service';
import { WorkspacePermissionsService } from './workspace-permissions.service';
import { WorkspacePlacePresetsService } from './workspace-place-presets.service';
import { WorkspaceUiService } from './workspace-ui.service';

const NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS = '2345689ABCDEFGHKMNPQRSTWXYZ';
const BANNED_ATTENDANCE_CODES = new Set([
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  'AAAA',
  'BBBB',
  'CCCC',
  'DDDD',
  'EEEE',
  'FFFF',
  'GGGG',
  'HHHH',
  'KKKK',
  'MMMM',
  'NNNN',
  'PPPP',
  'QQQQ',
  'RRRR',
  'SSSS',
  'TTTT',
  'WWWW',
  'XXXX',
  'YYYY',
  'ZZZZ',
  'PENS',
  'ANWS',
]);
type CreationPublicationAction = 'DRAFT' | 'PUBLISH' | 'SCHEDULE';
const DEFAULT_DRAFT_EVENT_NAME = 'Evento sem título';
const DEFAULT_DRAFT_EVENT_EMOJI = '❔';
const DEFAULT_EVENT_DURATION_MS = 60 * 60 * 1000;

@Injectable({
  providedIn: 'root',
})
export class WorkspaceEventsService {
  private readonly api = inject(EventApiService);
  private readonly publicationApi = inject(PublicationApiService);
  private readonly eventGroupsApi = inject(EventGroupApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
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
  readonly selectedEvent = signal<Event | null>(null);
  readonly selectedEventDraft = signal<EventDraft | null>(null);
  readonly eventLecturers = signal<{ personId: string; name: string }[]>([]);
  readonly eventAttendanceCollectors = signal<{ personId: string; name: string }[]>([]);
  readonly selectedEventGroupName = signal('');
  readonly selectedEventGroupAllowsCertificates = signal(true);
  readonly selectedEventGroupAllowsNonPayingCertificates = signal(true);
  readonly selectedEventGroupAllowsNonSubscribedCertificates = signal(true);
  readonly eventGroupSearchResults = signal<EventGroup[]>([]);
  readonly lecturerSearchResults = signal<Person[]>([]);
  readonly attendanceCollectorSearchResults = signal<Person[]>([]);
  readonly groupLecturerSuggestions = signal<Person[]>([]);
  readonly suggestedGroupLecturers = computed(() => {
    const linkedPersonIds = new Set(this.eventLecturers().map((lecturer) => lecturer.personId));
    return this.groupLecturerSuggestions().filter((person) => !linkedPersonIds.has(person.id));
  });

  readonly eventFiltersForm = this.formBuilder.nonNullable.group({
    startDateFrom: [''],
    startDateUntil: [''],
    isInGroup: ['ALL'],
    isInMajorEvent: ['ALL'],
    query: [''],
  });

  readonly eventForm = this.formBuilder.nonNullable.group(
    {
      id: [''],
      name: ['', [Validators.required]],
      creditDisplayMode: ['hours'],
      creditValue: this.formBuilder.control<number | string | null>(null, [Validators.min(0)]),
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      emoji: ['', [Validators.required]],
      type: ['OTHER', [Validators.required]],
      description: [''],
      shortDescription: [''],
      latitude: [''],
      longitude: [''],
      locationDescription: [''],
      locationPresetId: ['PERSONALIZADO'],
      majorEventId: [''],
      eventGroupId: [''],
      allowSubscription: [false],
      subscriptionStartDate: [''],
      subscriptionEndDate: [''],
      slots: [''],
      autoSubscribe: [false],
      shouldIssueCertificate: [false],
      shouldIssueCertificateForNonPayingAttendees: [false],
      shouldIssueCertificateForNonSubscribedAttendees: [false],
      shouldCollectAttendance: [false],
      isOnlineAttendanceAllowed: [false],
      shouldProvideSubscriberListToLecturer: [false],
      onlineAttendanceCode: [''],
      onlineAttendanceStartDate: [''],
      onlineAttendanceEndDate: [''],
      publiclyVisible: [true],
      youtubeCode: [''],
      buttonText: [''],
      buttonLink: [''],
    },
    {
      validators: [
        this.requireBothOrNeither('latitude', 'longitude'),
        this.requireBothOrNeither('buttonText', 'buttonLink'),
      ],
    },
  );

  readonly eventGroupLookupForm = this.formBuilder.nonNullable.group({
    query: [''],
  });

  readonly lecturerLookupForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

  readonly attendanceCollectorLookupForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });

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
    const events = await firstValueFrom(this.api.listEvents(buildEventListFilters(this.eventFiltersForm.value)));
    this.events.set(events);
    await this.loadDraftsForEvents(events.map((eventItem) => eventItem.id));
  }

  async applyEventFilters(): Promise<void> {
    await this.loadEvents();
  }

  async resetEventFilters(): Promise<void> {
    resetEventFiltersForm(this.eventFiltersForm, { emitEvent: false });
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
    options: { draftId?: string; forceOriginal?: boolean } = {},
  ): Promise<boolean> {
    const eventDetails = await firstValueFrom(this.api.getEvent(eventId));
    const drafts = await firstValueFrom(this.api.listEventDrafts({ sourceEventId: eventId }));
    this.mergeDraftsForEvent(eventId, drafts);

    const selectedDraft = await this.resolveDraftSelection(eventDetails, drafts, options);
    if (selectedDraft === undefined) {
      return false;
    }

    this.selectedEvent.set(eventDetails);
    this.selectedEventDraft.set(selectedDraft);
    this.populateEventForm(selectedDraft ? this.eventFromDraft(eventDetails, selectedDraft) : eventDetails);
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
    let code = '';
    do {
      code = Array.from(
        { length: 4 },
        () =>
          NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS[
            this.getRandomIndex(NON_AMBIGUOUS_ALPHABET_CAPITALIZED_NUMBERS.length)
          ],
      ).join('');
    } while (BANNED_ATTENDANCE_CODES.has(code));

    this.eventForm.controls.onlineAttendanceCode.setValue(code);
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
    this.populateEventForm(selection.kind === 'draft' ? this.eventFromDraft(selectedEvent, selection.draft) : selectedEvent);
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
      this.populateEventForm(selectedEvent);
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
    this.selectedEventGroupName.set(group.name);
    this.selectedEventGroupAllowsCertificates.set(group.shouldIssueCertificate);
    this.selectedEventGroupAllowsNonPayingCertificates.set(group.shouldIssueCertificateForNonPayingAttendees);
    this.selectedEventGroupAllowsNonSubscribedCertificates.set(group.shouldIssueCertificateForNonSubscribedAttendees);
    this.syncCertificateControl();
    this.eventGroupSearchResults.set([]);
    void this.loadGroupLecturerSuggestions();
  }

  clearEventGroupFromEvent(): void {
    this.eventForm.controls.eventGroupId.setValue('');
    this.selectedEventGroupName.set('');
    this.selectedEventGroupAllowsCertificates.set(true);
    this.selectedEventGroupAllowsNonPayingCertificates.set(true);
    this.selectedEventGroupAllowsNonSubscribedCertificates.set(true);
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

    await firstValueFrom(
      this.api.createEventLecturer({
        eventId: selectedEvent.id,
        personId: person.id,
      }),
    );
    await this.loadEventLecturers(selectedEvent.id);
  }

  async addLecturer(person: Person): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      this.addPendingLecturer(person);
      return;
    }
    await firstValueFrom(
      this.api.createEventLecturer({
        eventId: selectedEvent.id,
        personId: person.id,
      }),
    );
    await this.loadEventLecturers(selectedEvent.id);
  }

  async removeLecturer(personId: string): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      this.eventLecturers.update((lecturers) => lecturers.filter((lecturer) => lecturer.personId !== personId));
      return;
    }
    await firstValueFrom(this.api.deleteEventLecturer(selectedEvent.id, personId));
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
    if (!selectedEvent) {
      this.addPendingAttendanceCollector(person);
      return;
    }
    await firstValueFrom(
      this.api.createEventAttendanceCollector({
        eventId: selectedEvent.id,
        personId: person.id,
      }),
    );
    await this.loadEventAttendanceCollectors(selectedEvent.id);
  }

  async removeAttendanceCollector(personId: string): Promise<void> {
    const selectedEvent = this.selectedEvent();
    if (!selectedEvent) {
      this.eventAttendanceCollectors.update((collectors) =>
        collectors.filter((collector) => collector.personId !== personId),
      );
      return;
    }
    await firstValueFrom(this.api.deleteEventAttendanceCollector(selectedEvent.id, personId));
    await this.loadEventAttendanceCollectors(selectedEvent.id);
  }

  private async loadEventLecturers(eventId: string): Promise<void> {
    const lecturers = await firstValueFrom(this.api.listEventLecturers(eventId));
    this.eventLecturers.set(
      lecturers.map((lecturer) => ({
        personId: lecturer.personId,
        name: lecturer.person?.name ?? lecturer.personId,
      })),
    );
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
    const collectors = await firstValueFrom(this.api.listEventAttendanceCollectors(eventId));
    this.eventAttendanceCollectors.set(
      collectors.map((collector) => ({
        personId: collector.personId,
        name: collector.person?.name ?? collector.personId,
      })),
    );
  }

  private async loadGroupLecturerSuggestions(): Promise<void> {
    const eventGroupId = this.eventForm.controls.eventGroupId.value;
    if (!eventGroupId) {
      this.groupLecturerSuggestions.set([]);
      return;
    }

    const currentEventId = this.eventForm.controls.id.value;
    const groupEvents = await firstValueFrom(this.api.listEvents({ eventGroupId, take: 100 }));
    const sourceEventIds = groupEvents.map((eventItem) => eventItem.id).filter((eventId) => eventId !== currentEventId);

    if (sourceEventIds.length === 0) {
      this.groupLecturerSuggestions.set([]);
      return;
    }

    const lecturerGroups = await Promise.all(
      sourceEventIds.map((eventId) => firstValueFrom(this.api.listEventLecturers(eventId))),
    );
    const suggestions = new Map<string, Person>();
    for (const lecturer of lecturerGroups.flat()) {
      if (lecturer.person) {
        suggestions.set(lecturer.person.id, lecturer.person);
      }
    }

    if (this.eventForm.controls.eventGroupId.value !== eventGroupId) {
      return;
    }

    this.groupLecturerSuggestions.set(
      [...suggestions.values()].sort((left, right) => left.name.localeCompare(right.name)),
    );
  }

  private async searchPeopleCandidates(query: string, take: number): Promise<Person[]> {
    const searches = [firstValueFrom(this.peopleApi.listPeopleSummaries({ query, take }))];
    const identityDocumentDigits = query.replace(/\D/g, '');

    if (query.includes('@')) {
      searches.unshift(firstValueFrom(this.peopleApi.listPeopleSummaries({ email: query, take })));
    }

    if (identityDocumentDigits.length >= 8) {
      searches.unshift(firstValueFrom(this.peopleApi.listPeopleSummaries({ identityDocument: query, take })));
      if (identityDocumentDigits !== query) {
        searches.unshift(
          firstValueFrom(this.peopleApi.listPeopleSummaries({ identityDocument: identityDocumentDigits, take })),
        );
      }
    }

    const peopleById = new Map<string, Person>();
    for (const person of (await Promise.all(searches)).flat()) {
      peopleById.set(person.id, person);
    }

    return [...peopleById.values()].slice(0, take);
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
    if (eventIds.length === 0) {
      this.eventDraftsByEventId.set({});
      return;
    }

    const drafts = await firstValueFrom(this.api.listEventDrafts({ sourceEventIds: eventIds }));
    const grouped = Object.fromEntries(eventIds.map((eventId) => [eventId, [] as EventDraft[]]));
    for (const draft of drafts) {
      grouped[draft.sourceEventId] = [...(grouped[draft.sourceEventId] ?? []), draft];
    }
    this.eventDraftsByEventId.set(grouped);
  }

  private mergeDraftsForEvent(eventId: string, drafts: EventDraft[]): void {
    this.eventDraftsByEventId.update((current) => ({
      ...current,
      [eventId]: [...drafts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    }));
  }

  private async resolveDraftSelection(
    eventItem: Event,
    drafts: EventDraft[],
    options: { draftId?: string; forceOriginal?: boolean },
  ): Promise<EventDraft | null | undefined> {
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
    if (!selection) {
      return undefined;
    }

    return selection.kind === 'draft' ? selection.draft : null;
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

  private eventFromDraft(eventItem: Event, draft: EventDraft): Event {
    const payload = this.parseDraftPayload(draft);
    return {
      ...eventItem,
      name: this.stringValue(payload.name, eventItem.name),
      creditMinutes: this.numberOrNullValue(payload.creditMinutes, eventItem.creditMinutes ?? null),
      startDate: this.stringValue(payload.startDate, eventItem.startDate),
      endDate: this.stringValue(payload.endDate, eventItem.endDate),
      emoji: this.stringValue(payload.emoji, eventItem.emoji),
      type: this.stringValue(payload.type, eventItem.type) as Event['type'],
      description: this.nullableStringValue(payload.description, eventItem.description ?? null),
      shortDescription: this.nullableStringValue(payload.shortDescription, eventItem.shortDescription ?? null),
      latitude: this.numberOrNullValue(payload.latitude, eventItem.latitude ?? null),
      longitude: this.numberOrNullValue(payload.longitude, eventItem.longitude ?? null),
      locationDescription: this.nullableStringValue(payload.locationDescription, eventItem.locationDescription ?? null),
      majorEventId: this.nullableStringValue(payload.majorEventId, eventItem.majorEventId ?? null),
      eventGroupId: this.nullableStringValue(payload.eventGroupId, eventItem.eventGroupId ?? null),
      allowSubscription: this.booleanValue(payload.allowSubscription, eventItem.allowSubscription),
      subscriptionStartDate: this.nullableStringValue(payload.subscriptionStartDate, eventItem.subscriptionStartDate ?? null),
      subscriptionEndDate: this.nullableStringValue(payload.subscriptionEndDate, eventItem.subscriptionEndDate ?? null),
      slots: this.numberOrNullValue(payload.slots, eventItem.slots ?? null),
      autoSubscribe: this.booleanValue(payload.autoSubscribe, eventItem.autoSubscribe),
      shouldIssueCertificate: this.booleanValue(payload.shouldIssueCertificate, eventItem.shouldIssueCertificate),
      shouldIssueCertificateForNonPayingAttendees: this.booleanValue(
        payload.shouldIssueCertificateForNonPayingAttendees,
        eventItem.shouldIssueCertificateForNonPayingAttendees,
      ),
      shouldIssueCertificateForNonSubscribedAttendees: this.booleanValue(
        payload.shouldIssueCertificateForNonSubscribedAttendees,
        eventItem.shouldIssueCertificateForNonSubscribedAttendees,
      ),
      shouldCollectAttendance: this.booleanValue(payload.shouldCollectAttendance, eventItem.shouldCollectAttendance),
      isOnlineAttendanceAllowed: this.booleanValue(payload.isOnlineAttendanceAllowed, eventItem.isOnlineAttendanceAllowed),
      shouldProvideSubscriberListToLecturer: this.booleanValue(
        payload.shouldProvideSubscriberListToLecturer,
        eventItem.shouldProvideSubscriberListToLecturer ?? false,
      ),
      onlineAttendanceCode: this.nullableStringValue(payload.onlineAttendanceCode, eventItem.onlineAttendanceCode ?? null),
      onlineAttendanceStartDate: this.nullableStringValue(
        payload.onlineAttendanceStartDate,
        eventItem.onlineAttendanceStartDate ?? null,
      ),
      onlineAttendanceEndDate: this.nullableStringValue(
        payload.onlineAttendanceEndDate,
        eventItem.onlineAttendanceEndDate ?? null,
      ),
      publiclyVisible: this.booleanValue(payload.publiclyVisible, eventItem.publiclyVisible),
      youtubeCode: this.nullableStringValue(payload.youtubeCode, eventItem.youtubeCode ?? null),
      buttonText: this.nullableStringValue(payload.buttonText, eventItem.buttonText ?? null),
      buttonLink: this.nullableStringValue(payload.buttonLink, eventItem.buttonLink ?? null),
    };
  }

  private parseDraftPayload(draft: EventDraft): EventInput {
    try {
      const parsed: unknown = JSON.parse(draft.payloadJson);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as EventInput) : {};
    } catch {
      return {};
    }
  }

  private stringValue(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
  }

  private nullableStringValue(value: unknown, fallback: string | null): string | null {
    return typeof value === 'string' || value === null ? value : fallback;
  }

  private numberOrNullValue(value: unknown, fallback: number | null): number | null {
    return typeof value === 'number' || value === null ? value : fallback;
  }

  private booleanValue(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
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
    const creditValue = this.toOptionalNumber(raw.creditValue);
    const dates = this.resolveEventDates(raw.startDate, raw.endDate, options.allowIncompleteDraft === true);
    const creditMinutes =
      creditValue == null
        ? raw.startDate && raw.endDate
          ? this.calculateDurationMinutes(raw.startDate, raw.endDate)
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
      subscriptionStartDate: this.toOptionalIsoDateTime(raw.subscriptionStartDate),
      subscriptionEndDate: this.toOptionalIsoDateTime(raw.subscriptionEndDate),
      slots: this.toOptionalNumber(raw.slots),
      autoSubscribe: raw.autoSubscribe,
      shouldIssueCertificate: raw.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees:
        raw.shouldIssueCertificate &&
        this.selectedEventGroupAllowsNonPayingCertificates() &&
        raw.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees:
        raw.shouldIssueCertificate &&
        this.selectedEventGroupAllowsNonSubscribedCertificates() &&
        raw.shouldIssueCertificateForNonSubscribedAttendees,
      shouldCollectAttendance: raw.shouldCollectAttendance,
      isOnlineAttendanceAllowed,
      shouldProvideSubscriberListToLecturer: raw.shouldProvideSubscriberListToLecturer,
      onlineAttendanceCode: isOnlineAttendanceAllowed ? raw.onlineAttendanceCode.trim() || null : null,
      onlineAttendanceStartDate: isOnlineAttendanceAllowed
        ? this.toOptionalIsoDateTime(raw.onlineAttendanceStartDate)
        : null,
      onlineAttendanceEndDate: isOnlineAttendanceAllowed
        ? this.toOptionalIsoDateTime(raw.onlineAttendanceEndDate)
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

  private resolveEventDates(
    rawStartDate: string,
    rawEndDate: string,
    allowIncompleteDraft: boolean,
  ): { startDate: string; endDate: string } {
    if (!allowIncompleteDraft || (rawStartDate && rawEndDate)) {
      return {
        startDate: this.toIsoDateTime(rawStartDate),
        endDate: this.toIsoDateTime(rawEndDate),
      };
    }

    if (rawStartDate) {
      const startDate = new Date(rawStartDate);
      return {
        startDate: startDate.toISOString(),
        endDate: new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MS).toISOString(),
      };
    }

    if (rawEndDate) {
      const endDate = new Date(rawEndDate);
      return {
        startDate: new Date(endDate.getTime() - DEFAULT_EVENT_DURATION_MS).toISOString(),
        endDate: endDate.toISOString(),
      };
    }

    const startDate = new Date();
    return {
      startDate: startDate.toISOString(),
      endDate: new Date(startDate.getTime() + DEFAULT_EVENT_DURATION_MS).toISOString(),
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

  private populateEventForm(eventItem: Event): void {
    const asHours = (eventItem.creditMinutes ?? 0) / 60;
    const selectedEventGroup = eventItem.eventGroup?.id === eventItem.eventGroupId ? eventItem.eventGroup : null;
    this.eventForm.reset({
      id: eventItem.id,
      name: eventItem.name,
      creditDisplayMode: 'hours',
      creditValue: eventItem.creditMinutes == null ? null : Number.isFinite(asHours) ? asHours : null,
      startDate: this.fromIsoToLocalInput(eventItem.startDate),
      endDate: this.fromIsoToLocalInput(eventItem.endDate),
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
        eventItem.subscriptionStartDate != null ? this.fromIsoToLocalInput(eventItem.subscriptionStartDate) : '',
      subscriptionEndDate:
        eventItem.subscriptionEndDate != null ? this.fromIsoToLocalInput(eventItem.subscriptionEndDate) : '',
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
          ? this.fromIsoToLocalInput(eventItem.onlineAttendanceStartDate)
          : '',
      onlineAttendanceEndDate:
        eventItem.onlineAttendanceEndDate != null ? this.fromIsoToLocalInput(eventItem.onlineAttendanceEndDate) : '',
      publiclyVisible: eventItem.publiclyVisible,
      youtubeCode: eventItem.youtubeCode ?? '',
      buttonText: eventItem.buttonText ?? '',
      buttonLink: eventItem.buttonLink ?? '',
    });
    this.syncOnlineAttendanceControls();
    this.eventGroupLookupForm.controls.query.setValue(selectedEventGroup?.name ?? '', { emitEvent: false });
    this.selectedEventGroupName.set(selectedEventGroup?.name ?? '');
    this.selectedEventGroupAllowsCertificates.set(selectedEventGroup?.shouldIssueCertificate ?? true);
    this.selectedEventGroupAllowsNonPayingCertificates.set(
      selectedEventGroup?.shouldIssueCertificateForNonPayingAttendees ?? true,
    );
    this.selectedEventGroupAllowsNonSubscribedCertificates.set(
      selectedEventGroup?.shouldIssueCertificateForNonSubscribedAttendees ?? true,
    );
    this.eventGroupSearchResults.set([]);
    this.syncCertificateControl();
  }

  private toIsoDateTime(rawValue: string): string {
    return new Date(rawValue).toISOString();
  }

  private toOptionalIsoDateTime(rawValue: string): string | null {
    return rawValue.trim() ? this.toIsoDateTime(rawValue) : null;
  }

  private toOptionalNumber(rawValue: number | string | null): number | null {
    if (rawValue == null || rawValue === '') {
      return null;
    }

    return Number(rawValue);
  }

  private fromIsoToLocalInput(rawValue: string): string {
    const date = new Date(rawValue);
    const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
  }

  private calculateDurationMinutes(startDate: string, endDate: string): number | null {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return null;
    }

    return Math.round((end - start) / 60_000);
  }

  private requireBothOrNeither(firstKey: string, secondKey: string) {
    return (control: AbstractControl): ValidationErrors | null => {
      const firstValue = control.get(firstKey)?.value?.toString().trim();
      const secondValue = control.get(secondKey)?.value?.toString().trim();
      return (firstValue && !secondValue) || (!firstValue && secondValue)
        ? { [`${firstKey}Requires${secondKey}`]: true }
        : null;
    };
  }

  private syncOnlineAttendanceControls(): void {
    const onlineControls = [
      this.eventForm.controls.onlineAttendanceCode,
      this.eventForm.controls.onlineAttendanceStartDate,
      this.eventForm.controls.onlineAttendanceEndDate,
    ];
    const shouldEnable = this.eventForm.controls.isOnlineAttendanceAllowed.value;

    for (const control of onlineControls) {
      if (shouldEnable) {
        control.enable({ emitEvent: false });
      } else {
        control.disable({ emitEvent: false });
      }
    }
  }

  private syncCertificateControl(): void {
    const certificateControl = this.eventForm.controls.shouldIssueCertificate;
    const nonPayingCertificateControl = this.eventForm.controls.shouldIssueCertificateForNonPayingAttendees;
    const nonSubscribedCertificateControl = this.eventForm.controls.shouldIssueCertificateForNonSubscribedAttendees;
    if (!this.selectedEventGroupAllowsCertificates()) {
      certificateControl.setValue(false, { emitEvent: false });
      nonPayingCertificateControl.setValue(false, { emitEvent: false });
      nonSubscribedCertificateControl.setValue(false, { emitEvent: false });
      certificateControl.disable({ emitEvent: false });
      nonPayingCertificateControl.disable({ emitEvent: false });
      nonSubscribedCertificateControl.disable({ emitEvent: false });
      return;
    }

    certificateControl.enable({ emitEvent: false });
    if (certificateControl.value && this.selectedEventGroupAllowsNonPayingCertificates()) {
      nonPayingCertificateControl.enable({ emitEvent: false });
    } else {
      nonPayingCertificateControl.setValue(false, { emitEvent: false });
      nonPayingCertificateControl.disable({ emitEvent: false });
    }

    if (certificateControl.value && this.selectedEventGroupAllowsNonSubscribedCertificates()) {
      nonSubscribedCertificateControl.enable({ emitEvent: false });
      return;
    }

    nonSubscribedCertificateControl.setValue(false, { emitEvent: false });
    nonSubscribedCertificateControl.disable({ emitEvent: false });
  }

  private getRandomIndex(maxExclusive: number): number {
    const randomValue = new Uint32Array(1);
    crypto.getRandomValues(randomValue);
    return randomValue[0] % maxExclusive;
  }
}
