import { signal } from '@angular/core';
import { EVENT_MANAGER_PERMISSION_CATALOG, type Permission } from '@cacic-fct/shared-permissions';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PermissionsPageComponent } from './permissions-page.component';
import { PermissionsService } from './permissions.service';

type PermissionPreset = 'all' | 'read-only' | 'events' | 'certificates' | 'none';

interface PermissionsPageStoryArgs {
  preset: PermissionPreset;
  permissionCount: number;
  reverseOrder: boolean;
}

const defaultArgs: PermissionsPageStoryArgs = {
  preset: 'all',
  permissionCount: EVENT_MANAGER_PERMISSION_CATALOG.length,
  reverseOrder: false,
};

const rawPermissions = signal<Permission[]>([]);

function selectPermissions(args: PermissionsPageStoryArgs): Permission[] {
  let permissions: Permission[];
  switch (args.preset) {
    case 'read-only':
      permissions = EVENT_MANAGER_PERMISSION_CATALOG.filter((permission) => permission.endsWith('.read'));
      break;
    case 'events':
      permissions = EVENT_MANAGER_PERMISSION_CATALOG.filter((permission) =>
        ['event.', 'event-group.', 'major-event.', 'publication.'].some((prefix) => permission.startsWith(prefix)),
      );
      break;
    case 'certificates':
      permissions = EVENT_MANAGER_PERMISSION_CATALOG.filter((permission) => permission.startsWith('certificate'));
      break;
    case 'none':
      permissions = [];
      break;
    case 'all':
      permissions = [...EVENT_MANAGER_PERMISSION_CATALOG];
      break;
  }
  const limited = permissions.slice(0, Math.max(0, Math.min(permissions.length, Math.round(args.permissionCount))));
  return args.reverseOrder ? limited.reverse() : limited;
}

const meta: Meta<PermissionsPageStoryArgs> = {
  component: PermissionsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Permissions/Workspace Permissions Tab',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    preset: { control: 'select', options: ['all', 'read-only', 'events', 'certificates', 'none'] },
    permissionCount: {
      control: { type: 'range', min: 0, max: EVENT_MANAGER_PERMISSION_CATALOG.length, step: 1 },
    },
    reverseOrder: { control: 'boolean' },
  },
  render: (args) => {
    rawPermissions.set(selectPermissions({ ...defaultArgs, ...args }));
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: PermissionsService,
          useValue: { rawPermissions },
        },
      ],
    }),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<PermissionsPageStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findAllByRole('button')).length).toBeGreaterThan(10);
    await userEvent.click(canvas.getByText('Permissões brutas'));
    await expect(await canvas.findByText(EVENT_MANAGER_PERMISSION_CATALOG[0])).toBeVisible();
    await expect(
      await canvas.findByText(EVENT_MANAGER_PERMISSION_CATALOG[EVENT_MANAGER_PERMISSION_CATALOG.length - 1]),
    ).toBeVisible();
  },
};

export const ReadOnly: Story = {
  args: { preset: 'read-only', permissionCount: EVENT_MANAGER_PERMISSION_CATALOG.length },
};

export const EventManagement: Story = {
  args: { preset: 'events', permissionCount: EVENT_MANAGER_PERMISSION_CATALOG.length },
};

export const CertificateManagement: Story = {
  args: { preset: 'certificates', permissionCount: EVENT_MANAGER_PERMISSION_CATALOG.length },
};

export const Empty: Story = {
  args: { preset: 'none', permissionCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhuma permissão encontrada')).toBeVisible();
  },
};

export const LimitedPermissionSet: Story = {
  args: { preset: 'all', permissionCount: 8, reverseOrder: true },
};

export const CompactDark: Story = {
  args: { preset: 'all', permissionCount: 24 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
