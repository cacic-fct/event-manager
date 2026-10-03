import type { EventTargetSelection } from '../shared/event-target-picker.component';
import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, Service, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { auditTime, firstValueFrom, Subscription } from 'rxjs';
import { watchReplayableEventSourcePing } from '@cacic-fct/shared-angular';
import {
  Event,
  EventForm,
  EventFormAudience,
  EventFormInput,
  EventFormLinkInput,
  EventFormResponseMode,
  EventFormResults,
  EventFormSigilo,
  EventFormTargetType,
  MajorEvent,
  parseFormElementsJson,
  serializeFormImageReferences,
  serializeFormElements,
} from '@cacic-fct/event-manager-admin-contracts';
import { type FormElement, type FormImage } from '@cacic-fct/form-contracts';
import { format, isBefore, isValid, parseISO } from 'date-fns';
import { EventApiService } from '../graphql/event-api.service';
import { EventFormApiService } from '../graphql/event-form-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { ShellUiService } from '../app-shell/ui.service';
import { isDateAfter } from '../shared/date-range-validator';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '../app-shell/dialogs/confirmation-dialog.component';
import { bindLiveSearch } from '../search/live-search';
import {
  applyPagedResult,
  createWorkspaceListPagination,
  loadNextPage,
  loadPreviousPage,
  pageVariables,
  resetPagination,
} from '../pagination/list-pagination';

type FormOwnerType = EventFormTargetType;

const EVENT_FORM_AUDIENCE_OPTIONS: readonly EventFormAudience[] = ['INTERESTED', 'SUBSCRIBERS', 'ATTENDEES'];

function normalizeAudiences(audiences: readonly EventFormAudience[] | null | undefined): EventFormAudience[] {
  if (audiences == null) {
    return ['SUBSCRIBERS', 'ATTENDEES'];
  }

  return [...new Set(audiences)].filter((audience): audience is EventFormAudience =>
    EVENT_FORM_AUDIENCE_OPTIONS.includes(audience),
  );
}

export interface EventFormLinkDraft {
  localId: string;
  id?: string | null;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  audiences?: EventFormAudience[] | null;
  insertInSubscriptionFlow?: boolean | null;
  requiredInSubscriptionFlow?: boolean | null;
  displayOrder?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  notifyOnPublish?: boolean | null;
  allowLecturerManualPublish?: boolean | null;
  priceTierIds?: string[] | null;
  targetName?: string | null;
  targetEmoji?: string | null;
}

type EditorFormValue = {
  id: string;
  name: string;
  description: string;
  ownerType: FormOwnerType;
  ownerEventId: string;
  ownerMajorEventId: string;
  sigilo: EventFormSigilo;
  responseMode: EventFormResponseMode;
  resultsPublic: boolean;
  resultsLive: boolean;
  allowResponseEdits: boolean;
  scheduledPublishAt: string;
};

type FormEditorState = {
  formValue: EditorFormValue;
  elements: FormElement[];
  descriptionImages: FormImage[];
  links: EventFormLinkDraft[];
  ownerTargetSummary: { type: FormOwnerType; id: string; name: string; emoji?: string | null } | null;
};


