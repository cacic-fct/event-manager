import { computed, signal, type EnvironmentProviders, type Provider } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  EventForm,
  EventFormLinkInput,
  EventFormResponseMode,
  EventFormResults,
  EventFormSigilo,
  EventFormTargetType,
  Event,
  MajorEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import { type FormElement, type FormImage } from '@cacic-fct/form-contracts';
import { Permission, type Permission as PermissionScope } from '@cacic-fct/shared-permissions';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { of } from 'rxjs';
import {
  createAdminEvent,
  createAdminEventForm,
  createAdminEventFormResults,
  createAdminMajorEvent,
} from '../testing/admin-entity-fixtures';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditLogService } from '../audit-logs/audit-log.service';
import { isDateAfter } from '../shared/date-range-validator';
import { EventFormLinkDraft, FormsService } from './forms.service';
import { FormsPageComponent } from './forms-page.component';
import { EventApiService } from '../graphql/event-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { ADMIN_SHELL_CONTEXT } from '../shared/admin-shell-context';

type FormsStoryMode = 'populated' | 'empty' | 'readonly' | 'loading' | 'public-results';
type FormsStoryTarget = 'all' | 'event' | 'major-event';

interface FormsStoryArgs {
  mode: FormsStoryMode;
  target: FormsStoryTarget;
  itemCount: number;
  selectedIndex: number;
  sigilo: EventFormSigilo;
  responseMode: EventFormResponseMode;
  resultsPublic: boolean;
  resultsLive: boolean;
  allowResponseEdits: boolean;
  lecturerPublish: boolean;
  withImages: boolean;
}

const defaultArgs: FormsStoryArgs = {
  mode: 'populated',
  target: 'all',
  itemCount: 4,
  selectedIndex: 0,
  sigilo: 'PARTIALLY_SECRET',
  responseMode: 'ONE_PER_TARGET',
  resultsPublic: false,
  resultsLive: false,
  allowResponseEdits: false,
  lecturerPublish: true,
  withImages: false,
};

const reusableStoryImage = {
  id: 'story-form-image',
  url: 'https://placehold.co/1200x675',
  width: 1200,
  height: 675,
  altText: 'Mapa de referência do espaço do evento',
  caption: 'Acesso principal pelo bloco de laboratórios.',
} satisfies FormImage;

const eventFormPermissions: PermissionScope[] = [
  Permission.EventForm.Read,
  Permission.EventForm.Create,
  Permission.EventForm.Update,
  Permission.EventForm.Delete,
  Permission.EventForm.Publish,
  Permission.EventForm.Results,
  Permission.EventForm.Export,
];

const meta: Meta<FormsStoryArgs> = {
  component: FormsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Forms/Workspace Forms Tab',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    mode: {
      control: 'select',
      options: ['populated', 'empty', 'readonly', 'loading', 'public-results'],
    },
    target: {
      control: 'select',
      options: ['all', 'event', 'major-event'],
    },
    itemCount: { control: { type: 'number', min: 0, max: 50, step: 1 } },
    selectedIndex: { control: { type: 'number', min: 0, max: 7, step: 1 } },
    sigilo: {
      control: 'select',
      options: ['PUBLIC', 'PARTIALLY_SECRET', 'SECRET', 'ANONYMOUS'],
    },
    responseMode: {
      control: 'select',
      options: ['ONE_PER_TARGET', 'MULTIPLE_PER_TARGET', 'SINGLE_PER_FORM'],
    },
    resultsPublic: { control: 'boolean' },
    resultsLive: { control: 'boolean' },
    allowResponseEdits: { control: 'boolean' },
    lecturerPublish: { control: 'boolean' },
    withImages: { control: 'boolean' },
  },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: createFormsStoryProviders({
          ...defaultArgs,
          ...(context.args as FormsStoryArgs),
        }),
      })(story, context),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<FormsStoryArgs>;

