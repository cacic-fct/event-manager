import { Injectable, computed, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import {
  Event,
  EventForm,
  EventFormInput,
  EventFormLinkInput,
  EventFormResults,
  EventFormSigilo,
  EventFormTargetType,
  MajorEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import { type FormElement } from '@cacic-fct/form-contracts';
import {
  parseFormElementsJson,
  serializeFormElements,
} from '@cacic-fct/shared-angular';
import { EventApiService } from '../../graphql/event-api.service';
import { EventFormApiService } from '../../graphql/event-form-api.service';
import { MajorEventApiService } from '../../graphql/major-event-api.service';
import { getErrorMessage } from '../error-message';
import { WorkspaceUiService } from './workspace-ui.service';

type FormOwnerType = 'NONE' | EventFormTargetType;

export interface EventFormLinkDraft extends EventFormLinkInput {
  localId: string;
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
  private resultsEventSource: EventSource | null = null;

  readonly filtersForm = this.formBuilder.nonNullable.group({
    query: [''],
  });

  readonly form = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    description: [''],
    ownerType: ['NONE' as FormOwnerType],
    ownerEventId: [''],
    ownerMajorEventId: [''],
    sigilo: ['SECRET' as EventFormSigilo],
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
    this.form.reset({
      id: '',
      name: 'Novo formulário',
      description: '',
      ownerType: 'NONE',
      ownerEventId: '',
      ownerMajorEventId: '',
      sigilo: 'SECRET',
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
    this.links.update((links) => [
      ...links,
      {
        localId: crypto.randomUUID(),
        targetType,
        eventId: targetType === 'EVENT' ? this.events()[0]?.id ?? '' : null,
        majorEventId: targetType === 'MAJOR_EVENT' ? this.majorEvents()[0]?.id ?? '' : null,
        audience: 'SUBSCRIBERS_OR_ATTENDEES',
        insertInSubscriptionFlow: false,
        requiredInSubscriptionFlow: false,
        enforceRequiredAnswers: true,
        displayOrder: links.length,
        notifyOnPublish: true,
        allowLecturerManualPublish: false,
      },
    ]);
  }

  removeLink(localId: string): void {
    this.links.update((links) => links.filter((link) => link.localId !== localId));
  }

  updateLink(localId: string, patch: Partial<EventFormLinkInput>): void {
    this.links.update((links) =>
      links.map((link) =>
        link.localId === localId
          ? {
              ...link,
              ...patch,
              eventId: (patch.targetType ?? link.targetType) === 'EVENT' ? (patch.eventId ?? link.eventId ?? '') : null,
              majorEventId:
                (patch.targetType ?? link.targetType) === 'MAJOR_EVENT'
                  ? (patch.majorEventId ?? link.majorEventId ?? '')
                  : null,
              allowLecturerManualPublish:
                (patch.targetType ?? link.targetType) === 'EVENT'
                  ? (patch.allowLecturerManualPublish ?? link.allowLecturerManualPublish ?? false)
                  : false,
            }
          : link,
      ),
    );
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
    if (!value) {
      this.snackbar.open('Informe data e hora para agendar.', 'Fechar', { duration: 3000 });
      return;
    }
    await this.publish(new Date(value).toISOString());
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

  targetName(link: EventFormLinkInput): string {
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
      form.links.map((link) => ({
        ...link,
        localId: link.id,
      })),
    );
    this.form.reset({
      id: form.id,
      name: form.name,
      description: form.description ?? '',
      ownerType: form.ownerEventId ? 'EVENT' : form.ownerMajorEventId ? 'MAJOR_EVENT' : 'NONE',
      ownerEventId: form.ownerEventId ?? '',
      ownerMajorEventId: form.ownerMajorEventId ?? '',
      sigilo: form.sigilo,
      resultsPublic: form.resultsPublic,
      resultsLive: form.resultsLive,
      scheduledPublishAt: form.scheduledPublishAt ? this.toLocalInput(form.scheduledPublishAt) : '',
    });
    this.openResultsStream(form);
  }

  private toInput(): EventFormInput {
    const value = this.form.getRawValue();
    return {
      id: value.id || null,
      name: value.name,
      description: value.description || null,
      ownerEventId: value.ownerType === 'EVENT' ? value.ownerEventId || null : null,
      ownerMajorEventId: value.ownerType === 'MAJOR_EVENT' ? value.ownerMajorEventId || null : null,
      elementsJson: serializeFormElements(this.elements()),
      sigilo: value.sigilo,
      resultsPublic: value.resultsPublic,
      resultsLive: value.resultsPublic ? value.resultsLive : false,
      links: this.links().map((link, index) => ({
        id: link.id ?? null,
        targetType: link.targetType,
        eventId: link.targetType === 'EVENT' ? link.eventId || null : null,
        majorEventId: link.targetType === 'MAJOR_EVENT' ? link.majorEventId || null : null,
        audience: link.audience ?? 'SUBSCRIBERS_OR_ATTENDEES',
        insertInSubscriptionFlow: link.insertInSubscriptionFlow ?? false,
        requiredInSubscriptionFlow: link.requiredInSubscriptionFlow ?? false,
        enforceRequiredAnswers: link.enforceRequiredAnswers ?? true,
        displayOrder: link.displayOrder ?? index,
        availableFrom: link.availableFrom ?? null,
        availableUntil: link.availableUntil ?? null,
        notifyOnPublish: link.notifyOnPublish ?? true,
        allowLecturerManualPublish:
          link.targetType === 'EVENT' ? (link.allowLecturerManualPublish ?? false) : false,
      })),
    };
  }

  private toLocalInput(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hour}:${minute}`;
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

  private closeResultsStream(): void {
    this.resultsEventSource?.close();
    this.resultsEventSource = null;
  }
}
