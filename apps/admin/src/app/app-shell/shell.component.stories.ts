import { signal } from '@angular/core';
import { provideRouter, withDisabledInitialNavigation } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PermissionsService } from '../permissions/permissions.service';
import { ShellService } from './shell.service';
import { AdminShellComponent, NavigationMode } from './shell.component';
import { NavigationLinkId } from './navigation';

type WorkspaceLayoutStoryArgs = {
  navMode: NavigationMode;
  activeUrl: string;
  loading: boolean;
  showMissingPermissions: boolean;
  missingPermissionTab: NavigationLinkId;
  userEmail: string;
};

const storyUser = signal({
  sub: 'storybook-admin',
  email: 'admin@example.com',
  roles: ['admin'],
  scopes: [],
  claims: {
    name: 'Storybook Admin',
  },
});
const storyRoles = signal<string[]>(['admin']);
const shellLoading = signal(false);

let activeArgs: WorkspaceLayoutStoryArgs;

const defaultArgs: WorkspaceLayoutStoryArgs = {
  navMode: 'auto',
  activeUrl: '/events',
  loading: false,
  showMissingPermissions: false,
  missingPermissionTab: 'subscriptions',
  userEmail: 'admin@example.com',
};

const meta: Meta<WorkspaceLayoutStoryArgs> = {
  component: AdminShellComponent,
  title: 'CACiC Eventos/Workspace/Workspace Layout',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([], withDisabledInitialNavigation()),
        {
          provide: AuthService,
          useValue: {
            user: storyUser,
            roles: storyRoles,
            logout: async () => undefined,
          },
        },
        {
          provide: ShellService,
          useValue: {
            loading: shellLoading,
            loadInitialData: async () => undefined,
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            missingReadForTab: (tab: NavigationLinkId) =>
              activeArgs?.showMissingPermissions && tab === activeArgs.missingPermissionTab
                ? ['event#read', 'subscription#read']
                : [],
          },
        },
      ],
    }),
  ],
  args: defaultArgs,
  argTypes: {
    navMode: {
      control: 'select',
      options: ['icons', 'full', 'auto'],
    },
    activeUrl: {
      control: 'select',
      options: ['/', '/events', '/subscriptions', '/attendances', '/global-operations'],
    },
    loading: { control: 'boolean' },
    showMissingPermissions: { control: 'boolean' },
    missingPermissionTab: {
      control: 'select',
      options: ['events', 'subscriptions', 'attendances', 'global-operations', 'permissions'],
    },
    userEmail: { control: 'text' },
  },
  render: (args) => {
    activeArgs = args;
    shellLoading.set(args.loading);
    storyRoles.set(['admin']);
    storyUser.set({
      sub: 'storybook-admin',
      email: args.userEmail,
      roles: storyRoles(),
      scopes: [],
      claims: {
        name: 'Storybook Admin',
      },
    });

    return {
      props: {
        initialNavMode: args.navMode,
        activeUrlOverride: args.activeUrl,
      },
    };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    viewport: {
      defaultViewport: 'desktop',
    },
  },
};

export default meta;

type Story = StoryObj<WorkspaceLayoutStoryArgs>;

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(await canvas.findByRole('navigation', { name: /navegação interna/i })).toBeVisible();
  await userEvent.hover(await canvas.findByLabelText('Eventos'));
  await userEvent.click(await canvas.findByRole('button', { name: /navegação automática/i }));
};

export const AutoMode: Story = {
  play: async ({ canvasElement }) => {
    await exerciseStory(canvasElement);
  },
};

export const AutoModeCollapsedRail: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const subscriptionsLink = await canvas.findByLabelText('Inscrições');
    const icon = subscriptionsLink.querySelector('mat-icon');

    expect(icon).toBeTruthy();

    const linkRect = subscriptionsLink.getBoundingClientRect();
    const iconRect = icon?.getBoundingClientRect();
    const iconCenterX = (iconRect?.left ?? 0) + (iconRect?.width ?? 0) / 2;
    const iconCenterY = (iconRect?.top ?? 0) + (iconRect?.height ?? 0) / 2;

    expect(linkRect.width).toBeGreaterThanOrEqual(44);
    expect(linkRect.height).toBeGreaterThanOrEqual(44);
    expect(iconRect?.left ?? 0).toBeGreaterThanOrEqual(linkRect.left);
    expect(iconRect?.right ?? 0).toBeLessThanOrEqual(linkRect.right);

    await userEvent.hover(icon as Element);

    const hoveredElement = canvasElement.ownerDocument.elementFromPoint(iconCenterX, iconCenterY);

    expect(hoveredElement?.closest('.nav-item')).toBe(subscriptionsLink);
  },
};

export const FullModeWithPermissionWarnings: Story = {
  args: {
    navMode: 'full',
    activeUrl: '/subscriptions',
    showMissingPermissions: true,
    missingPermissionTab: 'subscriptions',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Inscrições')).toBeVisible();
    await expect(await canvas.findByText('Permissões ausentes nesta seção')).toBeVisible();
  },
};

export const IconsOnlyLoading: Story = {
  args: {
    navMode: 'icons',
    loading: true,
    activeUrl: '/global-operations',
  },
};