export const Playground: Story = {
  args: {},

  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const contextHeader = await canvas.findByRole('button', { name: /Todos os formulários/i });
    await expect(contextHeader).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.getByRole('heading', { name: 'Vínculos' })).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: 'Notificar inscritos anteriores' })).toBeEnabled();
    await userEvent.click(contextHeader);
    await expect(canvas.getByRole('link', { name: 'Mostrar formulários de todos os contextos' })).toBeVisible();
    await exerciseFormsStory(canvasElement);
  },
};

export const Readonly: Story = {
  args: { mode: 'readonly' },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseFormsStory(canvasElement),
};

export const Empty: Story = {
  args: { mode: 'empty', itemCount: 0 },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/nenhum formulário encontrado/i)).toBeVisible();
  },
};

export const Loading: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => exerciseFormsStory(canvasElement),
};

export const PublicResults: Story = {
  args: {
    mode: 'public-results',
    sigilo: 'PUBLIC',
    resultsPublic: true,
    resultsLive: true,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/publicar resultados para público autorizado/i)).toBeVisible();
    await expect(canvas.getByText(/resultados ao vivo/i)).toBeVisible();
  },
};

export const MajorEventFiltered: Story = {
  args: {
    target: 'major-event',
    selectedIndex: 1,
    lecturerPublish: false,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseFormsStory(canvasElement, { selectedFormPublished: false }),
};

export const DenseEventInventory: Story = {
  args: {
    target: 'event',
    itemCount: 50,
    selectedIndex: 24,
  },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Vínculos' })).toBeVisible();
    const ownerPicker = canvas.getAllByRole('button', { name: 'Trocar' })[0];
    const ownerPickerHost = ownerPicker.closest('app-event-target-picker');
    if (!ownerPickerHost) throw new Error('Expected the owner target picker host.');
    const ownerCanvas = within(ownerPickerHost as HTMLElement);
    await userEvent.click(ownerPicker);
    await expect(ownerCanvas.getByRole('button', { name: 'Próxima página' })).toBeEnabled();
    await userEvent.click(ownerCanvas.getByRole('button', { name: 'Próxima página' }));
    await expect(ownerCanvas.getByRole('button', { name: 'Selecionar Evento 26' })).toBeVisible();
    await userEvent.click(ownerCanvas.getByRole('button', { name: 'Selecionar Evento 26' }));
    await expect(canvas.getByText('Evento 26')).toBeVisible();
  },
};

export const DenseTargetControls: Story = {
  args: {
    target: 'event',
    itemCount: 50,
    selectedIndex: 24,
  },
  globals: { theme: 'light' },
};

export const InterestAudience: Story = {
  args: {
    selectedIndex: 3,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Interessados ainda não inscritos')).toBeVisible();
  },
};

export const PublishedFormDraftWithImages: Story = {
  args: {
    withImages: true,
    selectedIndex: 0,
  },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('img', { name: reusableStoryImage.altText })).toHaveLength(2);
    await expect(canvas.getByText('Imagens da descrição')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Rascunho' })).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument();
  },
};

async function exerciseFormsStory(
  canvasElement: HTMLElement,
  options: { selectedFormPublished?: boolean } = {},
): Promise<void> {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('button', { name: /novo/i })).toBeVisible();
  if (options.selectedFormPublished ?? true) {
    await expect(canvas.queryByRole('button', { name: /^salvar$/i })).not.toBeInTheDocument();
  } else {
    await expect(canvas.getByRole('button', { name: /^salvar$/i })).toBeVisible();
  }
  await expect(canvas.getByRole('button', { name: /^publicar$/i })).toBeVisible();
  await userEvent.tab();
  const enabledButton = canvas
    .queryAllByRole('button')
    .find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
}

