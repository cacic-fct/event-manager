import { computed, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import {
  EventForm,
  EventFormLinkInput,
  EventFormResults,
  EventFormSigilo,
  EventFormTargetType,
  Event,
  MajorEvent,
} from '@cacic-fct/event-manager-admin-contracts';
import { type FormElement } from '@cacic-fct/form-contracts';
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
} from '../../../testing/admin-entity-fixtures';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { EventFormLinkDraft, WorkspaceFormsService } from '../../../shared/services/workspace-forms.service';
import { WorkspaceFormsTabComponent } from './workspace-forms-tab.component';

type FormsStoryMode = 'populated' | 'empty' | 'readonly' | 'loading' | 'public-results';
type FormsStoryTarget = 'all' | 'event' | 'major-event';

interface WorkspaceFormsStoryArgs {
  mode: FormsStoryMode;
  target: FormsStoryTarget;
  itemCount: number;
  selectedIndex: number;
  sigilo: EventFormSigilo;
  resultsPublic: boolean;
  resultsLive: boolean;
  lecturerPublish: boolean;
}

const defaultArgs: WorkspaceFormsStoryArgs = {
  mode: 'populated',
  target: 'all',
  itemCount: 4,
  selectedIndex: 0,
  sigilo: 'PARTIALLY_SECRET',
  resultsPublic: false,
  resultsLive: false,
  lecturerPublish: true,
};

const eventFormPermissions: PermissionScope[] = [
  Permission.EventForm.Read,
  Permission.EventForm.Create,
  Permission.EventForm.Update,
  Permission.EventForm.Delete,
  Permission.EventForm.Publish,
  Permission.EventForm.Results,
  Permission.EventForm.Export,
];

const meta: Meta<WorkspaceFormsStoryArgs> = {
  component: WorkspaceFormsTabComponent,
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
    itemCount: { control: { type: 'number', min: 0, max: 8, step: 1 } },
    selectedIndex: { control: { type: 'number', min: 0, max: 7, step: 1 } },
    sigilo: {
      control: 'select',
      options: ['PUBLIC', 'PARTIALLY_SECRET', 'SECRET', 'ANONYMOUS'],
    },
    resultsPublic: { control: 'boolean' },
    resultsLive: { control: 'boolean' },
    lecturerPublish: { control: 'boolean' },
  },
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: createFormsStoryProviders({
          ...defaultArgs,
          ...(context.args as WorkspaceFormsStoryArgs),
        }),
      })(story, context),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceFormsStoryArgs>;

export const Populated: Story = {
  args: {},
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseFormsStory(canvasElement),
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
  args: { mode: 'loading' },
  globals: { theme: 'light' },
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
    await expect(canvas.getByText(/resultados visíveis fora da administração/i)).toBeVisible();
  },
};

export const MajorEventFiltered: Story = {
  args: {
    target: 'major-event',
    selectedIndex: 1,
    lecturerPublish: false,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => exerciseFormsStory(canvasElement),
};

async function exerciseFormsStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('button', { name: /novo/i })).toBeVisible();
  await userEvent.tab();
  const enabledButton = canvas
    .queryAllByRole('button')
    .find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
}

function createFormsStoryProviders(args: WorkspaceFormsStoryArgs) {
  return [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        paramMap: of(convertToParamMap(routeParams(args.target))),
      },
    },
    {
      provide: WorkspacePermissionsService,
      useValue: createPermissionsStoryService(args.mode !== 'readonly'),
    },
    {
      provide: WorkspaceFormsService,
      useFactory: () => createFormsStoryService(new FormBuilder(), args),
    },
  ];
}

function createPermissionsStoryService(canWrite: boolean): Pick<
  WorkspacePermissionsService,
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

