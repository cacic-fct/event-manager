import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { http, HttpResponse } from 'msw';
import { PermissionsService } from '../permissions.service';
import { PermissionManagementPageComponent } from './permission-management-page.component';

const role = {
  id: 'role-1', systemKey: null, name: 'Operação de credenciamento',
  description: 'Gerencia inscrições e presenças no evento atribuído.', emoji: '🎟️', isSystem: false,
  isExternal: false, assignable: true, version: 2,
  permissions: ['event#read', 'subscription#read', 'event-attendance#read', 'event-attendance#collect'],
  inheritedPermissions: [], parentRoleIds: [], directPeopleCount: 1, groupPeopleCount: 0,
  archivedAt: null, updatedAt: '2026-08-17T12:00:00.000Z',
  assignments: [{
    id: 'assignment-1', personId: 'person-1', groupId: null, subjectName: 'Ana Souza',
    subjectHasLinkedUser: false, validFrom: null, validUntil: null, unlimited: true, archivedAt: null,
    scopes: [{ id: 'scope-1', scope: 'EVENT', eventId: 'event-1', majorEventId: null, eventGroupId: null,
      targetLabel: 'Credenciamento', validFrom: null, validUntil: null, unlimited: true, archivedAt: null }],
  }],
};

const meta: Meta<PermissionManagementPageComponent> = {
  component: PermissionManagementPageComponent,
  title: 'CACiC Eventos/Workspace/Permissões/Gerenciamento',
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [{ provide: PermissionsService, useValue: { has: () => true } }] })],
  parameters: {
    layout: 'fullscreen',
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = await request.json() as { query?: string };
          const query = body.query ?? '';
          if (query.includes('PermissionRoles')) return HttpResponse.json({ data: { permissionRoles: [role] } });
          if (query.includes('PermissionGroups')) return HttpResponse.json({ data: { permissionGroups: [] } });
          if (query.includes('PermissionScopeTargets')) {
            return HttpResponse.json({ data: { permissionScopeTargets: [
              { id: 'event-1', label: 'Credenciamento', description: 'SECOMP', emoji: '🎫', parentId: 'major-1' },
            ] } });
          }
          return HttpResponse.json({ data: {} });
        }),
      ],
    },
  },
};

export default meta;
type Story = StoryObj<PermissionManagementPageComponent>;

export const Default: Story = {};

export const CompactDark: Story = {
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
