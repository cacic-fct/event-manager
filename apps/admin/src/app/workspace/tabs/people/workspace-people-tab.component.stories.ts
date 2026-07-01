import { EventManagerKeycloakRole, EventManagerPermissionGrantScope, Permission } from '@cacic-fct/shared-permissions';
import { computed, signal } from '@angular/core';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { HttpResponse, http } from 'msw';
import { applicationConfig } from '@storybook/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, screen, userEvent, within } from 'storybook/test';
import type {
  EventManagerPermissionGrant,
  EventManagerPermissionGrantTarget,
  Person,
  PersonLinkedDataSummary,
  PersonLinkedResourcePage,
} from '@cacic-fct/event-manager-admin-contracts';
import { WorkspacePeopleTabComponent } from './workspace-people-tab.component';

faker.seed(20260621);

type PeoplePermissionsStoryArgs = {
  personCount: number;
  grantCount: number;
  includeExpiredGrant: boolean;
};

type GrantTarget = {
  id: string;
  name: string;
  emoji: string;
  startDate: string;
  endDate: string;
  majorEvent?: {
    id: string;
    name: string;
    emoji: string;
    startDate: string;
    endDate: string;
  } | null;
};

type StoryData = {
  people: Person[];
  events: GrantTarget[];
  majorEvents: GrantTarget[];
  eventGroups: GrantTarget[];
  permissionGrants: EventManagerPermissionGrant[];
};

type GraphqlBody = {
  query?: string;
  variables?: Record<string, unknown>;
};

const now = new Date('2026-06-21T12:00:00.000-03:00');
const storyRoles = signal<string[]>([EventManagerKeycloakRole.SuperAdmin]);
const storyAuthService = {
  user: computed(() => ({
    sub: 'storybook-admin',
    preferredUsername: 'storybook-admin',
    email: 'admin@example.com',
    roles: storyRoles(),
    scopes: ['profile', 'email'],
    permissions: [],
    claims: {},
  })),
  roles: storyRoles,
  scopes: () => ['profile', 'email'],
  isAuthenticated: () => true,
  initialize: async () => undefined,
  login: async () => undefined,
  logout: async () => undefined,
  getAccessToken: () => null,
};
const defaultArgs: PeoplePermissionsStoryArgs = {
  personCount: 6,
  grantCount: 4,
  includeExpiredGrant: true,
};
let activeArgs = defaultArgs;
let activeData = buildStoryData(defaultArgs);

const meta: Meta<PeoplePermissionsStoryArgs> = {
  component: WorkspacePeopleTabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/People/Workspace People Tab',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    personCount: { control: { type: 'range', min: 1, max: 12, step: 1 } },
    grantCount: { control: { type: 'range', min: 0, max: 6, step: 1 } },
    includeExpiredGrant: { control: 'boolean' },
  },
  render: (args) => {
    storyRoles.set([EventManagerKeycloakRole.SuperAdmin]);
    activeArgs = args;
    activeData = buildStoryData(args);
    return { props: args };
  },
  decorators: [
    applicationConfig({
      providers: [{ provide: AuthService, useValue: storyAuthService }],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as GraphqlBody;
          return HttpResponse.json({ data: graphqlData(body.query ?? '', body.variables ?? {}) });
        }),
      ],
    },
  },
};

export default meta;

type Story = StoryObj<PeoplePermissionsStoryArgs>;

export const PermissionManagement: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText(/buscar pessoa/i), 'ana');
    await userEvent.click(await canvas.findByRole('button', { name: /buscar/i }));
    await userEvent.click(await canvas.findByText(activeData.people[0].name));

    await expect(await canvas.findByText('Permissões do Event Manager')).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /vínculos/i }));
    await expect(await screen.findByRole('heading', { name: 'Vínculos da pessoa' })).toBeVisible();
    await expect(await screen.findByText('Certificados')).toBeVisible();
    await expect(await screen.findByText('Ministrante')).toBeVisible();
    await userEvent.click(await screen.findByRole('button', { name: 'Fechar' }));

    await expect(await canvas.findByLabelText('Preset')).toBeVisible();
    await expect(await canvas.findByLabelText('Categoria')).toBeVisible();
    await expect(await canvas.findByLabelText('Permissões')).toBeVisible();
    await expect(await canvas.findByLabelText('Escopo da permissão')).toBeVisible();
    await expect(await canvas.findByLabelText('Válida a partir de')).toBeVisible();
    await expect(await canvas.findByLabelText('Válida até')).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: /adicionar permissões/i }));
    await expect(await canvas.findByText('Permissões em revisão')).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /salvar permissões/i })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: /remover permissão da revisão/i })).toBeVisible();

    if (activeArgs.grantCount > 0) {
      await expect(await canvas.findByText(/Validade indefinida|A partir de|Até|De /i)).toBeVisible();
      const editButtons = await canvas.findAllByRole('button', { name: /editar permissão/i });
      await userEvent.click(editButtons[0]);
      await expect(await canvas.findByRole('button', { name: /salvar permissão/i })).toBeVisible();
      await expect(await canvas.findByRole('button', { name: /cancelar edição/i })).toBeVisible();
    }
  },
};

