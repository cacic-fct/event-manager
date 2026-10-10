import { Component, computed, signal } from '@angular/core';
import { of } from 'rxjs';
import { EventWorkspaceContextService, contextOperations, contextOperationGroups, type EventWorkspaceContext, type EventWorkspaceRef } from '../event-workspace/event-workspace-context.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { createAdminEvent, createAdminEventGroup, createAdminMajorEvent } from '../testing/admin-entity-fixtures';
import { provideRouter, withHashLocation, withDisabledInitialNavigation } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular/auth';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PermissionsService } from '../permissions/permissions.service';
import { ShellService } from './admin-shell.service';
import { AdminShellComponent, NavigationMode } from './admin-shell.component';
import { NavigationLinkId } from './navigation';
import { RequestActivityService } from '../feedback/request-activity.service';

type WorkspaceLayoutStoryArgs = {
  navMode: NavigationMode;
  activeUrl: string;
  loading: boolean;
  showMissingPermissions: boolean;
  missingPermissionTab: NavigationLinkId;
  userEmail: string;
};

@Component({ template: '' })
class ShellStoryRoute {}
const shellContext = signal<EventWorkspaceContext | null>(null);
const contextService = {
  context: shellContext,
  loading: signal(false), error: signal(''), scopeSwitchBlocked: signal(false),
  operations: computed(() => { const context = shellContext(); return context ? contextOperations(context) : []; }),
  operationGroups: computed(() => { const context = shellContext(); return context ? contextOperationGroups(contextOperations(context)) : []; }),
  load: async (ref: EventWorkspaceRef | null) => {
    shellContext.set(ref ? { ...ref, name: ref.kind === 'event' ? 'Oficina de acessibilidade' : 'Semana da Computação', emoji: ref.kind === 'event' ? '♿' : '🎓' } : null);
  },
  canReadActivities: () => true,
} satisfies Pick<EventWorkspaceContextService, 'context' | 'loading' | 'error' | 'operations' | 'operationGroups' | 'load' | 'canReadActivities' | 'scopeSwitchBlocked'>;

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
  navMode: 'full',
  activeUrl: '/event-workspace',
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
        provideRouter([{ path: '**', component: ShellStoryRoute }], withHashLocation(), withDisabledInitialNavigation()),
        { provide: EventWorkspaceContextService, useValue: contextService },
        { provide: EventApiService, useValue: { listEvents: () => of([createAdminEvent({name:'Oficina de acessibilidade',emoji:'♿'})]), getEvent: () => of(createAdminEvent({name:'Oficina de acessibilidade',emoji:'♿'})) } },
        { provide: MajorEventApiService, useValue: { listMajorEvents: () => of([createAdminMajorEvent({name:'Semana da Computação',emoji:'🎓'})]), getMajorEvent: () => of(createAdminMajorEvent({name:'Semana da Computação',emoji:'🎓'})) } },
        { provide: EventGroupApiService, useValue: { listEventGroups: () => of([createAdminEventGroup()]), getEventGroup: () => of(createAdminEventGroup()) } },
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
          provide: RequestActivityService,
          useValue: {
            loading: shellLoading,
          },
        },
        {
          provide: PermissionsService,
          useValue: {
            evaluateWorkspacePermissions: async () => undefined,
            has: () => true,
            canReadTab: () => true,
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
      options: ['/', '/event-workspace', '/subscriptions/event/event-1', '/attendances/major-event/major-event-1', '/global-operations'],
    },
    loading: { control: 'boolean' },
    showMissingPermissions: { control: 'boolean' },
    missingPermissionTab: {
      control: 'select',
      options: ['events', 'forms', 'subscriptions', 'attendances', 'global-operations', 'permissions'],
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
  await userEvent.click(await canvas.findByRole('button', { name: /navegação completa/i }));
};

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await exerciseStory(canvasElement);
  },
};

export const AutoModeCollapsedRail: Story = {
  args: { navMode: 'auto' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const subscriptionsLink = await canvas.findByLabelText('Eventos');
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

export const AutoModeContextAnchor: Story = {
  args: {
    navMode: 'auto',
    activeUrl: '/subscriptions/event/event-1',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const selector = await canvas.findByRole('button', { name: /trocar contexto/i });
    const emoji = selector.querySelector('lib-twemoji');

    expect(emoji).toBeTruthy();

    const collapsedLeft = emoji?.getBoundingClientRect().left ?? 0;
    await userEvent.hover(selector);
    const expandedLeft = emoji?.getBoundingClientRect().left ?? 0;

    expect(expandedLeft).toBeCloseTo(collapsedLeft, 1);
  },
};

export const FullModeWithPermissionWarnings: Story = {
  args: {
    navMode: 'full',
    activeUrl: '/places',
    showMissingPermissions: true,
    missingPermissionTab: 'places',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('link', {name:'Locais'})).toBeVisible();
    await expect(await canvas.findByText('Permissões ausentes nesta seção')).toBeVisible();
  },
};

export const IconsOnlyLoading: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    navMode: 'icons',
    loading: true,
    activeUrl: '/global-operations',
  },
};

export const KeyboardWayfinding: Story = {
  args: { navMode: 'full', activeUrl: '/people' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('link', { name: 'Pessoas' })).toHaveAttribute('aria-current', 'page');
    await expect(canvas.getByRole('link', { name: 'Pessoas duplicadas' })).toBeVisible();
    const skip = canvas.getByRole('button', { name: 'Pular para o conteúdo' });
    skip.focus();
    await userEvent.keyboard('{Enter}');
    await expect(canvas.getByRole('main')).toHaveFocus();
  },
};

export const ScopedEventOperations: Story = {
  args: { activeUrl: '/subscriptions/event/event-1', navMode: 'full' },
  play: async ({canvasElement}) => {
    const canvas=within(canvasElement);
    const operations=within(await canvas.findByRole('navigation',{name:'Operações do evento'}));
    await expect(operations.getByRole('link',{name:'Inscrições'})).toHaveAttribute('aria-current','page');
    await expect(operations.getByRole('link',{name:'Presenças'})).toHaveAttribute('href','#/attendances/event/event-1');
    await expect(operations.queryByRole('link',{name:'Visão geral'})).not.toBeInTheDocument();
    await expect(canvas.queryByRole('tablist',{name:'Operações do evento'})).not.toBeInTheDocument();
    await userEvent.click(operations.getByRole('button',{name:'Menu global'}));
    const global=within(await canvas.findByRole('navigation',{name:'Navegação interna'}));
    await expect(global.getByRole('link',{name:'Eventos'})).toHaveAttribute('href','#/event-workspace');
    await expect(global.getByRole('link', { name: 'Eventos' })).toBeVisible();
    for (const label of ['Inscrições', 'Presenças', 'Formulários', 'Sorteios', 'Publicação', 'Esportes']) {
      await expect(global.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
    await userEvent.click(global.getByRole('button',{name:'Menu do contexto'}));
    await expect(await canvas.findByRole('navigation',{name:'Operações do evento'})).toBeVisible();
  },
};

export const ReceiptValidationTitle: Story = {
  args: { activeUrl: '/subscriptions/major-event/major-event-1/validate-receipts' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Validação de comprovantes', level: 1 })).toBeVisible();
    await expect(canvas.queryByRole('heading', { name: 'Inscrições' })).not.toBeInTheDocument();
  },
};