function createFormsStoryProviders(args: FormsStoryArgs) {
  const targetEvents = buildEvents(args.target === 'event' ? 60 : 2);
  const targetMajorEvents = buildMajorEvents(args.target === 'major-event' ? 60 : 2);
  const pageTargets = <T extends { name: string; endDate?: string | null }>(
    items: readonly T[],
    filters?: { query?: string; skip?: number; take?: number; endDateFrom?: string },
  ): T[] => {
    const query = filters?.query?.trim().toLocaleLowerCase('pt-BR');
    const filtered = items.filter((item) =>
      (!query || item.name.toLocaleLowerCase('pt-BR').includes(query)) &&
      (!filters?.endDateFrom || !item.endDate || item.endDate >= filters.endDateFrom),
    );
    const skip = filters?.skip ?? 0;
    return filtered.slice(skip, skip + (filters?.take ?? filtered.length));
  };
  const providers: Array<Provider | EnvironmentProviders> = [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        paramMap: of(convertToParamMap({ ...routeParams(args.target),
          ...(args.mode !== 'empty' && args.itemCount > 0 ? { formId: `form-${selectedIndex(args.selectedIndex, args.itemCount) + 1}` } : {}),
        })),
      },
    },
    {
      provide: PermissionsService,
      useValue: createPermissionsStoryService(args.mode !== 'readonly'),
    },
    {
      provide: FormsService,
      useFactory: () => createFormsStoryService(new FormBuilder(), args),
    },
    {
      provide: EventApiService,
      useValue: {
        listEvents: (filters?: { query?: string; skip?: number; take?: number; endDateFrom?: string }) =>
          of(pageTargets(targetEvents, filters)),
      },
    },
    {
      provide: MajorEventApiService,
      useValue: {
        listMajorEvents: (filters?: { query?: string; skip?: number; take?: number; endDateFrom?: string }) =>
          of(pageTargets(targetMajorEvents, filters)),
      },
    },
    {
      provide: AuditLogService,
      useValue: { openHistory: () => undefined },
    },
  ];
  if (args.target !== 'all') providers.push({ provide: ADMIN_SHELL_CONTEXT, useValue: true });
  return providers;
}

function createPermissionsStoryService(
  canWrite: boolean,
): Pick<
  PermissionsService,
  'has' | 'hasAll' | 'hasAny' | 'missing' | 'canEdit' | 'canDelete' | 'rawPermissions' | 'granted'
> {
  const grantedSet = new Set<PermissionScope>(canWrite ? eventFormPermissions : [Permission.EventForm.Read]);
  return {
    granted: computed(() => grantedSet),
    rawPermissions: computed(() => [...grantedSet]),
    has: (scope) => grantedSet.has(scope),
    hasAll: (scopes) => scopes.every((scope) => grantedSet.has(scope)),
    hasAny: (scopes) => scopes.some((scope) => grantedSet.has(scope)),
    missing: (scopes) => scopes.filter((scope) => !grantedSet.has(scope)),
    canEdit: (...scopes) => canWrite && scopes.every((scope) => grantedSet.has(scope)),
    canDelete: (...scopes) => canWrite && scopes.every((scope) => grantedSet.has(scope)),
  };
}