@Service()
export class FormsService {
  private readonly singleImageCache = new WeakMap<FormImage, readonly FormImage[]>();
  private readonly imageTextControls = new Map<string, FormControl<string>>();
  private readonly api = inject(EventFormApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly eventApi = inject(EventApiService);
  private readonly majorEventApi = inject(MajorEventApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dialog = inject(MatDialog);
  private readonly snackbar = inject(MatSnackBar);
  private readonly feedback = inject(AdminFeedbackService);
  private readonly router = inject(Router);
  private readonly ui = inject(ShellUiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly loading = this.ui.loading;
  readonly forms = signal<EventForm[]>([]);
  readonly selectedForm = signal<EventForm | null>(null);
  readonly selectedResults = signal<EventFormResults | null>(null);
  readonly elements = signal<FormElement[]>([]);
  readonly descriptionImages = signal<FormImage[]>([]);
  readonly uploadingImageTarget = signal<string | null>(null);
  readonly links = signal<EventFormLinkDraft[]>([]);
  readonly previousSubscriberCounts = signal<Record<string, number | null>>({});
  readonly events = signal<Event[]>([]);
  readonly majorEvents = signal<MajorEvent[]>([]);
  readonly targetFilter = signal<{ eventId?: string; majorEventId?: string } | null>(null);
  private readonly ownerTargetSummary = signal<{ type: FormOwnerType; id: string; name: string; emoji?: string | null } | null>(null);
  readonly formsPagination = createWorkspaceListPagination();
  readonly targetSearchLoading = signal(false);
  readonly targetFilterId = computed(() => {
    const filter = this.targetFilter();
    return filter?.eventId ? `event:${filter.eventId}` : filter?.majorEventId ? `major-event:${filter.majorEventId}` : null;
  });
  readonly targetFilterLabel = computed(() => {
    const filter = this.targetFilter();
    if (filter?.eventId) {
      return this.events().find((event) => event.id === filter.eventId)?.name ?? 'Evento selecionado';
    }
    if (filter?.majorEventId) {
      return this.majorEvents().find((event) => event.id === filter.majorEventId)?.name ?? 'Grande evento selecionado';
    }
    return 'Todos os formulários';
  });
  readonly selectedFormPublished = computed(() => this.selectedForm()?.publicationState === 'PUBLISHED');
  readonly selectedFormScheduled = computed(() => this.selectedForm()?.publicationState === 'SCHEDULED');
  readonly hasInvalidLinkAudiences = computed(() => this.links().some((link) => !link.audiences?.length));
  readonly hasUntitledQuestions = computed(() =>
    this.elements().some((element) => this.isQuestion(element) && !element.title.trim()),
  );
  readonly selectableEvents = computed(() => {
    const selectedIds = this.selectedEventIds();
    return this.events().filter((event) => selectedIds.has(event.id) || this.isOngoingOrFuture(event.endDate));
  });
  readonly selectableMajorEvents = computed(() => {
    const selectedIds = this.selectedMajorEventIds();
    return this.majorEvents().filter(
      (majorEvent) => selectedIds.has(majorEvent.id) || this.isOngoingOrFuture(majorEvent.endDate),
    );
  });
  private readonly selectedEventIds = computed(() => {
    const ids = new Set<string>();
    const ownerEventId = this.form.controls.ownerEventId.value;
    if (ownerEventId) {
      ids.add(ownerEventId);
    }
    const targetFilter = this.targetFilter();
    if (targetFilter?.eventId) {
      ids.add(targetFilter.eventId);
    }
    for (const link of this.links()) {
      if (link.eventId) {
        ids.add(link.eventId);
      }
    }
    return ids;
  });
  private readonly selectedMajorEventIds = computed(() => {
    const ids = new Set<string>();
    const ownerMajorEventId = this.form.controls.ownerMajorEventId.value;
    if (ownerMajorEventId) {
      ids.add(ownerMajorEventId);
    }
    const targetFilter = this.targetFilter();
    if (targetFilter?.majorEventId) {
      ids.add(targetFilter.majorEventId);
    }
    for (const link of this.links()) {
      if (link.majorEventId) {
        ids.add(link.majorEventId);
      }
    }
    return ids;
  });
  private resultsStream: Subscription | null = null;
  private resultsStreamGeneration = 0;
  private resultsStreamFormId: string | null = null;
  private resultsStreamRecoveryAttempted = false;
  private loadResultsRequestId = 0;
  private loadFormsRequestId = 0;
  private loadTargetsRequestId = 0;
  private editorGeneration = 0;
  private selectionRequest = 0;
  private pendingSelectionRequest: number | null = null;
  private savedEditorState: FormEditorState;

  readonly filtersForm = this.formBuilder.nonNullable.group({
    query: [''],
  });
  readonly targetSearchForm = this.formBuilder.nonNullable.group({
    query: [''],
  });

  readonly form = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    description: [''],
    ownerType: ['EVENT' as FormOwnerType],
    ownerEventId: [''],
    ownerMajorEventId: [''],
    sigilo: ['SECRET' as EventFormSigilo],
    responseMode: ['ONE_PER_TARGET' as EventFormResponseMode],
    resultsPublic: [false],
    resultsLive: [{ value: false, disabled: true }],
    allowResponseEdits: [false],
    scheduledPublishAt: [''],
  });
  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  private readonly editorFormValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private readonly savedEditorSnapshot = signal('');
  readonly unsavedChanges = computed(() => {
    this.editorFormValue();
    return this.editorStateSignature() !== this.savedEditorSnapshot();
  });
  readonly canSave = computed(() => {
    this.formStatus();
    return !this.form.invalid && !this.hasInvalidLinkDateRange() && !this.hasInvalidLinkAudiences() && !this.hasUntitledQuestions();
  });

  constructor() {
    this.form.controls.resultsPublic.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((resultsPublic) => {
        const control = this.form.controls.resultsLive;
        if (resultsPublic) control.enable({ emitEvent: false });
        else control.disable({ emitEvent: false });
      });
    this.savedEditorState = this.captureEditorState();
    this.savedEditorSnapshot.set(this.editorStateSignature(this.savedEditorState));
    this.destroyRef.onDestroy(() => this.closeResultsStream());
    bindLiveSearch({
      control: this.filtersForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.applyFormFilters(),
    });
    bindLiveSearch({
      control: this.targetSearchForm.controls.query,
      destroyRef: this.destroyRef,
      search: () => this.loadTargets(),
    });
  }

  async initialize(): Promise<void> {
    if (this.events().length === 0 || this.majorEvents().length === 0) {
      await Promise.all([this.loadTargets(), this.loadForms()]);
      return;
    }

    await this.loadForms();
  }

  async loadTargets(): Promise<void> {
    const requestId = ++this.loadTargetsRequestId;
    this.targetSearchLoading.set(true);
    try {
      const query = this.targetSearchForm.controls.query.value.trim() || undefined;
      const [events, majorEvents] = await Promise.all([
        firstValueFrom(this.eventApi.listEvents({ query, take: 20 })),
        firstValueFrom(this.majorEventApi.listMajorEvents({ query, take: 20 })),
      ]);
      if (requestId !== this.loadTargetsRequestId) return;
      this.events.set(this.keepSelectedEvents(events));
      this.majorEvents.set(this.keepSelectedMajorEvents(majorEvents));
    } catch (error) {
      if (requestId === this.loadTargetsRequestId) {
        this.showError(error, 'Não foi possível buscar os contextos de formulário.');
      }
    } finally {
      if (requestId === this.loadTargetsRequestId) this.targetSearchLoading.set(false);
    }
  }

  async loadForms(options: { preserveEditor?: boolean } = {}): Promise<void> {
    const requestId = ++this.loadFormsRequestId;
    const requestContext = this.formsRequestContext();
    this.ui.loading.set(true);
    try {
      const forms = await firstValueFrom(
        this.api.listForms({
          query: requestContext.query,
          eventId: requestContext.eventId,
          majorEventId: requestContext.majorEventId,
          ...pageVariables(this.formsPagination.pageIndex()),
        }),
      );
      if (!this.isCurrentFormsRequest(requestId, requestContext)) {
        return;
      }
      this.forms.set(applyPagedResult(forms, this.formsPagination));
      const selected = this.selectedForm();
      if (selected && !options.preserveEditor && !this.unsavedChanges()) {
        const refreshed = forms.find((form) => form.id === selected.id) ?? null;
        if (refreshed) {
          this.patchSelectedForm(refreshed);
          await this.loadResults();
        }
      }
    } catch (error) {
      if (this.isCurrentFormsRequest(requestId, requestContext)) {
        this.showError(error, 'Não foi possível carregar os formulários.');
      }
    } finally {
      if (this.isCurrentFormsRequestId(requestId)) {
        this.ui.loading.set(false);
      }
    }
  }

  async createForm(navigate = true): Promise<void> {
    const request = ++this.selectionRequest;
    if (this.unsavedChanges() && !(await this.confirmDiscardChanges())) return;
    if (request !== this.selectionRequest) return;
    this.clearSelectedForm();
    if (navigate) void this.router.navigate(this.formsRoute());
  }

  async confirmDiscardChanges(): Promise<boolean> {
    if (!this.unsavedChanges()) {
      return true;
    }

    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(ConfirmationDialogComponent, {
          data: {
            title: 'Descartar alterações do formulário?',
            message: 'Há alterações não salvas neste formulário.',
            details: [
              'Perguntas, imagens e vínculos alterados serão restaurados para o último estado salvo.',
              'Use “Salvar rascunho” para manter o trabalho antes de sair.',
            ],
            confirmLabel: 'Descartar alterações',
            tone: 'danger',
          },
          width: 'min(30rem, 96vw)',
        })
        .afterClosed(),
    );
    if (confirmed === true) {
      this.discardChanges(false);
    }
    return confirmed === true;
  }

  discardChanges(showFeedback = true): void {
    if (!this.unsavedChanges() || !this.savedEditorState) {
      return;
    }

    this.restoreEditorState(this.savedEditorState);
    if (showFeedback) {
      this.snackbar.open('Alterações descartadas.', 'Fechar', { duration: 2500 });
    }
  }

