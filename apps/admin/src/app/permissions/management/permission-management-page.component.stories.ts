import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { http, HttpResponse } from 'msw';
import { expect, userEvent, within } from 'storybook/test';
import { PermissionsService } from '../permissions.service';
import { PermissionManagementPageComponent } from './permission-management-page.component';

const role = {
  id: 'role-1',
  systemKey: null,
  name: 'Operação de credenciamento',
  description: 'Gerencia inscrições e presenças no evento atribuído.',
  emoji: '🎟️',
  isSystem: false,
  isExternal: false,
  assignable: true,
  version: 2,
  permissions: ['event#read', 'subscription#read', 'event-attendance#read', 'event-attendance#collect'],
  inheritedPermissions: [],
  parentRoleIds: [],
  directPeopleCount: 1,
  groupPeopleCount: 0,
  archivedAt: null,
  updatedAt: '2026-08-17T12:00:00.000Z',
  assignments: [
    {
      id: 'assignment-1',
      personId: 'person-1',
      groupId: null,
      subjectName: 'Ana Souza',
      subjectHasLinkedUser: false,
      validFrom: null,
      validUntil: null,
      unlimited: true,
      archivedAt: null,
      scopes: [
        {
          id: 'scope-1',
          scope: 'EVENT',
          eventId: 'event-1',
          majorEventId: null,
          eventGroupId: null,
          targetLabel: 'Credenciamento',
          validFrom: null,
          validUntil: null,
          unlimited: true,
          archivedAt: null,
        },
      ],
    },
  ],
};

const group = {
  id: 'group-1',
  name: 'Equipe de credenciamento',
  description: 'Organização responsável pelo atendimento no evento.',
  emoji: '👥',
  version: 1,
  assignedRoleIds: [],
  archivedAt: null,
  updatedAt: '2026-08-17T12:00:00.000Z',
  members: [
    {
      id: 'member-1',
      person: { id: 'person-2', name: 'Bruno Lima', email: 'bruno@example.com', hasLinkedUser: true },
      validFrom: null,
      validUntil: null,
      unlimited: true,
      archivedAt: null,
    },
  ],
};

const meta: Meta<PermissionManagementPageComponent> = {
  component: PermissionManagementPageComponent,
  title: 'Admin/Access/Permissions/Management',
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [{ provide: PermissionsService, useValue: { has: () => true } }] })],
  parameters: {
    docs: {
      description: {
        component: 'Permission management workspace for assigning event access and reviewing scoped permissions.',
      },
    },
    layout: 'fullscreen',
    controls: { disable: true },
    msw: {
      handlers: {
        graphql: [
          http.post('/api/graphql', async ({ request }) => {
            const body = (await request.json()) as { query?: string };
            const query = body.query ?? '';
            if (query.includes('PermissionRoles')) return HttpResponse.json({ data: { permissionRoles: [role] } });
            if (query.includes('PermissionGroups')) return HttpResponse.json({ data: { permissionGroups: [group] } });
            if (query.includes('PermissionScopeTargets')) {
              return HttpResponse.json({
                data: {
                  permissionScopeTargets: [
                    { id: 'event-1', label: 'Credenciamento', description: 'SECOMP', emoji: '🎫', parentId: 'major-1' },
                  ],
                },
              });
            }
            return HttpResponse.json({ data: {} });
          }),
        ],
      },
    },
  },
};

export default meta;
type Story = StoryObj<PermissionManagementPageComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const groupSearch = await canvas.findByRole('searchbox', { name: 'Buscar grupo' });
    await userEvent.type(groupSearch, 'credenciamento');
    await expect(canvas.getByRole('button', { name: 'Adicionar grupo Equipe de credenciamento' })).toBeVisible();
  },
};

export const Default: Story = Playground;

export const UnsavedChanges: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole('textbox', { name: 'Nome' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Operação de credenciamento revisada');
    await expect(canvas.getByText('Alterações não salvas')).toBeVisible();
  },
};


export const RoleSearch: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const search = await canvas.findByRole('searchbox', { name: 'Buscar cargo por nome ou descrição' });
    await userEvent.type(search, 'presencas');
    await expect(canvas.getByRole('button', { name: 'Operação de credenciamento' })).toBeVisible();
    await userEvent.clear(search);
    await userEvent.type(search, 'inexistente');
    await expect(canvas.queryByRole('button', { name: 'Operação de credenciamento' })).toBeNull();
    await expect(canvas.getByText('Nenhum cargo personalizado encontrado.')).toBeVisible();
  },
};