function createFormsStoryService(formBuilder: FormBuilder, args: FormsStoryArgs): FormsService {
  const events = buildEvents(args.target === 'event' ? 60 : 2);
  const majorEvents = buildMajorEvents(args.target === 'major-event' ? 60 : 2);
  const forms = args.mode === 'empty' ? [] : buildForms(args, events, majorEvents);
  const selectedForm = forms[selectedIndex(args.selectedIndex, forms.length)] ?? null;
  const selectedResults = selectedForm ? buildResults(selectedForm, args) : null;
  const form = createEditorForm(formBuilder);
  const elements = signal<FormElement[]>(selectedForm ? buildElements(args.withImages) : []);
  const descriptionImages = signal<FormImage[]>(selectedForm?.descriptionImages ?? []);
  const links = signal<EventFormLinkDraft[]>(selectedForm ? linkDrafts(selectedForm.links) : []);
  const selectedFormSignal = signal<EventForm | null>(selectedForm);
  const selectedResultsSignal = signal<EventFormResults | null>(selectedResults);
  const targetFilterSignal = signal<{ eventId?: string; majorEventId?: string } | null>(null);
  const imageTextControls = new Map<string, FormControl<string>>();
  const setTargetFilter = async (filter: { eventId?: string; majorEventId?: string } | null): Promise<boolean> => {
    targetFilterSignal.set(filter);
    return true;
  };

  form.controls.resultsPublic.valueChanges.subscribe((resultsPublic) => {
    const control = form.controls.resultsLive;
    if (resultsPublic) control.enable({ emitEvent: false });
    else control.disable({ emitEvent: false });
  });

  patchForm(form, selectedForm);

  const service = {
    loading: signal(args.mode === 'loading'),
    forms: signal(forms),
    selectedForm: selectedFormSignal,
    selectedResults: selectedResultsSignal,
    elements,
    descriptionImages,
    uploadingImageTarget: signal<string | null>(null),
    links,
    events: signal(events),
    majorEvents: signal(majorEvents),
    selectableEvents: computed(() => events),
    selectableMajorEvents: computed(() => majorEvents),
    targetFilter: targetFilterSignal,
    targetFilterId: computed(() =>
      targetFilterSignal()?.eventId
        ? `event:${targetFilterSignal()?.eventId}`
        : targetFilterSignal()?.majorEventId
          ? `major-event:${targetFilterSignal()?.majorEventId}`
          : null,
    ),
    targetFilterLabel: computed(() => {
      const filter = targetFilterSignal();
      return filter?.eventId
        ? (events.find((event) => event.id === filter.eventId)?.name ?? 'Evento selecionado')
        : filter?.majorEventId
          ? (majorEvents.find((event) => event.id === filter.majorEventId)?.name ?? 'Grande evento selecionado')
          : 'Todos os formulários';
    }),
    targetSearchLoading: signal(false),
    formsPagination: {
      pageIndex: signal(0),
      hasNextPage: signal(false),
      hasPreviousPage: computed(() => false),
      label: computed(() => '1-50'),
    },
    selectedFormPublished: computed(() => selectedFormSignal()?.publicationState === 'PUBLISHED'),
    selectedFormScheduled: computed(() => selectedFormSignal()?.publicationState === 'SCHEDULED'),
    hasUntitledQuestions: computed(() =>
      elements().some((element) => element.type !== 'section' && element.type !== 'statement' && !element.title.trim()),
    ),
    canSave: computed(
      () =>
        form.valid &&
        elements().every(
          (element) => element.type === 'section' || element.type === 'statement' || element.title.trim().length > 0,
        ),
    ),
    unsavedChanges: signal(false),
    filtersForm: formBuilder.nonNullable.group({ query: [''] }),
    targetSearchForm: formBuilder.nonNullable.group({ query: [''] }),
    form,
    initialize: async () => undefined,
    loadTargets: async () => undefined,
    loadForms: async () => undefined,
    createForm: async () => {
      selectedFormSignal.set(null);
      selectedResultsSignal.set(null);
      elements.set([]);
      descriptionImages.set([]);
      links.set([]);
      patchForm(form, null);
    },
    confirmDiscardChanges: async () => true,
    cancelPendingSelection: () => undefined,
    discardChanges: () => undefined,
    ownerTargetName: () => {
      const value = form.getRawValue();
      const id = value.ownerType === 'EVENT' ? value.ownerEventId : value.ownerMajorEventId;
      return value.ownerType === 'EVENT'
        ? events.find((event) => event.id === id)?.name ?? 'Evento selecionado'
        : majorEvents.find((majorEvent) => majorEvent.id === id)?.name ?? 'Grande evento selecionado';
    },
    ownerTargetEmoji: () => {
      const value = form.getRawValue();
      const id = value.ownerType === 'EVENT' ? value.ownerEventId : value.ownerMajorEventId;
      return value.ownerType === 'EVENT'
        ? events.find((event) => event.id === id)?.emoji ?? null
        : majorEvents.find((majorEvent) => majorEvent.id === id)?.emoji ?? null;
    },
    setOwnerTarget: (selection: { id: string; name: string; emoji?: string | null }) => {
      const ownerType = form.controls.ownerType.value;
      form.patchValue(ownerType === 'EVENT'
        ? { ownerEventId: selection.id, ownerMajorEventId: '' }
        : { ownerEventId: '', ownerMajorEventId: selection.id });
    },
    linkTargetName: (link: EventFormLinkDraft) =>
      link.targetName ?? (link.targetType === 'EVENT'
        ? (events.find((event) => event.id === link.eventId)?.name ?? 'Evento selecionado')
        : (majorEvents.find((majorEvent) => majorEvent.id === link.majorEventId)?.name ?? 'Grande evento selecionado')),
    linkTargetEmoji: (link: EventFormLinkDraft) =>
      link.targetEmoji ?? (link.targetType === 'EVENT'
        ? (events.find((event) => event.id === link.eventId)?.emoji ?? null)
        : (majorEvents.find((majorEvent) => majorEvent.id === link.majorEventId)?.emoji ?? null)),
    setLinkTarget: (localId: string, selection: { id: string; name: string; emoji?: string | null }) => {
      links.update((current) => current.map((link) => link.localId === localId
        ? link.targetType === 'EVENT'
          ? { ...link, eventId: selection.id, majorEventId: null, targetName: selection.name, targetEmoji: selection.emoji }
          : { ...link, eventId: null, majorEventId: selection.id, targetName: selection.name, targetEmoji: selection.emoji }
        : link));
    },
    setTargetFilter,
    selectAllForms: async (): Promise<void> => { await setTargetFilter(null); },
    selectEventScope: async (event: Event): Promise<void> => { await setTargetFilter({ eventId: event.id }); },
    selectMajorEventScope: async (majorEvent: MajorEvent): Promise<void> => {
      await setTargetFilter({ majorEventId: majorEvent.id });
    },
    applyFormFilters: async () => undefined,
    previousFormsPage: async () => undefined,
    nextFormsPage: async () => undefined,
    selectFormById: async () => true,
    selectForm: async (nextForm: EventForm) => {
      selectedFormSignal.set(nextForm);
      selectedResultsSignal.set(buildResults(nextForm, args));
      elements.set(buildElements(args.withImages));
      descriptionImages.set(nextForm.descriptionImages ?? []);
      links.set(linkDrafts(nextForm.links));
      patchForm(form, nextForm);
    },
    updateElements: (nextElements: FormElement[]) => {
      elements.set(nextElements);
    },
    uploadImage: async () => undefined,
    removeImage: async (image: FormImage, elementId?: string) => {
      if (elementId) {
        elements.update((current) =>
          current.map((element) =>
            element.id === elementId
              ? {
                  ...element,
                  descriptionImages: (element.descriptionImages ?? []).filter((item) => item.id !== image.id),
                }
              : element,
          ),
        );
      } else {
        descriptionImages.update((current) => current.filter((item) => item.id !== image.id));
      }
    },
    imageTextControl: (image: FormImage, key: 'altText' | 'caption') => {
      const cacheKey = `${image.id}:${key}`;
      const expectedValue = image[key] ?? '';
      const cached = imageTextControls.get(cacheKey);
      if (cached) {
        if (cached.value !== expectedValue) cached.setValue(expectedValue, { emitEvent: false });
        return cached;
      }
      const control = new FormControl(expectedValue, { nonNullable: true });
      control.valueChanges.subscribe((value) => {
        descriptionImages.update((current) =>
          current.map((item) => (item.id === image.id ? { ...item, [key]: value || undefined } : item)),
        );
      });
      imageTextControls.set(cacheKey, control);
      return control;
    },
    singleImage: (image: FormImage) => [image] as const,
    addLink: (targetType: EventFormTargetType) => {
      links.update((current) => [
        ...current,
        {
          localId: `story-link-${current.length + 1}`,
          targetType,
          eventId: targetType === 'EVENT' ? (events[0]?.id ?? '') : null,
          majorEventId: targetType === 'MAJOR_EVENT' ? (majorEvents[0]?.id ?? '') : null,
          audiences: ['SUBSCRIBERS', 'ATTENDEES'],
          insertInSubscriptionFlow: false,
          requiredInSubscriptionFlow: false,
          displayOrder: current.length,
          notifyOnPublish: true,
          allowLecturerManualPublish: false,
        },
      ]);
    },
    removeLink: (localId: string) => {
      links.update((current) => current.filter((link) => link.localId !== localId));
    },
    updateLink: (localId: string, patch: Partial<EventFormLinkInput>) => {
      links.update((current) =>
        current.map((link) =>
          link.localId === localId ? normalizeStoryLink({ ...link, ...patch }, link, events, majorEvents) : link,
        ),
      );
    },
    updateLinkDate: (localId: string, key: 'availableFrom' | 'availableUntil', value: string) => {
      links.update((current) =>
        current.map((link) => (link.localId === localId ? { ...link, [key]: value || null } : link)),
      );
    },
    hasInvalidLinkDateRange: (localId?: string) =>
      links().some(
        (link) =>
          (localId === undefined || link.localId === localId) && isDateAfter(link.availableFrom, link.availableUntil),
      ),
    save: async () => undefined,
    saveDraft: async () => undefined,
    publishNow: async () => undefined,
    schedulePublication: async () => undefined,
    unpublish: async () => undefined,
    delete: async () => undefined,
    loadResults: async () => {
      selectedResultsSignal.set(selectedFormSignal() ? buildResults(selectedFormSignal() as EventForm, args) : null);
    },
    exportUrl: (currentForm: EventForm) => `/api/event-forms/${encodeURIComponent(currentForm.id)}/results.csv`,
    linkedTargetSummary: (currentForm: EventForm) =>
      currentForm.links.map((link) => link.target?.name ?? 'Vínculo').join(', ') || 'Sem vínculos de exibição',
    targetName: (link: EventFormLinkInput) =>
      link.targetType === 'EVENT'
        ? (events.find((event) => event.id === link.eventId)?.name ?? 'Evento selecionado')
        : (majorEvents.find((majorEvent) => majorEvent.id === link.majorEventId)?.name ?? 'Grande evento selecionado'),
    priceTiersForLink: (link: EventFormLinkDraft) =>
      link.targetType === 'MAJOR_EVENT'
        ? (majorEvents
            .find((majorEvent) => majorEvent.id === link.majorEventId)
            ?.majorEventPrices.find((price) => price.type === 'TIERED')?.tiers ?? [])
        : [],
    previousSubscriberCount: () => 12,
  } satisfies Partial<FormsService>;

  return service as unknown as FormsService;
}