export const EmptyPermissions: Story = {
  args: {
    grantCount: 0,
    includeExpiredGrant: false,
  },
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText(/buscar pessoa/i), 'ana');
    await userEvent.click(await canvas.findByRole('button', { name: /buscar/i }));
    await userEvent.click(await canvas.findByText(activeData.people[0].name));
    await expect(await canvas.findByText('Nenhuma permissão concedida')).toBeVisible();
  },
};

export const DeletablePersonWithoutLinks: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const deletablePerson = activeData.people[1];
    await userEvent.type(await canvas.findByLabelText(/buscar pessoa/i), deletablePerson.name);
    await userEvent.click(await canvas.findByRole('button', { name: /buscar/i }));
    await userEvent.click(await canvas.findByText(deletablePerson.name));
    await userEvent.click(await canvas.findByRole('button', { name: /vínculos/i }));
    await expect(await screen.findByRole('heading', { name: 'Vínculos da pessoa' })).toBeVisible();
    await expect(await screen.findByText('Nenhum vínculo encontrado')).toBeVisible();
    await expect(await screen.findByRole('button', { name: 'Excluir pessoa' })).toBeEnabled();
  },
};

function graphqlData(query: string, variables: Record<string, unknown>) {
  if (query.includes('ListPeople') || query.includes('ListPeopleSummaries')) {
    const search = typeof variables['query'] === 'string' ? variables['query'].toLocaleLowerCase('pt-BR') : '';
    return {
      people: search
        ? activeData.people.filter((person) => person.name.toLocaleLowerCase('pt-BR').includes(search))
        : activeData.people,
    };
  }

  if (query.includes('GetPerson')) {
    return {
      person: activeData.people.find((person) => person.id === variables['id']) ?? activeData.people[0],
    };
  }

  if (query.includes('PersonLinkedDataSummary')) {
    const personId = String(variables['id'] ?? activeData.people[0].id);
    return {
      personLinkedDataSummary: linkedDataSummary(personId, personId === activeData.people[1]?.id ? 'empty' : 'active'),
    };
  }

  if (query.includes('PersonLinkedResources')) {
    const personId = String(variables['personId'] ?? activeData.people[0].id);
    return {
      personLinkedResources: linkedDataResources(
        personId,
        String(variables['type'] ?? 'CERTIFICATE'),
        Number(variables['skip'] ?? 0),
        Number(variables['take'] ?? 10),
      ),
    };
  }

  if (query.includes('DeletePerson')) {
    return { deletePerson: { deleted: true, id: String(variables['id'] ?? activeData.people[0].id) } };
  }

  if (query.includes('EventManagerPermissionGrants')) {
    return {
      eventManagerPermissionGrants: activeData.permissionGrants.filter((grant) => grant.userId === variables['userId']),
    };
  }

  if (query.includes('EventManagerPermissionGrantTargets')) {
    return {
      eventManagerPermissionGrantTargets: permissionGrantTargets(variables['scope']),
    };
  }

  if (query.includes('CreateEventManagerPermissionGrant')) {
    return {
      createEventManagerPermissionGrant: buildCreatedGrant((variables['input'] ?? {}) as Record<string, unknown>),
    };
  }

  if (query.includes('UpdateEventManagerPermissionGrant')) {
    return {
      updateEventManagerPermissionGrant: {
        ...buildCreatedGrant((variables['input'] ?? {}) as Record<string, unknown>),
        id: String(variables['id'] ?? 'grant-global'),
        updatedAt: now.toISOString(),
        updatedById: 'storybook-admin',
      },
    };
  }

  if (query.includes('DeleteEventManagerPermissionGrant')) {
    return { deleteEventManagerPermissionGrant: { deleted: true, id: String(variables['id'] ?? 'grant-1') } };
  }

  if (query.includes('ListEvents')) {
    return { events: activeData.events };
  }

  if (query.includes('ListMajorEvents')) {
    return { majorEvents: activeData.majorEvents };
  }

  if (query.includes('ListEventGroups')) {
    return { eventGroups: activeData.eventGroups };
  }

  return {};
}

