import { ActivatedRoute } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { PermissionsService } from '../permissions/permissions.service';
import { PermissionDeniedComponent } from './permission-denied.component';

interface PermissionDeniedStoryArgs {
  sectionLabel: string;
  requiredRoleLabel: string;
  missingPermissions: string[];
}

const meta: Meta<PermissionDeniedStoryArgs> = {
  component: PermissionDeniedComponent,
  title: 'CACiC Eventos/Workspace/Workspace Permission Denied',
  tags: ['autodocs'],
  args: {
    sectionLabel: 'Certificados',
    requiredRoleLabel: '',
    missingPermissions: ['certificate:read', 'certificate-config:read'],
  },
  argTypes: {
    sectionLabel: { control: 'text', description: 'Nome da seção protegida.' },
    requiredRoleLabel: { control: 'text', description: 'Perfil obrigatório, quando a restrição é por função.' },
    missingPermissions: { control: 'object', description: 'Permissões de leitura ausentes.' },
  },
  render: () => ({ props: {} }),
  decorators: [
    (story, context) =>
      applicationConfig({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                data: {
                  id: 'storybook-protected-section',
                  label: context.args.sectionLabel,
                  requiredRoleLabel: context.args.requiredRoleLabel || undefined,
                },
              },
            },
          },
          {
            provide: PermissionsService,
            useValue: {
              missingReadForTab: () => context.args.missingPermissions,
            },
          },
        ],
      })(story, context),
  ],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;
type Story = StoryObj<PermissionDeniedStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Seção indisponível' })).toBeVisible();
    await expect(canvas.getByText('Certificados', { exact: false })).toBeVisible();
    await expect(canvas.getByLabelText('Permissões ausentes')).toBeVisible();
  },
};

export const RoleRestricted: Story = {
  name: 'Restrita ao perfil de representante',
  args: {
    sectionLabel: 'Operação esportiva',
    requiredRoleLabel: 'representante de equipe',
    missingPermissions: [],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('representante de equipe', { exact: false })).toBeVisible();
    await expect(canvas.queryByLabelText('Permissões ausentes')).not.toBeInTheDocument();
  },
};

export const ManyMissingPermissions: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  name: 'Muitas permissões ausentes',
  args: {
    missingPermissions: [
      'event:read',
      'event-group:read',
      'major-event:read',
      'subscription:read',
      'receipt:read',
      'certificate:read',
    ],
  },
};
