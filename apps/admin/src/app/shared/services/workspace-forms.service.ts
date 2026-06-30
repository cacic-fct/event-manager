import { Injectable, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
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
  serializeFormElements,
} from '@cacic-fct/event-manager-admin-contracts';
import { type FormElement } from '@cacic-fct/form-contracts';
import { format, isBefore, isValid, parseISO } from 'date-fns';
import { EventApiService } from '../../graphql/event-api.service';
import { EventFormApiService } from '../../graphql/event-form-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { getErrorMessage } from '../error-message';
import { WorkspaceUiService } from './workspace-ui.service';

type FormOwnerType = EventFormTargetType;

export interface EventFormLinkDraft {
  localId: string;
  id?: string | null;
  targetType: EventFormTargetType;
  eventId?: string | null;
  majorEventId?: string | null;
  audience?: EventFormAudience | null;
  insertInSubscriptionFlow?: boolean | null;
  requiredInSubscriptionFlow?: boolean | null;
  enforceRequiredAnswers?: boolean | null;
  displayOrder?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  notifyOnPublish?: boolean | null;
  allowLecturerManualPublish?: boolean | null;
}

@Injectable({ providedIn: 'root' })
export class WorkspaceFormsService {
  private readonly api = inject(EventFormApiService);
  private readonly eventApi = inject(EventApiService);
  private readonly majorEventApi = inject(MajorEventApiService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly snackbar = inject(MatSnackBar);
  private readonly ui = inject(WorkspaceUiService);

  readonly loading = this.ui.loading;
  readonly forms = signal<EventForm[]>([]);
  readonly selectedForm = signal<EventForm | null>(null);
  readonly selectedResults = signal<EventFormResults | null>(null);
  readonly elements = signal<FormElement[]>([]);
  readonly links = signal<EventFormLinkDraft[]>([]);
  readonly events = signal<Event[]>([]);
  readonly majorEvents = signal<MajorEvent[]>([]);
  readonly targetFilter = signal<{ eventId?: string; majorEventId?: string } | null>(null);
  readonly selectedFormPublished = computed(() => this.selectedForm()?.publicationState === 'PUBLISHED');
  readonly selectedFormScheduled = computed(() => this.selectedForm()?.publicationState === 'SCHEDULED');
  readonly selectableEvents = computed(() => {
    const selectedIds = this.selectedEventIds();
    return this.events().filter((event) => selectedIds.has(event.id) || this.isOngoingOrFuture(event.endDate));
  });
  readonly selectableMajorEvents = computed(() => {
    const selectedIds = this.selectedMajorEventIds();
    return this.majorEvents().filter((majorEvent) => selectedIds.has(majorEvent.id) || this.isOngoingOrFuture(majorEvent.endDate));
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
  private resultsEventSource: EventSource | null = null;

  readonly filtersForm = this.formBuilder.nonNullable.group({
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
    resultsLive: [false],
    scheduledPublishAt: [''],
  });

  async initialize(): Promise<void> {
    if (this.events().length === 0 || this.majorEvents().length === 0) {
      await Promise.all([this.loadTargets(), this.loadForms()]);
      return;
    }

    await this.loadForms();
  }

  async loadTargets(): Promise<void> {
    const [events, majorEvents] = await Promise.all([
      firstValueFrom(this.eventApi.listEvents({ take: 500 })),
      firstValueFrom(this.majorEventApi.listMajorEvents({ take: 500 })),
    ]);
    this.events.set(events);
    this.majorEvents.set(majorEvents);
  }

  async loadForms(): Promise<void> {
    this.ui.loading.set(true);
    try {
      const forms = await firstValueFrom(
        this.api.listForms({
          query: this.filtersForm.controls.query.value || undefined,
          eventId: this.targetFilter()?.eventId,
          majorEventId: this.targetFilter()?.majorEventId,
        }),
      );
      this.forms.set(forms);
      const selected = this.selectedForm();
      if (selected) {
        const refreshed = forms.find((form) => form.id === selected.id) ?? null;
        if (refreshed) {
          this.patchSelectedForm(refreshed);
        }
      }
    } catch (error) {
      this.showError(error, 'Não foi possível carregar os formulários.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  createForm(): void {
    this.selectedForm.set(null);
    this.selectedResults.set(null);
    this.closeResultsStream();
    this.elements.set([]);
    this.links.set([]);
    const owner = this.defaultOwner();
    this.form.reset({
      id: '',
      name: 'Novo formulário',
      description: '',
      ownerType: owner.type,
      ownerEventId: owner.type === 'EVENT' ? owner.id : '',
      ownerMajorEventId: owner.type === 'MAJOR_EVENT' ? owner.id : '',
      sigilo: 'SECRET',
      responseMode: 'ONE_PER_TARGET',
      resultsPublic: false,
      resultsLive: false,
      scheduledPublishAt: '',
    });
  }

  setTargetFilter(filter: { eventId?: string; majorEventId?: string } | null): void {
    this.targetFilter.set(filter);
  }

  async selectForm(form: EventForm): Promise<void> {
    this.ui.loading.set(true);
    try {
      const detail = await firstValueFrom(this.api.getForm(form.id));
      this.patchSelectedForm(detail);
      await this.loadResults();
    } catch (error) {
      this.showError(error, 'Não foi possível abrir o formulário.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  updateElements(elements: FormElement[]): void {
    this.elements.set(elements);
  }

  addLink(targetType: EventFormTargetType): void {
    this.links.update((links) => [...links, this.createLinkDraft(targetType, links.length)]);
  }

  removeLink(localId: string): void {
    this.links.update((links) => links.filter((link) => link.localId !== localId));
  }

  updateLink(localId: string, patch: Partial<EventFormLinkDraft>): void {
    this.links.update((links) =>
      links.map((link) => (link.localId === localId ? this.normalizeLinkDraft({ ...link, ...patch }, link) : link)),
    );
  }

  updateLinkDate(localId: string, key: 'availableFrom' | 'availableUntil', value: string): void {
    this.updateLink(localId, { [key]: value || null });
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.ui.loading.set(true);
    try {
      const saved = await firstValueFrom(this.api.saveForm(this.toInput()));
      this.patchSelectedForm(saved);
      await this.loadForms();
      this.snackbar.open('Formulário salvo.', 'Fechar', { duration: 3000 });
    } catch (error) {
      this.showError(error, 'Não foi possível salvar o formulário.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  async saveDraft(): Promise<void> {
    const selected = this.selectedForm();
    if (!selected) {
      await this.save();
      return;
    }

    this.ui.loading.set(true);
    try {
      await firstValueFrom(
        this.api.saveDraft({
          sourceFormId: selected.id,
          input: this.toInput(),
        }),
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
      await this.loadForms();
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
      this.createForm();
      await this.loadForms();
      this.snackbar.open('Formulário excluído.', 'Fechar', { duration: 3000 });
    } catch (error) {
      this.showError(error, 'Não foi possível excluir o formulário.');
    } finally {
      this.ui.loading.set(false);
    }
  }

  async loadResults(): Promise<void> {
    const selected = this.selectedForm();
    if (!selected) {
      this.selectedResults.set(null);
      return;
    }

    try {
      this.selectedResults.set(await firstValueFrom(this.api.results(selected.id)));
    } catch {
      this.selectedResults.set(null);
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
      return this.events().find((event) => event.id === link.eventId)?.name ?? 'Evento';
    }
    return this.majorEvents().find((event) => event.id === link.majorEventId)?.name ?? 'Grande evento';
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
      await this.loadForms();
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
    this.selectedForm.set(form);
    this.selectedResults.set(null);
    this.elements.set(parseFormElementsJson(form.elementsJson));
    this.links.set(
      form.links.map((link) => this.toLinkDraft(link)),
    );
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
      scheduledPublishAt: form.scheduledPublishAt ? this.toLocalInput(form.scheduledPublishAt) : '',
    });
    this.openResultsStream(form);
  }

  private toInput(): EventFormInput {
    const value = this.form.getRawValue();
    const base = {
      id: value.id || null,
      name: value.name,
      description: value.description || null,
      elementsJson: serializeFormElements(this.elements()),
      sigilo: value.sigilo,
      responseMode: value.responseMode,
      resultsPublic: value.resultsPublic,
      resultsLive: value.resultsPublic ? value.resultsLive : false,
      links: this.links().map((link, index) => this.toLinkInput(link, index)),
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

  private normalizeLinkDraft(link: EventFormLinkDraft, previous?: EventFormLinkDraft): EventFormLinkDraft {
    const targetType = link.targetType;
    const insertInSubscriptionFlow = link.requiredInSubscriptionFlow === true ? true : (link.insertInSubscriptionFlow ?? false);
    const fallbackEventId = link.eventId || previous?.eventId || (this.selectableEvents()[0]?.id ?? '');
    const fallbackMajorEventId = link.majorEventId || previous?.majorEventId || (this.selectableMajorEvents()[0]?.id ?? '');

    const base = {
      ...link,
      insertInSubscriptionFlow,
      requiredInSubscriptionFlow: insertInSubscriptionFlow ? (link.requiredInSubscriptionFlow ?? false) : false,
      notifyOnPublish: insertInSubscriptionFlow ? false : (link.notifyOnPublish ?? true),
      allowLecturerManualPublish:
          targetType === 'EVENT' && !insertInSubscriptionFlow ? (link.allowLecturerManualPublish ?? false) : false,
    };
    if (targetType === 'EVENT') {
      return {
        ...base,
        targetType,
        eventId: link.eventId || fallbackEventId,
        majorEventId: null,
      };
    }

    return {
      ...base,
      targetType,
      eventId: null,
      majorEventId: link.majorEventId || fallbackMajorEventId,
    };
  }

  private createLinkDraft(targetType: EventFormTargetType, displayOrder: number): EventFormLinkDraft {
    const base = {
      localId: crypto.randomUUID(),
      audience: 'SUBSCRIBERS_OR_ATTENDEES' as const,
      insertInSubscriptionFlow: false,
      requiredInSubscriptionFlow: false,
      enforceRequiredAnswers: true,
      displayOrder,
      notifyOnPublish: true,
      allowLecturerManualPublish: false,
    };

    if (targetType === 'EVENT') {
      return {
        ...base,
        targetType,
        eventId: this.selectableEvents()[0]?.id ?? '',
        majorEventId: null,
      };
    }

    return {
      ...base,
      targetType,
      eventId: null,
      majorEventId: this.selectableMajorEvents()[0]?.id ?? '',
    };
  }

  private toLinkDraft(link: EventForm['links'][number]): EventFormLinkDraft {
    return {
      localId: link.id,
      id: link.id,
      targetType: link.targetType,
      eventId: link.eventId,
      majorEventId: link.majorEventId,
      audience: link.audience,
      insertInSubscriptionFlow: link.insertInSubscriptionFlow,
      requiredInSubscriptionFlow: link.requiredInSubscriptionFlow,
      enforceRequiredAnswers: link.enforceRequiredAnswers,
      displayOrder: link.displayOrder,
      availableFrom: link.availableFrom ? this.toLocalInput(link.availableFrom) : null,
      availableUntil: link.availableUntil ? this.toLocalInput(link.availableUntil) : null,
      notifyOnPublish: link.notifyOnPublish,
      allowLecturerManualPublish: link.allowLecturerManualPublish,
    };
  }

  private toLinkInput(link: EventFormLinkDraft, index: number): EventFormLinkInput {
    const base = {
      id: link.id ?? null,
      audience: link.audience ?? 'SUBSCRIBERS_OR_ATTENDEES',
      insertInSubscriptionFlow: link.insertInSubscriptionFlow ?? false,
      requiredInSubscriptionFlow: link.requiredInSubscriptionFlow ?? false,
      enforceRequiredAnswers: link.enforceRequiredAnswers ?? true,
      displayOrder: link.displayOrder ?? index,
      availableFrom: this.localInputToIso(link.availableFrom),
      availableUntil: this.localInputToIso(link.availableUntil),
      notifyOnPublish: link.insertInSubscriptionFlow ? false : (link.notifyOnPublish ?? true),
      allowLecturerManualPublish:
        link.targetType === 'EVENT' && !link.insertInSubscriptionFlow ? (link.allowLecturerManualPublish ?? false) : false,
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
    this.snackbar.open(getErrorMessage(error, fallback), 'Fechar', { duration: 6000 });
  }

  private openResultsStream(form: EventForm): void {
    this.closeResultsStream();
    if (!form.resultsLive || typeof EventSource === 'undefined') {
      return;
    }

    const source = new EventSource(`/api/event-forms/${encodeURIComponent(form.id)}/results/events`);
    source.onmessage = () => {
      void this.loadResults();
    };
    source.onerror = () => {
      source.close();
      if (this.resultsEventSource === source) {
        this.resultsEventSource = null;
      }
    };
    this.resultsEventSource = source;
  }

  closeResultsStream(): void {
    this.resultsEventSource?.close();
    this.resultsEventSource = null;
  }
}