function linkedDataSummary(personId: string, variant: 'active' | 'empty' = 'active'): PersonLinkedDataSummary {
  const person = activeData.people.find((item) => item.id === personId) ?? activeData.people[0];
  const event = activeData.events[0];
  const majorEvent = activeData.majorEvents[0];
  if (variant === 'empty') {
    return {
      personId: person.id,
      groups: [],
      totalCount: 0,
      hasLinkedData: false,
      canDelete: true,
    };
  }

  const groups = [
    {
      type: 'CERTIFICATE',
      label: 'Certificados',
      icon: 'workspace_premium',
      totalCount: 1,
      items: [
        {
          id: 'certificate-story',
          label: 'Certificado de participação',
          description: `Grande evento: ${majorEvent.name}`,
          route: `/certificates/major-event/${majorEvent.id}/certificate-config-story`,
          status: null,
          occurredAt: isoDaysFromNow(-2),
        },
      ],
    },
    {
      type: 'EVENT_RELATION',
      label: 'Vínculos com eventos',
      icon: 'event_available',
      totalCount: 1,
      items: [
        {
          id: `${event.id}:${person.id}:lecturer`,
          label: event.name,
          description: 'Ministrante',
          route: `/events/${event.id}`,
          status: null,
          occurredAt: isoDaysFromNow(-12),
        },
      ],
    },
  ];

  return {
    personId: person.id,
    groups,
    totalCount: groups.reduce((total, group) => total + group.totalCount, 0),
    hasLinkedData: true,
    canDelete: false,
  };
}

function linkedDataResources(personId: string, type: string, skip: number, take: number): PersonLinkedResourcePage {
  const summary = linkedDataSummary(personId);
  const group = summary.groups.find((item) => item.type === type);
  const items = group?.items ?? [];

  return {
    personId,
    type,
    label: group?.label ?? type,
    icon: group?.icon ?? 'link',
    items: items.slice(skip, skip + take),
    total: group?.totalCount ?? 0,
    skip,
    take,
  };
}

function permissionGrantTargets(scope: unknown): EventManagerPermissionGrantTarget[] {
  switch (scope) {
    case EventManagerPermissionGrantScope.Event:
      return activeData.events.map((event) => ({
        id: event.id,
        label: event.name,
        description: event.majorEvent?.name ?? 'Evento sem grande evento',
        emoji: event.emoji,
        startDate: event.startDate,
        endDate: event.endDate,
      }));
    case EventManagerPermissionGrantScope.MajorEvent:
      return activeData.majorEvents.map((majorEvent) => ({
        id: majorEvent.id,
        label: majorEvent.name,
        description: 'Grande evento',
        emoji: majorEvent.emoji,
        startDate: majorEvent.startDate,
        endDate: majorEvent.endDate,
      }));
    case EventManagerPermissionGrantScope.EventGroup:
      return activeData.eventGroups.map((eventGroup) => ({
        id: eventGroup.id,
        label: eventGroup.name,
        description: 'Grupo de eventos',
        emoji: eventGroup.emoji,
        startDate: eventGroup.startDate,
        endDate: eventGroup.endDate,
      }));
    default:
      return [];
  }
}

function buildStoryData(args: PeoplePermissionsStoryArgs): StoryData {
  faker.seed(20260621 + args.personCount + args.grantCount);
  const people = Array.from({ length: args.personCount }, (_, index) => person(index));
  const majorEvents = Array.from({ length: 3 }, (_, index) => grantTarget('major', index));
  const eventGroups = Array.from({ length: 3 }, (_, index) => grantTarget('group', index));
  const events = Array.from({ length: 5 }, (_, index) => ({
    ...grantTarget('event', index),
    majorEvent: majorEvents[index % majorEvents.length],
  }));
  const permissionGrants = buildPermissionGrants(args, people[0], events, majorEvents, eventGroups);

  return {
    people,
    events,
    majorEvents,
    eventGroups,
    permissionGrants,
  };
}

function person(index: number): Person {
  const firstName = index === 0 ? 'Ana Clara' : faker.person.firstName();
  const lastName = faker.person.lastName();
  const id = `person-${index + 1}`;
  const userId = `user-${index + 1}`;

  return {
    id,
    name: `${firstName} ${lastName}`,
    email: faker.internet.email({ firstName, lastName }).toLocaleLowerCase('pt-BR'),
    secondaryEmails: [faker.internet.email().toLocaleLowerCase('pt-BR')],
    phone: faker.phone.number({ style: 'national' }),
    identityDocument: faker.string.numeric(11),
    academicId: faker.string.numeric(9),
    userId,
    user: {
      id: userId,
      name: `${firstName} ${lastName}`,
      email: faker.internet.email({ firstName, lastName }).toLocaleLowerCase('pt-BR'),
      role: index === 0 ? 'ADMIN' : 'USER',
    },
    mergedIntoId: null,
    externalRef: `storybook-${index + 1}`,
    deletedAt: null,
    createdAt: isoDaysFromNow(-30 + index),
    createdById: 'storybook-admin',
    updatedAt: isoDaysFromNow(-1),
    updatedById: 'storybook-admin',
    lecturerProfile: null,
  };
}