function createFormsStoryService(formBuilder: FormBuilder, args: WorkspaceFormsStoryArgs): WorkspaceFormsService {
  const events = buildEvents();
  const majorEvents = buildMajorEvents();
  const forms = args.mode === 'empty' ? [] : buildForms(args, events, majorEvents);
  const selectedForm = forms[selectedIndex(args.selectedIndex, forms.length)] ?? null;
  const selectedResults = selectedForm ? buildResults(selectedForm, args) : null;
  const form = createEditorForm(formBuilder);
  const elements = signal<FormElement[]>(selectedForm ? buildElements() : []);
  const links = signal<EventFormLinkDraft[]>(selectedForm ? linkDrafts(selectedForm.links) : []);
  const selectedFormSignal = signal<EventForm | null>(selectedForm);
  const selectedResultsSignal = signal<EventFormResults | null>(selectedResults);

  patchForm(form, selectedForm);

  const service = {
    loading: signal(args.mode === 'loading'),
    forms: signal(forms),
    selectedForm: selectedFormSignal,
    selectedResults: selectedResultsSignal,
    elements,
    links,
    events: signal(events),
    majorEvents: signal(majorEvents),
    targetFilter: signal<{ eventId?: string; majorEventId?: string } | null>(null),
    selectedFormPublished: computed(() => selectedFormSignal()?.publicationState === 'PUBLISHED'),
    selectedFormScheduled: computed(() => selectedFormSignal()?.publicationState === 'SCHEDULED'),
    filtersForm: formBuilder.nonNullable.group({ query: [''] }),
    form,
    initialize: async () => undefined,
    loadTargets: async () => undefined,
    loadForms: async () => undefined,
    createForm: () => {
      selectedFormSignal.set(null);
      selectedResultsSignal.set(null);
      elements.set([]);
      links.set([]);
      patchForm(form, null);
    },
    setTargetFilter: (filter: { eventId?: string; majorEventId?: string } | null) => {
      service.targetFilter.set(filter);
    },
    selectForm: async (nextForm: EventForm) => {
      selectedFormSignal.set(nextForm);
      selectedResultsSignal.set(buildResults(nextForm, args));
      elements.set(buildElements());
      links.set(linkDrafts(nextForm.links));
      patchForm(form, nextForm);
    },
    updateElements: (nextElements: FormElement[]) => {
      elements.set(nextElements);
    },
    addLink: (targetType: EventFormTargetType) => {
      links.update((current) => [
        ...current,
        {
          localId: `story-link-${current.length + 1}`,
          targetType,
          eventId: targetType === 'EVENT' ? events[0]?.id ?? '' : null,
          majorEventId: targetType === 'MAJOR_EVENT' ? majorEvents[0]?.id ?? '' : null,
          audience: 'SUBSCRIBERS_OR_ATTENDEES',
          insertInSubscriptionFlow: false,
          requiredInSubscriptionFlow: false,
          enforceRequiredAnswers: true,
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
          link.localId === localId
            ? {
                ...link,
                ...patch,
                allowLecturerManualPublish:
                  (patch.targetType ?? link.targetType) === 'EVENT'
                    ? (patch.allowLecturerManualPublish ?? link.allowLecturerManualPublish ?? false)
                    : false,
              }
            : link,
        ),
      );
    },
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
    targetName: (link: EventFormLinkInput) =>
      link.targetType === 'EVENT'
        ? events.find((event) => event.id === link.eventId)?.name ?? 'Evento'
        : majorEvents.find((majorEvent) => majorEvent.id === link.majorEventId)?.name ?? 'Grande evento',
  } satisfies Partial<WorkspaceFormsService>;

  return service as WorkspaceFormsService;
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

function buildEvents(): Event[] {
  return [
    createAdminEvent({ id: 'event-1', name: 'Oficina de Angular', emoji: 'computer' }),
    createAdminEvent({ id: 'event-2', name: 'Mesa redonda de acessibilidade', emoji: 'accessibility_new' }),
  ];
}

function buildMajorEvents(): MajorEvent[] {
  return [
    createAdminMajorEvent({ id: 'major-event-1', name: 'Semana da Computação', emoji: 'school' }),
    createAdminMajorEvent({ id: 'major-event-2', name: 'Jornada de Extensão', emoji: 'rocket_launch' }),
  ];
}

function buildForms(args: WorkspaceFormsStoryArgs, events: Event[], majorEvents: MajorEvent[]): EventForm[] {
  return Array.from({ length: args.itemCount }, (_, index) => {
    const event = events[index % events.length] as Event;
    const majorEvent = majorEvents[index % majorEvents.length] as MajorEvent;
    const targetType = args.target === 'major-event' ? 'MAJOR_EVENT' : 'EVENT';
    return createAdminEventForm({
      id: `form-${index + 1}`,
      name: index === 0 ? 'Pesquisa de camiseta' : `Formulário ${index + 1}`,
      description: index === 0 ? 'Coleta dados operacionais da inscrição.' : 'Coleta respostas do público-alvo.',
      ownerEventId: targetType === 'EVENT' ? event.id : null,
      ownerMajorEventId: targetType === 'MAJOR_EVENT' ? majorEvent.id : null,
      sigilo: args.sigilo,
      resultsPublic: args.mode === 'public-results' ? true : args.resultsPublic,
      resultsLive: args.mode === 'public-results' ? true : args.resultsLive,
      publicationState: index === 1 ? 'SCHEDULED' : index === 2 ? 'DRAFT' : 'PUBLISHED',
      scheduledPublishAt: index === 1 ? '2026-07-12T18:00:00.000Z' : null,
      links: [
        {
          id: `form-link-${index + 1}`,
          formId: `form-${index + 1}`,
          targetType,
          eventId: targetType === 'EVENT' ? event.id : null,
          majorEventId: targetType === 'MAJOR_EVENT' ? majorEvent.id : null,
          target: {
            type: targetType,
            id: targetType === 'EVENT' ? event.id : majorEvent.id,
            name: targetType === 'EVENT' ? event.name : majorEvent.name,
            emoji: targetType === 'EVENT' ? event.emoji : majorEvent.emoji,
          },
          audience: index % 2 === 0 ? 'SUBSCRIBERS_OR_ATTENDEES' : 'ATTENDEES',
          insertInSubscriptionFlow: index === 0,
          requiredInSubscriptionFlow: index === 0,
          enforceRequiredAnswers: true,
          displayOrder: index,
          availableFrom: null,
          availableUntil: null,
          notifyOnPublish: true,
          allowLecturerManualPublish: targetType === 'EVENT' ? args.lecturerPublish : false,
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

function buildElements(): FormElement[] {
  return [
    {
      id: 'shirt-size',
      type: 'singleChoice',
      title: 'Tamanho da camiseta',
      description: 'Escolha o tamanho desejado.',
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

function buildResults(form: EventForm, args: WorkspaceFormsStoryArgs): EventFormResults {
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
    ownerType: ['NONE' as 'NONE' | EventFormTargetType],
    ownerEventId: [''],
    ownerMajorEventId: [''],
    sigilo: ['SECRET' as EventFormSigilo],
    resultsPublic: [false],
    resultsLive: [false],
    scheduledPublishAt: [''],
  });
}

function patchForm(form: ReturnType<typeof createEditorForm>, selectedForm: EventForm | null): void {
  form.reset({
    id: selectedForm?.id ?? '',
    name: selectedForm?.name ?? 'Novo formulário',
    description: selectedForm?.description ?? '',
    ownerType: selectedForm?.ownerEventId ? 'EVENT' : selectedForm?.ownerMajorEventId ? 'MAJOR_EVENT' : 'NONE',
    ownerEventId: selectedForm?.ownerEventId ?? '',
    ownerMajorEventId: selectedForm?.ownerMajorEventId ?? '',
    sigilo: selectedForm?.sigilo ?? 'SECRET',
    resultsPublic: selectedForm?.resultsPublic ?? false,
    resultsLive: selectedForm?.resultsLive ?? false,
    scheduledPublishAt: selectedForm?.scheduledPublishAt?.slice(0, 16) ?? '',
  });
}

function selectedIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  return Math.min(Math.max(index, 0), length - 1);
}
