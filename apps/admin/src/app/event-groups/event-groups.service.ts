import { isFrozenMajorEvent } from '../resource-state/frozen-resource';
import { EventWorkspaceContextService } from '../event-workspace/event-workspace-context.service';
import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Permission } from '@cacic-fct/shared-permissions';
import { compareIsoDateAsc, compareIsoDateDesc } from '@cacic-fct/shared-utils';
import {
  AttendanceEligibility,
  EventAudience,
  resolveAttendanceEligibility,
} from '@cacic-fct/shared-event-participation';
import { firstValueFrom } from 'rxjs';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { PublicationApiService } from '../graphql/publishing-api.service';
import { Event, EventGroup, EventGroupInput, EventSummary } from '@cacic-fct/event-manager-admin-contracts';
import { CloneAssetDialogComponent, CloneAssetDialogResult } from '../events/dialogs/clone-asset-dialog.component';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import {
  applyPagedResult,
  createWorkspaceListPagination,
  loadNextPage,
  loadPreviousPage,
  pageVariables,
  resetPagination,
} from '../pagination/list-pagination';
import { bindLiveSearch } from '../search/live-search';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { EventsService, CreationParentError, type CreationParentSummary } from '../events/events.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  normalizeAudienceCourseCodes,
  type AudienceInvitationPerson,
  type AudienceParentRestriction,
} from '../shared/audience-editor/audience-editor.models';

const DEFAULT_EVENT_GROUP_EMOJI = '❔';
const DEFAULT_DRAFT_EVENT_GROUP_NAME = 'Grupo sem título';
type CreationPublicationAction = 'DRAFT' | 'PUBLISH' | 'SCHEDULE';