function grantTarget(prefix: string, index: number): GrantTarget {
  const names = [
    'CACiC Tech Week',
    'Arquitetura Angular com Signals',
    'Trilha de Segurança',
    'Workshop de Dados',
    'Observabilidade em APIs',
  ];
  const emojis = ['💻', '🚀', '🔐', '📊', '🎓'];

  return {
    id: `${prefix}-${index + 1}`,
    name: names[index % names.length],
    emoji: emojis[index % emojis.length],
    startDate: isoDaysFromNow(index + 1, 9),
    endDate: isoDaysFromNow(index + 1, 18),
  };
}

function buildPermissionGrants(
  args: PeoplePermissionsStoryArgs,
  selectedPerson: Person,
  events: GrantTarget[],
  majorEvents: GrantTarget[],
  eventGroups: GrantTarget[],
): EventManagerPermissionGrant[] {
  const grants: EventManagerPermissionGrant[] = [
    grant(selectedPerson, {
      id: 'grant-global',
      permission: Permission.Person.Read,
      scope: EventManagerPermissionGrantScope.Global,
    }),
    grant(selectedPerson, {
      id: 'grant-scheduled',
      permission: Permission.Event.Update,
      scope: EventManagerPermissionGrantScope.Event,
      event: events[0],
      validFrom: isoDaysFromNow(2, 8),
    }),
    grant(selectedPerson, {
      id: 'grant-expiring',
      permission: Permission.Receipt.Approve,
      scope: EventManagerPermissionGrantScope.MajorEvent,
      majorEvent: majorEvents[0],
      validUntil: isoDaysFromNow(14, 23),
    }),
    grant(selectedPerson, {
      id: 'grant-group',
      permission: Permission.Subscription.Read,
      scope: EventManagerPermissionGrantScope.EventGroup,
      eventGroup: eventGroups[0],
    }),
    grant(selectedPerson, {
      id: 'grant-expired',
      permission: Permission.Certificate.Read,
      scope: EventManagerPermissionGrantScope.MajorEvent,
      majorEvent: majorEvents[1],
      validUntil: isoDaysFromNow(-1, 23),
    }),
  ];

  return grants.filter((item) => args.includeExpiredGrant || item.id !== 'grant-expired').slice(0, args.grantCount);
}

function grant(
  selectedPerson: Person,
  input: {
    id: string;
    permission: Permission;
    scope: EventManagerPermissionGrantScope;
    event?: GrantTarget;
    majorEvent?: GrantTarget;
    eventGroup?: GrantTarget;
    validFrom?: string | null;
    validUntil?: string | null;
  },
): EventManagerPermissionGrant {
  return {
    id: input.id,
    userId: selectedPerson.userId ?? selectedPerson.user?.id ?? 'user-1',
    personId: selectedPerson.id,
    permission: input.permission,
    scope: input.scope,
    eventId: input.event?.id ?? null,
    majorEventId: input.majorEvent?.id ?? null,
    eventGroupId: input.eventGroup?.id ?? null,
    targetLabel: input.event?.name ?? input.majorEvent?.name ?? input.eventGroup?.name ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    createdAt: isoDaysFromNow(-7),
    createdById: 'storybook-admin',
    updatedAt: isoDaysFromNow(-2),
    updatedById: 'storybook-admin',
  };
}

function buildCreatedGrant(input: Record<string, unknown>): EventManagerPermissionGrant {
  const eventId = typeof input['eventId'] === 'string' ? input['eventId'] : null;
  const majorEventId = typeof input['majorEventId'] === 'string' ? input['majorEventId'] : null;
  const eventGroupId = typeof input['eventGroupId'] === 'string' ? input['eventGroupId'] : null;
  const target =
    activeData.events.find((item) => item.id === eventId) ??
    activeData.majorEvents.find((item) => item.id === majorEventId) ??
    activeData.eventGroups.find((item) => item.id === eventGroupId) ??
    null;

  return {
    id: 'grant-created',
    userId: String(input['userId'] ?? activeData.people[0].userId),
    personId: String(input['personId'] ?? activeData.people[0].id),
    permission: String(input['permission'] ?? Permission.Event.Read),
    scope: String(input['scope'] ?? EventManagerPermissionGrantScope.Global) as EventManagerPermissionGrantScope,
    eventId,
    majorEventId,
    eventGroupId,
    targetLabel: target?.name ?? null,
    validFrom: typeof input['validFrom'] === 'string' ? input['validFrom'] : null,
    validUntil: typeof input['validUntil'] === 'string' ? input['validUntil'] : null,
    createdAt: now.toISOString(),
    createdById: 'storybook-admin',
    updatedAt: now.toISOString(),
    updatedById: 'storybook-admin',
  };
}

function isoDaysFromNow(days: number, hour = 12): string {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}