function routeParams(target: FormsStoryTarget): Record<string, string> {
  if (target === 'event') {
    return { eventId: 'event-1' };
  }
  if (target === 'major-event') {
    return { majorEventId: 'major-event-1' };
  }
  return {};
}

function buildEvents(count = 2): Event[] {
  const events = [
    createAdminEvent({ id: 'event-1', name: 'Oficina de Angular', emoji: 'computer' }),
    createAdminEvent({ id: 'event-2', name: 'Mesa redonda de acessibilidade', emoji: 'accessibility_new' }),
  ];
  for (let index = events.length; index < count; index++) {
    events.push(createAdminEvent({ id: `event-${index + 1}`, name: `Evento ${index + 1}`, emoji: 'event' }));
  }
  return events;
}

function buildMajorEvents(count = 2): MajorEvent[] {
  const majorEvents = [
    createAdminMajorEvent({ id: 'major-event-1', name: 'Semana da Computação', emoji: 'school' }),
    createAdminMajorEvent({ id: 'major-event-2', name: 'Jornada de Extensão', emoji: 'rocket_launch' }),
  ];
  for (let index = majorEvents.length; index < count; index++) {
    majorEvents.push(createAdminMajorEvent({ id: `major-event-${index + 1}`, name: `Grande evento ${index + 1}`, emoji: 'event' }));
  }
  return majorEvents;
}