@Service()
export class EventGroupsService {
  private readonly workspaceContext = inject(EventWorkspaceContextService);
  private selectionRequest = 0;
  private loadedSelectionId: string | null = null;
  private readonly majorsApi = inject(MajorEventApiService);
  private readonly api = inject(EventGroupApiService);
  private readonly eventsApi = inject(EventApiService);
  private readonly publicationApi = inject(PublicationApiService);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly eventsService = inject(EventsService);
  private readonly permissions = inject(PermissionsService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly eventGroups = signal<EventGroup[]>([]);
  readonly eventGroupsPagination = createWorkspaceListPagination();
  readonly eventSummaries = signal<EventSummary[]>([]);
  readonly selectedEventGroup = signal<EventGroup | null>(null);
  readonly eventGroupEvents = signal<Event[]>([]);
  readonly eventGroupEventSearchResults = signal<Event[]>([]);
  readonly eventGroupAudienceInvitations = signal<AudienceInvitationPerson[]>([]);
  readonly selectedEventGroupMajorEventRestriction = signal<AudienceParentRestriction | null>(null);
  readonly savingEventGroup = signal(false);
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
      return compareIsoDateDesc(aFirstEvent.startDate, bFirstEvent.startDate);
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
    majorEventId: [''],
    name: ['', [Validators.required]],
    emoji: [DEFAULT_EVENT_GROUP_EMOJI],
    interestEnabled: [false],
    attendanceEligibility: this.formBuilder.control<AttendanceEligibility | null>(null),
    audience: this.formBuilder.nonNullable.control<EventAudience>(EventAudience.PUBLIC),
    audienceCourseCodes: this.formBuilder.nonNullable.control<string[]>([]),
    requiresImageLicenseAgreement: [false],
    shouldIssueCertificate: [false],
    shouldIssueCertificateForNonPayingAttendees: [false],
    shouldIssueCertificateForNonSubscribedAttendees: [false],
    shouldIssueCertificateForEachEvent: [false],
    shouldIssuePartialCertificate: [false],
  });

  readonly eventGroupEventSearchForm = this.formBuilder.nonNullable.group({
    query: ['', [Validators.required]],
  });
  readonly eventGroupsSearchForm = this.formBuilder.nonNullable.group({
    query: [''],
  });
  private readonly editorRevision = signal(0);
  private readonly editorBaseline = signal('');
  readonly unsavedChanges = computed(() => {
    this.editorRevision();
    return this.editorBaseline() !== this.editorSignature();
  });

  constructor() {
    bindLiveSearch({
      control: this.eventGroupsSearchForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.searchEventGroups(),
    });
    bindLiveSearch({
      control: this.eventGroupEventSearchForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.searchEventsForSelectedGroup(),
    });
    this.eventGroupForm.controls.shouldIssueCertificate.valueChanges.subscribe(() =>
      this.syncCertificateRuleControls(),
    );
    this.eventGroupForm.valueChanges.subscribe(() => this.editorRevision.update((revision) => revision + 1));
    this.captureEditorBaseline();
  }

  setEventGroupAudienceInvitations(people: readonly AudienceInvitationPerson[]): void {
    this.eventGroupAudienceInvitations.set([...people]);
  }

  shouldManageAttendanceInvitations(): boolean {
    return (
      this.eventGroupForm.controls.audience.value === EventAudience.INVITATION_ONLY ||
      this.resolveEffectiveAttendanceEligibility() === AttendanceEligibility.INVITED_ONLY
    );
  }

  audiencePublicationError(): string | null {
    return this.shouldManageAttendanceInvitations() && this.eventGroupAudienceInvitations().length === 0
      ? 'Para publicar ou agendar, adicione ao menos uma pessoa convidada. O rascunho privado pode ser salvo sem convites.'
      : null;
  }

  audiencePublicationBlocked(): boolean {
    return this.audiencePublicationError() !== null;
  }

  audienceParentRestrictions(): AudienceParentRestriction[] {
    if (!(this.eventGroupForm.controls.majorEventId.value || this.selectedEventGroup()?.majorEventId)) {
      return [];
    }

    const restriction = this.selectedEventGroupMajorEventRestriction();
    return [restriction ?? {
      label: 'Grande evento associado (regra não carregada)',
      audience: null,
      audienceCourseCodes: [],
      attendanceEligibility: null,
      unavailable: true,
    }];
  }

  private resolveEffectiveAttendanceEligibility(): AttendanceEligibility {
    const parent = this.selectedEventGroupMajorEventRestriction();
    return resolveAttendanceEligibility({
      attendanceEligibility: this.eventGroupForm.controls.attendanceEligibility.value,
      majorEventId: this.eventGroupForm.controls.majorEventId.value || null,
      majorEvent: parent ? { attendanceEligibility: parent.attendanceEligibility } : null,
    });
  }

  async loadEventGroups(): Promise<void> {
    const query = this.eventGroupsSearchForm.controls.query.value.trim();
    const items = await firstValueFrom(
      this.api.listEventGroups({
        ...(query ? { query } : {}),
        ...pageVariables(this.eventGroupsPagination.pageIndex()),
      }),
    );
    this.eventGroups.set(applyPagedResult(items, this.eventGroupsPagination));
    await this.refreshEventSummaries();
    const selectedGroup = this.selectedEventGroup();
    if (selectedGroup) {
      const refreshed = this.eventGroups().find((group) => group.id === selectedGroup.id);
      if (refreshed) {
        this.selectedEventGroup.set(refreshed);
        this.refreshMajorEventRestriction(this.eventGroupEvents());
      }
    }
  }

  async previousEventGroupsPage(): Promise<void> {
    await loadPreviousPage(this.eventGroupsPagination, () => this.loadEventGroups());
  }

  async nextEventGroupsPage(): Promise<void> {
    await loadNextPage(this.eventGroupsPagination, () => this.loadEventGroups());
  }

  async searchEventGroups(): Promise<void> {
    resetPagination(this.eventGroupsPagination);
    await this.loadEventGroups();
  }

  private async refreshEventSummaries(): Promise<void> {
    this.eventSummaries.set(await firstValueFrom(this.eventsApi.listEventsSummary({ take: 200, isInGroup: true })));
  }

  async saveEventGroup(action: CreationPublicationAction = 'DRAFT'): Promise<void> {
    const saveRequest = this.selectionRequest;
    const hadLinkedEvents = this.eventGroupEvents().length > 0;
    if (this.savingEventGroup()) {
      return;
    }

    if (action === 'PUBLISH' && this.eventGroupForm.invalid) {
      this.eventGroupForm.markAllAsTouched();
      return;
    }

    const raw = this.eventGroupForm.getRawValue();
    if ((action === 'PUBLISH' || action === 'SCHEDULE') && this.audiencePublicationBlocked()) {
      return;
    }
    const payload = this.buildEventGroupPayload(action !== 'PUBLISH');

    this.savingEventGroup.set(true);
    try {
      let savedGroup: EventGroup;
      if (raw.id) {
        savedGroup = await firstValueFrom(this.api.updateEventGroup(raw.id, payload));
      } else {
        savedGroup = await firstValueFrom(this.api.createEventGroup(payload));
      }
      if (saveRequest === this.selectionRequest) {
        this.eventGroupForm.controls.id.setValue(savedGroup.id, { emitEvent: false });
        this.selectedEventGroup.set(savedGroup);
      }

      if (action === 'PUBLISH') {
        if (!hadLinkedEvents) {
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
        if (hadLinkedEvents) {
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

      if (saveRequest !== this.selectionRequest) return;
      this.populateEventGroupSelection(savedGroup);
      this.workspaceContext.context.update((context) => context?.kind === 'group' && context.id === savedGroup.id
        ? {...context,name:savedGroup.name,emoji:savedGroup.emoji} : context);
      await this.loadEventGroups();
      if (saveRequest !== this.selectionRequest) return;
      if (action === 'SCHEDULE') {
        void this.router.navigate(this.eventGroupPublicationRoute(savedGroup.id));
        return;
      }
      await this.loadEventsForGroup(savedGroup.id, saveRequest);
      if (saveRequest !== this.selectionRequest) return;
      await this.loadMajorEventRestriction(savedGroup.majorEventId, saveRequest);
      if (saveRequest !== this.selectionRequest) return;
      this.loadedSelectionId = savedGroup.id;
      void this.router.navigate(['/event-workspace', 'group', savedGroup.id, 'settings']);
    } catch (error) {
      this.feedback.error(error, 'Não foi possível salvar o grupo.');
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

  startNewEventGroup(navigate = true): void {
    this.selectionRequest++;
    this.loadedSelectionId = null;
    if (navigate) void this.router.navigate(['/event-workspace/new/group']);
    this.selectedEventGroup.set(null);
    this.selectedEventGroupMajorEventRestriction.set(null);
    this.eventGroupEvents.set([]);
    this.eventGroupAudienceInvitations.set([]);
    this.eventGroupEventSearchResults.set([]);
    this.eventGroupForm.reset({
      id: '',
      majorEventId: '',
      name: '',
      emoji: DEFAULT_EVENT_GROUP_EMOJI,
      interestEnabled: false,
      attendanceEligibility: null,
      audience: EventAudience.PUBLIC,
      audienceCourseCodes: [],
      requiresImageLicenseAgreement: false,
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
    });
    this.eventGroupEventSearchForm.reset(
      {
        query: '',
      },
      { emitEvent: false },
    );
    this.captureEditorBaseline();
  }

  async initializeNewEventGroup(majorEventId?: string | null): Promise<CreationParentSummary[]> {
    this.startNewEventGroup(false);
    const request = this.selectionRequest;
    if (!majorEventId) return [];
    const major = await firstValueFrom(this.majorsApi.getMajorEvent(majorEventId));
    if (request !== this.selectionRequest) return [];
    if (isFrozenMajorEvent(major) && !this.permissions.has(Permission.Frozen.Update)) {
      throw new CreationParentError('Este grande evento está congelado. É necessária permissão para alterar recursos antigos.');
    }
    this.eventGroupForm.controls.majorEventId.setValue(major.id);
    this.setMajorEventRestriction(major);
    this.captureEditorBaseline();
    return [{kind:'major-event',id:major.id,name:major.name,emoji:major.emoji}];
  }

  private async loadMajorEventRestriction(majorEventId: string | null | undefined, request: number): Promise<void> {
    if (!majorEventId) return;
    try {
      const major = await firstValueFrom(this.majorsApi.getMajorEvent(majorEventId));
      if (request === this.selectionRequest) this.setMajorEventRestriction(major);
    } catch {
      // Keep the explicit unavailable-parent warning when parent metadata cannot be read.
    }
  }

  private setMajorEventRestriction(major: { name: string; audience?: EventAudience; audienceCourseCodes?: string[]; attendanceEligibility?: AttendanceEligibility | null }): void {
    this.selectedEventGroupMajorEventRestriction.set({label:`Grande evento “${major.name}”`,audience:major.audience ?? EventAudience.PUBLIC,audienceCourseCodes:major.audienceCourseCodes ?? [],attendanceEligibility:major.attendanceEligibility});
  }

  async pickEventGroup(group: EventGroup): Promise<void> {
    void this.router.navigate(['/event-workspace', 'group', group.id, 'settings']);
    const request = ++this.selectionRequest;
    this.populateEventGroupSelection(group);
    await this.loadEventsForGroup(group.id, request);
    await this.loadMajorEventRestriction(group.majorEventId, request);
    if (request === this.selectionRequest) this.loadedSelectionId = group.id;
  }

  async pickEventGroupById(groupId: string): Promise<void> {
    const request = ++this.selectionRequest;
    if (this.loadedSelectionId === groupId && this.selectedEventGroup()?.id === groupId) {
      return;
    }

    const group = await firstValueFrom(this.api.getEventGroup(groupId));
    if (request !== this.selectionRequest) return;
    this.populateEventGroupSelection(group);
    await this.loadEventsForGroup(group.id, request);
    await this.loadMajorEventRestriction(group.majorEventId, request);
    if (request === this.selectionRequest) this.loadedSelectionId = group.id;
  }

  private populateEventGroupSelection(group: EventGroup): void {
    this.selectedEventGroup.set(group);
    this.selectedEventGroupMajorEventRestriction.set(null);
    this.eventGroupForm.reset({
      id: group.id,
      majorEventId: group.majorEventId ?? '',
      name: group.name,
      emoji: group.emoji || DEFAULT_EVENT_GROUP_EMOJI,
      interestEnabled: group.interestEnabled ?? false,
      attendanceEligibility: group.attendanceEligibility ?? null,
      audience: group.audience ?? EventAudience.PUBLIC,
      audienceCourseCodes: normalizeAudienceCourseCodes(group.audience),
      requiresImageLicenseAgreement: group.requiresImageLicenseAgreement ?? false,
      shouldIssueCertificate: group.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees: group.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees: group.shouldIssueCertificateForNonSubscribedAttendees,
      shouldIssueCertificateForEachEvent: group.shouldIssueCertificateForEachEvent,
      shouldIssuePartialCertificate: group.shouldIssuePartialCertificate,
    });
    this.eventGroupAudienceInvitations.set(
      (group.audienceInvitations ?? []).map((invitation) => invitation.person ?? { id: invitation.personId, name: 'Pessoa convidada (dados indisponíveis)', email: null, unresolved: true }),
    );
    this.eventGroupEventSearchForm.reset(
      {
        query: '',
      },
      { emitEvent: false },
    );
    this.eventGroupEventSearchResults.set([]);
    this.syncCertificateRuleControls();
    this.eventsService.eventGroupLookupForm.reset(
      {
        query: group.name,
      },
      { emitEvent: false },
    );
    this.captureEditorBaseline();
  }

  private editorSignature(): string {
    return JSON.stringify({
      form: this.eventGroupForm.getRawValue(),
      audienceInvitations: this.eventGroupAudienceInvitations().map((person) => person.id),
    });
  }

  private captureEditorBaseline(): void {
    this.editorBaseline.set(this.editorSignature());
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
      this.feedback.error(error, 'Não foi possível excluir o grupo.');
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
      this.feedback.error(error, 'Não foi possível duplicar o grupo.');
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

    if (selectedGroup.majorEventId && eventItem.majorEventId && selectedGroup.majorEventId !== eventItem.majorEventId) {
      this.feedback.error(
        new Error('Um evento vinculado ao grupo pertence a outro grande evento.'),
        'Não foi possível adicionar o evento ao grupo.',
      );
      return;
    }

    try {
      await firstValueFrom(
        this.eventsApi.updateEvent(eventItem.id, {
          eventGroupId: selectedGroup.id,
          ...(selectedGroup.majorEventId && !eventItem.majorEventId ? { majorEventId: selectedGroup.majorEventId } : {}),
          shouldIssueCertificate: selectedGroup.shouldIssueCertificate ? eventItem.shouldIssueCertificate : false,
        }),
      );
      await Promise.all([
        this.eventsService.loadEvents(),
        this.loadEventsForGroup(selectedGroup.id),
        this.refreshEventSummaries(),
      ]);
    } catch (error) {
      this.feedback.error(error, 'Não foi possível adicionar o evento ao grupo.');
    }
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
      this.refreshEventSummaries(),
    ]);
  }

  private async loadEventsForGroup(groupId: string, request = this.selectionRequest): Promise<void> {
    const events = await firstValueFrom(
      this.eventsApi.listEvents({
        eventGroupId: groupId,
        take: 200,
      }),
    );
    if (request !== this.selectionRequest || this.selectedEventGroup()?.id !== groupId) return;
    this.eventGroupEvents.set(events);
    this.refreshMajorEventRestriction(events);
  }

  private refreshMajorEventRestriction(events: readonly Event[]): void {
    const group = this.selectedEventGroup();
    if (!group?.majorEventId) {
      this.selectedEventGroupMajorEventRestriction.set(null);
      return;
    }

    const majorEvents = typeof this.eventsService.majorEvents === 'function'
      ? this.eventsService.majorEvents()
      : [];
    const majorEvent =
      majorEvents.find((item) => item.id === group.majorEventId) ??
      events.find((eventItem) => eventItem.majorEvent?.id === group.majorEventId)?.majorEvent;
    this.selectedEventGroupMajorEventRestriction.set(
      majorEvent
        ? {
            label: `Grande evento “${majorEvent.name}”`,
            audience: majorEvent.audience,
            audienceCourseCodes: majorEvent.audienceCourseCodes ?? [],
            attendanceEligibility: majorEvent.attendanceEligibility,
          }
        : null,
    );
  }

  getFirstEventForGroupDisplay(groupId: string): EventSummary | undefined {
    return this.firstEventsByGroupId().get(groupId);
  }

  private getFirstEventForGroup(groupId: string, events: EventSummary[]): EventSummary | undefined {
    return events
      .filter((event) => event.eventGroupId === groupId)
      .sort((a, b) => compareIsoDateAsc(a.startDate, b.startDate))
      .at(0);
  }

  private buildEventGroupPayload(allowIncompleteDraft: boolean): EventGroupInput {
    const raw = this.eventGroupForm.getRawValue();
    return {
      name: raw.name.trim() || (allowIncompleteDraft ? DEFAULT_DRAFT_EVENT_GROUP_NAME : ''),
      majorEventId: raw.majorEventId || null,
      emoji: raw.emoji.trim() || DEFAULT_EVENT_GROUP_EMOJI,
      interestEnabled: raw.interestEnabled,
      attendanceEligibility: raw.attendanceEligibility,
      audience: raw.audience,
      audienceCourseCodes: normalizeAudienceCourseCodes(raw.audience),
      invitationPersonIds: this.eventGroupAudienceInvitations().map((person) => person.id),
      requiresImageLicenseAgreement: raw.requiresImageLicenseAgreement,
      shouldIssueCertificate: raw.shouldIssueCertificate,
      shouldIssueCertificateForNonPayingAttendees:
        raw.shouldIssueCertificate && raw.shouldIssueCertificateForNonPayingAttendees,
      shouldIssueCertificateForNonSubscribedAttendees:
        raw.shouldIssueCertificate && raw.shouldIssueCertificateForNonSubscribedAttendees,
      shouldIssueCertificateForEachEvent: raw.shouldIssueCertificate && raw.shouldIssueCertificateForEachEvent,
      shouldIssuePartialCertificate: raw.shouldIssueCertificate && raw.shouldIssuePartialCertificate,
    };
  }

  private eventGroupPublicationRoute(groupId: string): string[] {
    return ['/publication', 'event-group', groupId];
  }

  private syncCertificateRuleControls(): void {
    const shouldIssueCertificate = this.eventGroupForm.controls.shouldIssueCertificate.value;
    const controls = [
      this.eventGroupForm.controls.shouldIssueCertificateForNonPayingAttendees,
      this.eventGroupForm.controls.shouldIssueCertificateForNonSubscribedAttendees,
      this.eventGroupForm.controls.shouldIssueCertificateForEachEvent,
      this.eventGroupForm.controls.shouldIssuePartialCertificate,
    ];

    for (const control of controls) {
      if (shouldIssueCertificate) {
        control.enable({ emitEvent: false });
      } else {
        control.setValue(false, { emitEvent: false });
        control.disable({ emitEvent: false });
      }
    }
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
