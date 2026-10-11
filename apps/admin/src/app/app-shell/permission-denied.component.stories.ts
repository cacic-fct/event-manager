import { ActivatedRoute } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
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
  title: 'Admin/Access/Permission Denied',
  tags: ['autodocs'],
  args: {
    sectionLabel: 'Certificados',
    requiredRoleLabel: '',
    missingPermissions: ['certificate:read', 'certificate-config:read'],
  },
  argTypes: {
    sectionLabel: { control: 'text', description: 'Name of the protected section.' },
    requiredRoleLabel: { control: 'text', description: 'Required role when access is restricted by role.' },
    missingPermissions: { control: 'object', description: 'Missing permissions required to read this section.' },
  },
  render: () => ({ props: {} }),
  decorators: [
    withScenarioControls<PermissionDeniedStoryArgs>(),
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
    docs: {
      description: {
        component: 'Permission boundary view for checking missing roles and permissions. Use the controls to change the protected section and required access.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
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
  name: 'Role restricted',
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
  name: 'Multiple missing permissions',
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