function buildForms(args: FormsStoryArgs, events: Event[], majorEvents: MajorEvent[]): EventForm[] {
  return Array.from({ length: args.itemCount }, (_, index) => {
    const event = events[index % events.length] as Event;
    const majorEvent = majorEvents[index % majorEvents.length] as MajorEvent;
    const targetType = args.target === 'major-event' ? 'MAJOR_EVENT' : 'EVENT';
    return createAdminEventForm({
      id: `form-${index + 1}`,
      name: index === 0 ? 'Pesquisa de camiseta' : `Formulário ${index + 1}`,
      description: index === 0 ? 'Coleta dados operacionais da inscrição.' : 'Coleta respostas do público-alvo.',
      descriptionImages: args.withImages && index === 0 ? [reusableStoryImage] : [],
      ownerEventId: targetType === 'EVENT' ? event.id : null,
      ownerMajorEventId: targetType === 'MAJOR_EVENT' ? majorEvent.id : null,
      sigilo: args.sigilo,
      responseMode: args.responseMode,
      resultsPublic: args.mode === 'public-results' ? true : args.resultsPublic,
      resultsLive: args.mode === 'public-results' ? true : args.resultsLive,
      allowResponseEdits: args.allowResponseEdits,
      publicationState: index === 1 ? 'SCHEDULED' : index === 2 ? 'DRAFT' : 'PUBLISHED',
      scheduledPublishAt: index === 1 ? '2026-07-12T18:00:00.000Z' : null,
      links: [
        {
          id: `form-link-${index + 1}`,
          formId: `form-${index + 1}`,
          targetType,
          eventId: targetType === 'EVENT' ? event.id : null,
          majorEventId: targetType === 'MAJOR_EVENT' ? majorEvent.id : null,
          priceTierIds: [],
          target: {
            type: targetType,
            id: targetType === 'EVENT' ? event.id : majorEvent.id,
            name: targetType === 'EVENT' ? event.name : majorEvent.name,
            emoji: targetType === 'EVENT' ? event.emoji : majorEvent.emoji,
          },
          audiences: index === 3 ? ['INTERESTED'] : index % 2 === 0 ? ['SUBSCRIBERS', 'ATTENDEES'] : ['ATTENDEES'],
          insertInSubscriptionFlow: index === 0,
          requiredInSubscriptionFlow: index === 0,
          displayOrder: index,
          availableFrom: null,
          availableUntil: null,
          notifyOnPublish: index === 0 ? false : true,
          allowLecturerManualPublish: index === 0 ? false : targetType === 'EVENT' ? args.lecturerPublish : false,
          lastNotifiedAt: null,
          responseCount: index === 0 ? 12 : index,
          createdAt: '2026-06-20T12:00:00.000Z',
          updatedAt: '2026-06-20T12:00:00.000Z',
        },
      ],
      responseCount: index === 0 ? 12 : index,
    });
  });
}