  async setTargetFilter(filter: { eventId?: string; majorEventId?: string } | null): Promise<boolean> {
    const currentFilter = this.targetFilter();
    const scopeChanged =
      currentFilter?.eventId !== filter?.eventId || currentFilter?.majorEventId !== filter?.majorEventId;
    if (scopeChanged && !(await this.confirmDiscardChanges())) {
      return false;
    }
    if (scopeChanged) {
      this.targetFilter.set(filter);
      this.forms.set([]);
      resetPagination(this.formsPagination);
      this.clearSelectedForm();
    }
    if (filter?.eventId && !this.events().some((event) => event.id === filter.eventId)) {
      try {
        const event = await firstValueFrom(this.eventApi.getEvent(filter.eventId));
        this.events.update((events) => [event, ...events]);
      } catch {
        // The collection remains usable even when the contextual target is no longer readable.
      }
    }
    if (filter?.majorEventId && !this.majorEvents().some((event) => event.id === filter.majorEventId)) {
      try {
        const majorEvent = await firstValueFrom(this.majorEventApi.getMajorEvent(filter.majorEventId));
        this.majorEvents.update((events) => [majorEvent, ...events]);
      } catch {
        // The collection remains usable even when the contextual target is no longer readable.
      }
    }
    return true;
  }

  async selectAllForms(): Promise<void> {
    await this.changeTargetFilter(null, ['/forms']);
  }

  async selectEventScope(event: Event): Promise<void> {
    await this.changeTargetFilter({ eventId: event.id }, ['/forms', 'event', event.id]);
  }

  async selectMajorEventScope(majorEvent: MajorEvent): Promise<void> {
    await this.changeTargetFilter({ majorEventId: majorEvent.id }, ['/forms', 'major-event', majorEvent.id]);
  }

  currentScopeRoute(): string[] {
    const filter = this.targetFilter();
    if (filter?.eventId) {
      return ['/forms', 'event', filter.eventId];
    }
    if (filter?.majorEventId) {
      return ['/forms', 'major-event', filter.majorEventId];
    }
    return ['/forms'];
  }

  ownerTargetName(): string {
    const value = this.form.getRawValue();
    const id = value.ownerType === 'EVENT' ? value.ownerEventId : value.ownerMajorEventId;
    if (!id) {
      return '';
    }
    const summary = this.ownerTargetSummary();
    if (summary?.type === value.ownerType && summary.id === id) {
      return summary.name;
    }
    return value.ownerType === 'EVENT'
      ? this.events().find((event) => event.id === id)?.name ?? 'Evento selecionado'
      : this.majorEvents().find((majorEvent) => majorEvent.id === id)?.name ?? 'Grande evento selecionado';
  }

  ownerTargetEmoji(): string | null {
    const value = this.form.getRawValue();
    const id = value.ownerType === 'EVENT' ? value.ownerEventId : value.ownerMajorEventId;
    if (!id) {
      return null;
    }
    const summary = this.ownerTargetSummary();
    if (summary?.type === value.ownerType && summary.id === id) {
      return summary.emoji ?? null;
    }
    return value.ownerType === 'EVENT'
      ? this.events().find((event) => event.id === id)?.emoji ?? null
      : this.majorEvents().find((majorEvent) => majorEvent.id === id)?.emoji ?? null;
  }

  setOwnerTarget(selection: EventTargetSelection): void {
    const ownerType = this.form.controls.ownerType.value;
    this.form.patchValue(
      ownerType === 'EVENT'
        ? { ownerEventId: selection.id, ownerMajorEventId: '' }
        : { ownerEventId: '', ownerMajorEventId: selection.id },
    );
    this.ownerTargetSummary.set({ type: ownerType, ...selection });
  }

  linkTargetName(link: EventFormLinkDraft): string {
    return link.targetName || this.targetName(link);
  }

  linkTargetEmoji(link: EventFormLinkDraft): string | null {
    if (link.targetEmoji) {
      return link.targetEmoji;
    }
    if (link.targetType === 'EVENT') {
      return this.events().find((event) => event.id === link.eventId)?.emoji ?? null;
    }
    return this.majorEvents().find((majorEvent) => majorEvent.id === link.majorEventId)?.emoji ?? null;
  }

  setLinkTarget(localId: string, selection: EventTargetSelection): void {
    const link = this.links().find((item) => item.localId === localId);
    if (!link) {
      return;
    }
    this.updateLink(
      localId,
      link.targetType === 'EVENT'
        ? { eventId: selection.id, majorEventId: null, targetName: selection.name, targetEmoji: selection.emoji }
        : { eventId: null, majorEventId: selection.id, targetName: selection.name, targetEmoji: selection.emoji },
    );
  }

  async applyFormFilters(): Promise<void> {
    resetPagination(this.formsPagination);
    await this.loadForms();
  }

  async previousFormsPage(): Promise<void> {
    await loadPreviousPage(this.formsPagination, () => this.loadForms());
  }

  async nextFormsPage(): Promise<void> {
    await loadNextPage(this.formsPagination, () => this.loadForms());
  }

  async selectForm(form: EventForm): Promise<void> {
    const scope = this.targetFilter();
    if (await this.selectFormById(form.id)) {
      if (this.selectedForm()?.id !== form.id || this.targetFilter() !== scope) return;
      if (scope) void this.router.navigate(['/forms', form.id], { queryParams: scope });
      else void this.router.navigate(['/forms', form.id]);
    }
  }

  async selectFormById(formId: string, options: { skipIfCurrent?: boolean } = {}): Promise<boolean> {
    if (options.skipIfCurrent && this.selectedForm()?.id === formId) {
      return true;
    }

    const request = ++this.selectionRequest;
    if (this.unsavedChanges() && !(await this.confirmDiscardChanges())) return false;
    if (request !== this.selectionRequest) return false;
    const generation = this.editorGeneration;
    const snapshot = this.editorStateSignature();
    const scope = this.targetFilter();
    this.pendingSelectionRequest = request;
    this.ui.loading.set(true);
    try {
      const detail = await firstValueFrom(this.api.getForm(formId));
      if (request !== this.selectionRequest || generation !== this.editorGeneration ||
        this.targetFilter() !== scope || this.editorStateSignature() !== snapshot) return false;
      this.patchSelectedForm(detail);
      await this.loadResults();
      return request === this.selectionRequest && this.selectedForm()?.id === formId && this.targetFilter() === scope;
    } catch (error) {
      if (request === this.selectionRequest) this.showError(error, 'Não foi possível abrir o formulário.');
      return false;
    } finally {
      if (this.pendingSelectionRequest === request) {
        this.pendingSelectionRequest = null;
        this.ui.loading.set(false);
      }
    }
  }

  cancelPendingSelection(): void {
    this.selectionRequest++;
    if (this.pendingSelectionRequest !== null) {
      this.pendingSelectionRequest = null;
      this.ui.loading.set(false);
    }
  }