function buildElements(withImages = false): FormElement[] {
  return [
    {
      id: 'shirt-size',
      type: 'singleChoice',
      title: 'Tamanho da camiseta',
      description: 'Escolha o tamanho desejado.',
      descriptionImages: withImages
        ? [{ ...reusableStoryImage, caption: 'A mesma imagem também pode aparecer junto a uma pergunta.' }]
        : [],
      required: true,
      options: [
        { id: 'p', label: 'P' },
        { id: 'm', label: 'M' },
        { id: 'g', label: 'G' },
        { id: 'gg', label: 'GG' },
      ],
    },
    {
      id: 'review',
      type: 'linearScale',
      title: 'Avaliação geral',
      required: false,
      options: [],
      settings: {
        linearScale: {
          min: 1,
          max: 5,
          minLabel: 'Ruim',
          maxLabel: 'Excelente',
        },
      },
    },
    {
      id: 'comments',
      type: 'longText',
      title: 'Comentários',
      required: false,
      options: [],
    },
  ];
}

function buildResults(form: EventForm, args: FormsStoryArgs): EventFormResults {
  return createAdminEventFormResults({
    form,
    responseCount: form.responseCount,
    anonymous: args.sigilo === 'ANONYMOUS',
    answersReleased: args.sigilo === 'PUBLIC',
  });
}

function linkDrafts(links: readonly EventForm['links'][number][]): EventFormLinkDraft[] {
  return links.map((link) => ({
    ...link,
    localId: link.id,
  }));
}

function createEditorForm(formBuilder: FormBuilder) {
  return formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    description: [''],
    ownerType: ['EVENT' as EventFormTargetType],
    ownerEventId: [''],
    ownerMajorEventId: [''],
    sigilo: ['SECRET' as EventFormSigilo],
    responseMode: ['ONE_PER_TARGET' as EventFormResponseMode],
    resultsPublic: [false],
    resultsLive: [{ value: false, disabled: true }],
    allowResponseEdits: [false],
    scheduledPublishAt: [''],
  });
}

function patchForm(form: ReturnType<typeof createEditorForm>, selectedForm: EventForm | null): void {
  form.reset({
    id: selectedForm?.id ?? '',
    name: selectedForm?.name ?? '',
    description: selectedForm?.description ?? '',
    ownerType: selectedForm ? (selectedForm.ownerEventId ? 'EVENT' : 'MAJOR_EVENT') : 'EVENT',
    ownerEventId: selectedForm?.ownerEventId ?? '',
    ownerMajorEventId: selectedForm?.ownerMajorEventId ?? '',
    sigilo: selectedForm?.sigilo ?? 'SECRET',
    responseMode: selectedForm?.responseMode ?? 'ONE_PER_TARGET',
    resultsPublic: selectedForm?.resultsPublic ?? false,
    resultsLive: selectedForm?.resultsLive ?? false,
    allowResponseEdits: selectedForm?.allowResponseEdits ?? false,
    scheduledPublishAt: selectedForm?.scheduledPublishAt?.slice(0, 16) ?? '',
  });
}

function normalizeStoryLink(
  link: EventFormLinkDraft,
  previous: EventFormLinkDraft,
  events: readonly Event[],
  majorEvents: readonly MajorEvent[],
): EventFormLinkDraft {
  const targetType = link.targetType;
  const insertInSubscriptionFlow =
    link.requiredInSubscriptionFlow === true ? true : (link.insertInSubscriptionFlow ?? false);
  return {
    ...link,
    eventId: targetType === 'EVENT' ? link.eventId || previous.eventId || events[0]?.id || '' : null,
    majorEventId:
      targetType === 'MAJOR_EVENT' ? link.majorEventId || previous.majorEventId || majorEvents[0]?.id || '' : null,
    insertInSubscriptionFlow,
    requiredInSubscriptionFlow: insertInSubscriptionFlow ? (link.requiredInSubscriptionFlow ?? false) : false,
    notifyOnPublish:
      insertInSubscriptionFlow && link.requiredInSubscriptionFlow === true
        ? (link.notifyOnPublish ?? true)
        : insertInSubscriptionFlow
          ? false
          : (link.notifyOnPublish ?? true),
    allowLecturerManualPublish:
      targetType === 'EVENT' && !insertInSubscriptionFlow ? (link.allowLecturerManualPublish ?? false) : false,
  };
}

function selectedIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), length - 1);
}