  updateElements(elements: FormElement[]): void {
    this.elements.set(elements);
  }

  async uploadImage(file: File | null, elementId?: string): Promise<void> {
    if (!file) return;
    if (this.uploadingImageTarget() !== null) return;
    if (!this.validateForSave()) return;
    const formId = this.selectedForm()?.id ?? null;
    const formValue = this.form.getRawValue();
    const target = elementId ?? 'form';
    this.uploadingImageTarget.set(target);
    try {
      const image = await firstValueFrom(
        this.api.uploadImage(formId, file, {
          ownerEventId: formValue.ownerType === 'EVENT' ? formValue.ownerEventId : null,
          ownerMajorEventId: formValue.ownerType === 'MAJOR_EVENT' ? formValue.ownerMajorEventId : null,
        }),
      );
      const alreadyUsedHere = elementId
        ? this.elements()
            .find((element) => element.id === elementId)
            ?.descriptionImages?.some((item) => item.id === image.id)
        : this.descriptionImages().some((item) => item.id === image.id);
      if (alreadyUsedHere) {
        this.snackbar.open('Esta imagem já está adicionada neste local.', 'Fechar', { duration: 3000 });
        return;
      }
      if (elementId) {
        this.elements.update((elements) =>
          elements.map((element) =>
            element.id === elementId
              ? { ...element, descriptionImages: [...(element.descriptionImages ?? []), image] }
              : element,
          ),
        );
      } else {
        this.descriptionImages.update((images) => [...images, image]);
      }
      if (this.selectedFormPublished()) {
        this.snackbar.open('Imagem adicionada à edição. Salve o rascunho para preservá-la.', 'Fechar', {
          duration: 4500,
        });
      } else if (formId) {
        const saveInput = this.toInput();
        const saved = await firstValueFrom(this.api.saveForm(saveInput));
        if (JSON.stringify(this.toInput()) === JSON.stringify(saveInput)) {
          this.patchSelectedForm(saved);
          await this.loadForms({ preserveEditor: true });
        }
        this.snackbar.open('Imagem adicionada ao formulário.', 'Fechar', { duration: 3000 });
      } else {
        this.snackbar.open('Imagem pronta. Salve o formulário para preservá-la.', 'Fechar', { duration: 4000 });
      }
    } catch (error) {
      this.showError(error, 'Não foi possível enviar a imagem.');
    } finally {
      this.uploadingImageTarget.set(null);
    }
  }

  async removeImage(image: FormImage, elementId?: string): Promise<void> {
    if (this.uploadingImageTarget() !== null) return;
    const formId = this.selectedForm()?.id;
    const target = elementId ?? 'form';
    let saveInput: EventFormInput | null = null;
    this.uploadingImageTarget.set(target);
    try {
      if (elementId) {
        this.elements.update((elements) =>
          elements.map((element) =>
            element.id === elementId
              ? {
                  ...element,
                  descriptionImages: (element.descriptionImages ?? []).filter((item) => item.id !== image.id),
                }
              : element,
          ),
        );
      } else {
        this.descriptionImages.update((images) => images.filter((item) => item.id !== image.id));
      }
      if (formId && !this.selectedFormPublished()) {
        saveInput = this.toInput();
        const saved = await firstValueFrom(this.api.saveForm(saveInput));
        if (JSON.stringify(this.toInput()) === JSON.stringify(saveInput)) {
          this.patchSelectedForm(saved);
          await this.loadForms({ preserveEditor: true });
        }
        this.snackbar.open('Imagem removida.', 'Fechar', { duration: 2500 });
      } else {
        this.snackbar.open(
          this.selectedFormPublished()
            ? 'Imagem removida da edição. Salve o rascunho para preservar a alteração.'
            : 'Imagem removida.',
          'Fechar',
          { duration: 4000 },
        );
      }
    } catch (error) {
      if (formId && saveInput && JSON.stringify(this.toInput()) === JSON.stringify(saveInput)) {
        const restored = await firstValueFrom(this.api.getForm(formId));
        this.patchSelectedForm(restored);
      }
      this.showError(error, 'Não foi possível remover a imagem.');
    } finally {
      this.uploadingImageTarget.set(null);
    }
  }

  imageTextControl(image: FormImage, key: 'altText' | 'caption'): FormControl<string> {
    const cacheKey = `${image.id}:${key}`;
    const expectedValue = image[key] ?? '';
    const cached = this.imageTextControls.get(cacheKey);
    if (cached) {
      if (cached.value !== expectedValue) cached.setValue(expectedValue, { emitEvent: false });
      return cached;
    }
    const control = new FormControl(expectedValue, { nonNullable: true });
    control.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.descriptionImages.update((images) =>
        images.map((item) => (item.id === image.id ? { ...item, [key]: value || undefined } : item)),
      );
    });
    this.imageTextControls.set(cacheKey, control);
    return control;
  }

  singleImage(image: FormImage): readonly FormImage[] {
    const cached = this.singleImageCache.get(image);
    if (cached) return cached;
    const value = [image] as const;
    this.singleImageCache.set(image, value);
    return value;
  }

  addLink(targetType: EventFormTargetType): void {
    const link = this.createLinkDraft(targetType, this.links().length);
    this.links.update((links) => [...links, link]);
    void this.refreshPreviousSubscriberCount(link);
  }

  removeLink(localId: string): void {
    this.links.update((links) => links.filter((link) => link.localId !== localId));
    this.previousSubscriberCounts.update((counts) => {
      const remaining = { ...counts };
      delete remaining[localId];
      return remaining;
    });
  }

  updateLink(localId: string, patch: Partial<EventFormLinkDraft>): void {
    const current = this.links().find((link) => link.localId === localId);
    if (!current) {
      return;
    }
    const startsRequiredSubscriptionFlow =
      patch.requiredInSubscriptionFlow === true &&
      !(current.insertInSubscriptionFlow && current.requiredInSubscriptionFlow);
    const updated = this.normalizeLinkDraft(
      {
        ...current,
        ...patch,
        ...(patch.targetType && patch.targetType !== current.targetType
          ? { targetName: null, targetEmoji: null }
          : {}),
        ...(startsRequiredSubscriptionFlow && patch.notifyOnPublish === undefined ? { notifyOnPublish: true } : {}),
      },
      current,
    );
    this.links.update((links) => links.map((link) => (link.localId === localId ? updated : link)));
    void this.refreshPreviousSubscriberCount(updated);
  }

  updateLinkDate(localId: string, key: 'availableFrom' | 'availableUntil', value: string): void {
    this.updateLink(localId, { [key]: value || null });
  }

  priceTiersForLink(link: EventFormLinkDraft) {
    if (link.targetType !== 'MAJOR_EVENT' || !link.majorEventId) {
      return [];
    }
    const price = this.majorEvents()
      .find((majorEvent) => majorEvent.id === link.majorEventId)
      ?.majorEventPrices.find((candidate) => candidate.type === 'TIERED');
    return price?.tiers ?? [];
  }

  hasInvalidLinkDateRange(localId?: string): boolean {
    return this.links().some(
      (link) =>
        (localId === undefined || link.localId === localId) && isDateAfter(link.availableFrom, link.availableUntil),
    );
  }

  async save(): Promise<void> {
    if (!this.validateForSave()) {
      this.form.markAllAsTouched();
      return;
    }

    const submittedState = this.captureEditorState();
    const submittedSnapshot = this.editorStateSignature(submittedState);
    const editorGeneration = this.editorGeneration;
    this.ui.loading.set(true);
    try {
      const saved = await firstValueFrom(
        this.api.saveForm(
          this.toInput(
            submittedState.formValue,
            submittedState.elements,
            submittedState.descriptionImages,
            submittedState.links,
          ),
        ),
      );
      if (editorGeneration !== this.editorGeneration) {
        return;
      }
      const changedWhileSaving = this.editorStateSignature() !== submittedSnapshot;
      if (!changedWhileSaving) {
        this.patchSelectedForm(saved);
      } else {
        const currentState = this.captureEditorState();
        currentState.formValue.id = saved.id;
        this.patchSelectedForm(saved);
        this.restoreEditorState(currentState);
      }
      await this.loadForms({ preserveEditor: true });
      this.snackbar.open('Formulário salvo.', 'Fechar', { duration: 3000 });
    } catch (error) {
      this.showError(error, 'Não foi possível salvar o formulário.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  async saveDraft(): Promise<void> {
    if (!this.validateForSave()) {
      this.form.markAllAsTouched();
      return;
    }

    const selected = this.selectedForm();
    if (!selected) {
      await this.save();
      return;
    }

    const submittedState = this.captureEditorState();
    const submittedSnapshot = this.editorStateSignature(submittedState);
    const editorGeneration = this.editorGeneration;
    this.ui.loading.set(true);
    try {
      await firstValueFrom(
        this.api.saveDraft({
          sourceFormId: selected.id,
          input: this.toInput(
            submittedState.formValue,
            submittedState.elements,
            submittedState.descriptionImages,
            submittedState.links,
          ),
        }),
      );
      if (editorGeneration !== this.editorGeneration) {
        return;
      }
      this.setSavedEditorBaseline(
        this.editorStateSignature() === submittedSnapshot ? this.captureEditorState() : submittedState,
      );
      this.snackbar.open('Rascunho salvo.', 'Fechar', { duration: 3000 });
    } catch (error) {
      this.showError(error, 'Não foi possível salvar o rascunho.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  async publishNow(): Promise<void> {
    await this.publish(null);
  }

  async schedulePublication(): Promise<void> {
    const value = this.form.controls.scheduledPublishAt.value;
    const scheduledPublishAt = this.localInputToIso(value);
    if (!scheduledPublishAt) {
      this.snackbar.open('Informe data e hora para agendar.', 'Fechar', { duration: 3000 });
      return;
    }
    await this.publish(scheduledPublishAt);
  }

  async unpublish(): Promise<void> {
    const selected = this.selectedForm();
    if (!selected) {
      return;
    }

    this.ui.loading.set(true);
    try {
      const updated = await firstValueFrom(this.api.unpublishForm(selected.id));
      this.patchSelectedForm(updated);
      await this.loadForms({ preserveEditor: true });
      this.snackbar.open('Formulário removido do ar.', 'Fechar', { duration: 3000 });
    } catch (error) {
      this.showError(error, 'Não foi possível despublicar o formulário.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  async delete(): Promise<void> {
    const selected = this.selectedForm();
    if (!selected) {
      return;
    }

    this.ui.loading.set(true);
    try {
      await firstValueFrom(this.api.deleteForm(selected.id));
      if (this.selectedForm()?.id === selected.id) {
        this.clearSelectedForm();
        void this.router.navigate(this.formsRoute());
      }
      await this.loadForms({ preserveEditor: true });
      this.snackbar.open('Formulário excluído.', 'Fechar', { duration: 3000 });
    } catch (error) {
      this.showError(error, 'Não foi possível excluir o formulário.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  async loadResults(): Promise<void> {
    const requestId = ++this.loadResultsRequestId;
    const selected = this.selectedForm();
    if (!selected) {
      this.selectedResults.set(null);
      return;
    }

    try {
      const results = await firstValueFrom(this.api.results(selected.id));
      if (requestId !== this.loadResultsRequestId || this.selectedForm()?.id !== selected.id) {
        return;
      }
      this.selectedResults.set(results);
      this.reconcileSelectedFormResultCount(selected.id, results.responseCount);
    } catch {
      // Keep the last good result snapshot visible when a manual or live refresh fails.
    }
  }

  exportUrl(form: EventForm): string {
    return `/api/event-forms/${encodeURIComponent(form.id)}/results.csv`;
  }

  linkedTargetSummary(form: EventForm): string {
    const targets = form.links
      .map((link) => link.target?.name ?? this.targetName(link))
      .filter((target, index, all) => target && all.indexOf(target) === index);
    if (targets.length === 0) {
      return 'Sem vínculos de exibição';
    }
    if (targets.length <= 2) {
      return targets.join(' · ');
    }
    return `${targets.slice(0, 2).join(' · ')} +${targets.length - 2}`;
  }

  targetName(link: Pick<EventFormLinkDraft, 'targetType' | 'eventId' | 'majorEventId'>): string {
    if (link.targetType === 'EVENT') {
      return this.events().find((event) => event.id === link.eventId)?.name ?? 'Evento selecionado';
    }
    return this.majorEvents().find((event) => event.id === link.majorEventId)?.name ?? 'Grande evento selecionado';
  }

  previousSubscriberCount(link: Pick<EventFormLinkDraft, 'localId'>): number | null {
    return this.previousSubscriberCounts()[link.localId] ?? null;
  }

  private async publish(scheduledPublishAt: string | null): Promise<void> {
    const selected = this.selectedForm();
    if (!selected) {
      await this.save();
    }
    const current = this.selectedForm();
    if (!current) {
      return;
    }

    this.ui.loading.set(true);
    try {
      const updated = await firstValueFrom(this.api.publishForm({ formId: current.id, scheduledPublishAt }));
      this.patchSelectedForm(updated);
      await this.loadForms({ preserveEditor: true });
      this.snackbar.open(scheduledPublishAt ? 'Publicação agendada.' : 'Formulário publicado.', 'Fechar', {
        duration: 3000,
      });
    } catch (error) {
      this.showError(error, 'Não foi possível publicar o formulário.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  private patchSelectedForm(form: EventForm): void {
    this.editorGeneration++;
    this.loadResultsRequestId++;
    this.selectedForm.set(form);
    this.selectedResults.set(null);
    this.elements.set(parseFormElementsJson(form.elementsJson));
    this.descriptionImages.set(form.descriptionImages ?? []);
    this.links.set(form.links.map((link) => this.toLinkDraft(link)));
    for (const link of this.links()) {
      void this.refreshPreviousSubscriberCount(link);
    }
    this.form.reset({
      id: form.id,
      name: form.name,
      description: form.description ?? '',
      ownerType: form.ownerEventId ? 'EVENT' : 'MAJOR_EVENT',
      ownerEventId: form.ownerEventId ?? '',
      ownerMajorEventId: form.ownerMajorEventId ?? '',
      sigilo: form.sigilo,
      responseMode: form.responseMode,
      resultsPublic: form.resultsPublic,
      resultsLive: form.resultsLive,
      allowResponseEdits: form.allowResponseEdits,
      scheduledPublishAt: form.scheduledPublishAt ? this.toLocalInput(form.scheduledPublishAt) : '',
    });
    this.setOwnerTargetSummary(form.owner);
    this.setSavedEditorBaseline();
    this.syncLiveResultsStream(form);
  }

  private clearSelectedForm(): void {
    this.cancelPendingSelection();
    this.editorGeneration++;
    this.loadResultsRequestId++;
    this.selectedForm.set(null);
    this.selectedResults.set(null);
    this.closeResultsStream();
    this.elements.set([]);
    this.descriptionImages.set([]);
    this.links.set([]);
    this.previousSubscriberCounts.set({});
    const owner = this.defaultOwner();
    this.form.reset({
      id: '',
      name: '',
      description: '',
      ownerType: owner.type,
      ownerEventId: owner.type === 'EVENT' ? owner.id : '',
      ownerMajorEventId: owner.type === 'MAJOR_EVENT' ? owner.id : '',
      sigilo: 'SECRET',
      responseMode: 'ONE_PER_TARGET',
      resultsPublic: false,
      resultsLive: false,
      allowResponseEdits: false,
      scheduledPublishAt: '',
    });
    this.setOwnerTargetSummary(null);
    this.setSavedEditorBaseline();
  }

  private setOwnerTargetSummary(
    summary: EventForm['owner'] | null | undefined,
  ): void {
    this.ownerTargetSummary.set(
      summary
        ? { type: summary.type, id: summary.id, name: summary.name, emoji: summary.emoji }
        : null,
    );
  }

  private captureEditorState(): FormEditorState {
    const value = this.form.getRawValue();
    return this.cloneEditorState({
      formValue: {
        id: value.id,
        name: value.name,
        description: value.description,
        ownerType: value.ownerType,
        ownerEventId: value.ownerEventId,
        ownerMajorEventId: value.ownerMajorEventId,
        sigilo: value.sigilo,
        responseMode: value.responseMode,
        resultsPublic: value.resultsPublic,
        resultsLive: value.resultsLive,
        allowResponseEdits: value.allowResponseEdits,
        scheduledPublishAt: value.scheduledPublishAt,
      },
      elements: this.elements(),
      descriptionImages: this.descriptionImages(),
      links: this.links(),
      ownerTargetSummary: this.ownerTargetSummary(),
    });
  }

  private cloneEditorState(state: FormEditorState): FormEditorState {
    return JSON.parse(JSON.stringify(state)) as FormEditorState;
  }

  private editorStateSignature(state = this.captureEditorState()): string {
    return JSON.stringify({
      ownerType: state.formValue.ownerType,
      scheduledPublishAt: state.formValue.scheduledPublishAt,
      input: this.toInput(state.formValue, state.elements, state.descriptionImages, state.links),
    });
  }

  private restoreEditorState(state: FormEditorState): void {
    const next = this.cloneEditorState(state);
    this.form.reset(next.formValue);
    this.elements.set(next.elements);
    this.descriptionImages.set(next.descriptionImages);
    this.links.set(next.links);
    this.ownerTargetSummary.set(next.ownerTargetSummary);
    this.previousSubscriberCounts.set({});
    for (const link of next.links) {
      void this.refreshPreviousSubscriberCount(link);
    }
    this.form.markAsPristine();
  }

  private setSavedEditorBaseline(state = this.captureEditorState()): void {
    this.savedEditorState = this.cloneEditorState(state);
    this.savedEditorSnapshot.set(this.editorStateSignature(this.savedEditorState));
    this.form.markAsPristine();
  }

  private formsRequestContext(): { query?: string; eventId?: string; majorEventId?: string } {
    const targetFilter = this.targetFilter();
    return {
      query: this.filtersForm.controls.query.value || undefined,
      eventId: targetFilter?.eventId,
      majorEventId: targetFilter?.majorEventId,
    };
  }

  private async changeTargetFilter(
    filter: { eventId?: string; majorEventId?: string } | null,
    route: string[],
  ): Promise<void> {
    if (!(await this.setTargetFilter(filter))) {
      return;
    }
    resetPagination(this.formsPagination);
    await Promise.all([this.router.navigate(route), this.loadForms()]);
  }

  private keepSelectedEvents(events: Event[]): Event[] {
    const selectedIds = this.selectedEventIds();
    const retained = this.events().filter((event) => selectedIds.has(event.id));
    return [...retained, ...events.filter((event) => !retained.some((selected) => selected.id === event.id))];
  }

  private keepSelectedMajorEvents(events: MajorEvent[]): MajorEvent[] {
    const selectedIds = this.selectedMajorEventIds();
    const retained = this.majorEvents().filter((event) => selectedIds.has(event.id));
    return [...retained, ...events.filter((event) => !retained.some((selected) => selected.id === event.id))];
  }

  private isCurrentFormsRequest(
    requestId: number,
    requestContext: { query?: string; eventId?: string; majorEventId?: string },
  ): boolean {
    const currentContext = this.formsRequestContext();
    return (
      requestId === this.loadFormsRequestId &&
      currentContext.query === requestContext.query &&
      currentContext.eventId === requestContext.eventId &&
      currentContext.majorEventId === requestContext.majorEventId
    );
  }

  private isCurrentFormsRequestId(requestId: number): boolean {
    return requestId === this.loadFormsRequestId;
  }

  private reconcileSelectedFormResultCount(formId: string, responseCount: number): void {
    this.selectedForm.update((form) => (form?.id === formId ? { ...form, responseCount } : form));
    this.forms.update((forms) => forms.map((form) => (form.id === formId ? { ...form, responseCount } : form)));
  }

  private formsRoute(): string[] {
    const filter = this.targetFilter();
    if (filter?.eventId) {
      return ['/forms', 'event', filter.eventId];
    }
    if (filter?.majorEventId) {
      return ['/forms', 'major-event', filter.majorEventId];
    }
    return ['/forms'];
  }

  private toInput(
    value = this.form.getRawValue(),
    elements = this.elements(),
    descriptionImages = this.descriptionImages(),
    links = this.links(),
  ): EventFormInput {
    const base = {
      id: value.id || null,
      name: value.name,
      description: value.description || null,
      descriptionImagesJson: serializeFormImageReferences(descriptionImages),
      elementsJson: serializeFormElements(elements),
      sigilo: value.sigilo,
      responseMode: value.responseMode,
      resultsPublic: value.resultsPublic,
      resultsLive: value.resultsPublic ? value.resultsLive : false,
      allowResponseEdits: value.allowResponseEdits,
      links: links.map((link, index) => this.toLinkInput(link, index)),
    };

    if (value.ownerType === 'EVENT') {
      return {
        ...base,
        ownerEventId: value.ownerEventId || '',
        ownerMajorEventId: null,
      };
    }

    return {
      ...base,
      ownerEventId: null,
      ownerMajorEventId: value.ownerMajorEventId || '',
    };
  }

  private validateForSave(): boolean {
    if (this.form.invalid || this.hasInvalidLinkDateRange()) {
      this.form.markAllAsTouched();
      return false;
    }
    if (this.hasInvalidLinkAudiences()) {
      this.snackbar.open('Selecione ao menos um público para cada vínculo.', 'Fechar', { duration: 4000 });
      return false;
    }
    if (this.hasUntitledQuestions()) {
      this.snackbar.open('Informe o título de todas as perguntas antes de salvar.', 'Fechar', { duration: 4000 });
      return false;
    }
    return true;
  }

  private isQuestion(element: FormElement): boolean {
    return element.type !== 'section' && element.type !== 'statement';
  }

  private normalizeLinkDraft(link: EventFormLinkDraft, previous?: EventFormLinkDraft): EventFormLinkDraft {
    const targetType = link.targetType;
    const audiences = normalizeAudiences(link.audiences);
    const insertInSubscriptionFlow =
      link.requiredInSubscriptionFlow === true ? true : (link.insertInSubscriptionFlow ?? false);
    const notifyPreviousSubscribers =
      insertInSubscriptionFlow && link.requiredInSubscriptionFlow === true ? (link.notifyOnPublish ?? true) : false;
    const fallbackEventId = link.eventId || previous?.eventId || (this.selectableEvents()[0]?.id ?? '');
    const fallbackMajorEventId =
      link.majorEventId || previous?.majorEventId || (this.selectableMajorEvents()[0]?.id ?? '');
    const selectedMajorEventId = targetType === 'MAJOR_EVENT' ? fallbackMajorEventId : null;
    const availableTierIds = new Set(
      this.majorEvents()
        .find((majorEvent) => majorEvent.id === selectedMajorEventId)
        ?.majorEventPrices.filter((price) => price.type === 'TIERED')
        .flatMap((price) => price.tiers.map((tier) => tier.id)) ?? [],
    );
    const priceTierIds =
      targetType === 'MAJOR_EVENT' && insertInSubscriptionFlow
        ? [...new Set(link.priceTierIds ?? [])].filter((id) => availableTierIds.has(id))
        : [];

    const base = {
      ...link,
      audiences,
      insertInSubscriptionFlow,
      requiredInSubscriptionFlow: insertInSubscriptionFlow ? (link.requiredInSubscriptionFlow ?? false) : false,
      notifyOnPublish: insertInSubscriptionFlow ? notifyPreviousSubscribers : (link.notifyOnPublish ?? true),
      allowLecturerManualPublish:
        targetType === 'EVENT' && !insertInSubscriptionFlow ? (link.allowLecturerManualPublish ?? false) : false,
      priceTierIds,
    };
    if (targetType === 'EVENT') {
      const eventId = link.eventId || fallbackEventId;
      const event = this.events().find((item) => item.id === eventId);
      return {
        ...base,
        targetType,
        eventId,
        majorEventId: null,
        targetName: event?.name ?? link.targetName ?? null,
        targetEmoji: event?.emoji ?? link.targetEmoji ?? null,
      };
    }

    const majorEventId = link.majorEventId || fallbackMajorEventId;
    const majorEvent = this.majorEvents().find((item) => item.id === majorEventId);
    return {
      ...base,
      targetType,
      eventId: null,
      majorEventId,
      targetName: majorEvent?.name ?? link.targetName ?? null,
      targetEmoji: majorEvent?.emoji ?? link.targetEmoji ?? null,
    };
  }

  private createLinkDraft(targetType: EventFormTargetType, displayOrder: number): EventFormLinkDraft {
    const base = {
      localId: crypto.randomUUID(),
      audiences: ['SUBSCRIBERS', 'ATTENDEES'] as EventFormAudience[],
      insertInSubscriptionFlow: false,
      requiredInSubscriptionFlow: false,
      displayOrder,
      notifyOnPublish: true,
      allowLecturerManualPublish: false,
      priceTierIds: [],
    };

    if (targetType === 'EVENT') {
      const event = this.selectableEvents()[0];
      return {
        ...base,
        targetType,
        eventId: event?.id ?? '',
        majorEventId: null,
        targetName: event?.name ?? null,
        targetEmoji: event?.emoji ?? null,
      };
    }

    const majorEvent = this.selectableMajorEvents()[0];
    return {
      ...base,
      targetType,
      eventId: null,
      majorEventId: majorEvent?.id ?? '',
      targetName: majorEvent?.name ?? null,
      targetEmoji: majorEvent?.emoji ?? null,
    };
  }

  private toLinkDraft(link: EventForm['links'][number]): EventFormLinkDraft {
    return {
      localId: link.id,
      id: link.id,
      targetType: link.targetType,
      eventId: link.eventId,
      majorEventId: link.majorEventId,
      targetName: link.target?.name,
      targetEmoji: link.target?.emoji,
      audiences: normalizeAudiences(link.audiences),
      insertInSubscriptionFlow: link.insertInSubscriptionFlow,
      requiredInSubscriptionFlow: link.requiredInSubscriptionFlow,
      displayOrder: link.displayOrder,
      availableFrom: link.availableFrom ? this.toLocalInput(link.availableFrom) : null,
      availableUntil: link.availableUntil ? this.toLocalInput(link.availableUntil) : null,
      notifyOnPublish: link.notifyOnPublish,
      allowLecturerManualPublish: link.allowLecturerManualPublish,
      priceTierIds: link.priceTierIds,
    };
  }

  private toLinkInput(link: EventFormLinkDraft, index: number): EventFormLinkInput {
    const base = {
      id: link.id ?? null,
      audiences: normalizeAudiences(link.audiences),
      insertInSubscriptionFlow: link.insertInSubscriptionFlow ?? false,
      requiredInSubscriptionFlow: link.requiredInSubscriptionFlow ?? false,
      displayOrder: link.displayOrder ?? index,
      availableFrom: this.localInputToIso(link.availableFrom),
      availableUntil: this.localInputToIso(link.availableUntil),
      notifyOnPublish:
        link.insertInSubscriptionFlow && link.requiredInSubscriptionFlow
          ? (link.notifyOnPublish ?? true)
          : link.insertInSubscriptionFlow
            ? false
            : (link.notifyOnPublish ?? true),
      allowLecturerManualPublish:
        link.targetType === 'EVENT' && !link.insertInSubscriptionFlow
          ? (link.allowLecturerManualPublish ?? false)
          : false,
      priceTierIds: link.targetType === 'MAJOR_EVENT' && link.insertInSubscriptionFlow ? (link.priceTierIds ?? []) : [],
    };

    if (link.targetType === 'EVENT') {
      return {
        ...base,
        targetType: link.targetType,
        eventId: link.eventId || '',
        majorEventId: null,
      };
    }

    return {
      ...base,
      targetType: link.targetType,
      eventId: null,
      majorEventId: link.majorEventId || '',
    };
  }

  private async refreshPreviousSubscriberCount(link: EventFormLinkDraft): Promise<void> {
    if (!link.insertInSubscriptionFlow || !link.requiredInSubscriptionFlow) {
      this.previousSubscriberCounts.update((counts) => ({ ...counts, [link.localId]: null }));
      return;
    }
    const targetId = link.targetType === 'EVENT' ? link.eventId : link.majorEventId;
    if (!targetId) {
      return;
    }
    const snapshot = {
      localId: link.localId,
      id: link.id,
      targetType: link.targetType,
      targetId,
      insertInSubscriptionFlow: link.insertInSubscriptionFlow,
      requiredInSubscriptionFlow: link.requiredInSubscriptionFlow,
    };
    this.previousSubscriberCounts.update((counts) => ({ ...counts, [link.localId]: null }));
    try {
      const count = await firstValueFrom(
        this.api.previousSubscriberCount({
          formId: link.id ? (this.selectedForm()?.id ?? null) : null,
          linkId: link.id ?? null,
          targetType: link.targetType,
          eventId: link.targetType === 'EVENT' ? targetId : null,
          majorEventId: link.targetType === 'MAJOR_EVENT' ? targetId : null,
        }),
      );
      if (
        this.links().some((item) => {
          const itemTargetId = item.targetType === 'EVENT' ? item.eventId : item.majorEventId;
          return (
            item.localId === snapshot.localId &&
            item.id === snapshot.id &&
            item.targetType === snapshot.targetType &&
            itemTargetId === snapshot.targetId &&
            item.insertInSubscriptionFlow === snapshot.insertInSubscriptionFlow &&
            item.requiredInSubscriptionFlow === snapshot.requiredInSubscriptionFlow
          );
        })
      ) {
        this.previousSubscriberCounts.update((counts) => ({ ...counts, [snapshot.localId]: count }));
      }
    } catch {
      // The checkbox stays available when the optional eligibility hint cannot be loaded.
    }
  }

  private defaultOwner(): { type: FormOwnerType; id: string } {
    const filter = this.targetFilter();
    if (filter?.eventId) {
      return { type: 'EVENT', id: filter.eventId };
    }
    if (filter?.majorEventId) {
      return { type: 'MAJOR_EVENT', id: filter.majorEventId };
    }
    const event = this.selectableEvents()[0];
    if (event) {
      return { type: 'EVENT', id: event.id };
    }
    return { type: 'MAJOR_EVENT', id: this.selectableMajorEvents()[0]?.id ?? '' };
  }

  private localInputToIso(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const date = parseISO(value);
    return isValid(date) ? date.toISOString() : null;
  }

  private toLocalInput(value: string): string {
    const date = parseISO(value);
    if (!isValid(date)) {
      return '';
    }
    return format(date, "yyyy-MM-dd'T'HH:mm");
  }

  private isOngoingOrFuture(value: string | null | undefined): boolean {
    if (!value) {
      return true;
    }
    const date = parseISO(value);
    return !isValid(date) || !isBefore(date, new Date());
  }

  private showError(error: unknown, fallback: string): void {
    this.feedback.error(error, fallback);
  }

  private syncLiveResultsStream(form: EventForm): void {
    this.closeResultsStream();
    if (!this.shouldStreamResults(form)) {
      return;
    }

    this.resultsStreamFormId = form.id;
    this.resultsStreamRecoveryAttempted = false;
    this.connectResultsStream(form.id, this.resultsStreamGeneration);
  }

  private shouldStreamResults(form: EventForm): boolean {
    return Boolean(form.id) && isPlatformBrowser(this.platformId);
  }

  private connectResultsStream(formId: string, generation: number): void {
    if (!this.isCurrentResultsStream(formId, generation)) {
      return;
    }

    let stream: Subscription | null = null;
    stream = watchReplayableEventSourcePing(
      `/api/event-forms/${encodeURIComponent(formId)}/results/events`,
      'Não foi possível acompanhar os resultados em tempo real.',
    )
      .pipe(auditTime(0))
      .subscribe({
        next: () => {
          if (!this.isCurrentResultsStream(formId, generation)) {
            return;
          }
          this.resultsStreamRecoveryAttempted = false;
          void this.loadResults();
        },
        error: () => {
          if (!this.isCurrentResultsStream(formId, generation)) {
            return;
          }
          this.resultsStream = null;
          if (this.resultsStreamRecoveryAttempted) {
            return;
          }
          this.resultsStreamRecoveryAttempted = true;
          void this.recoverResultsStream(formId, generation);
        },
      });
    this.resultsStream = stream;
  }

  private async recoverResultsStream(formId: string, generation: number): Promise<void> {
    await this.loadResults();
    if (this.isCurrentResultsStream(formId, generation)) {
      this.connectResultsStream(formId, generation);
    }
  }

  private isCurrentResultsStream(formId: string, generation: number): boolean {
    return (
      generation === this.resultsStreamGeneration &&
      this.resultsStreamFormId === formId &&
      this.selectedForm()?.id === formId
    );
  }

  closeResultsStream(): void {
    this.loadResultsRequestId++;
    this.resultsStreamGeneration++;
    this.resultsStream?.unsubscribe();
    this.resultsStream = null;
    this.resultsStreamFormId = null;
    this.resultsStreamRecoveryAttempted = false;
  }
}
