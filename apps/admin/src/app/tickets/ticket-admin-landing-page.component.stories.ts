import { inject, provideAppInitializer } from '@angular/core';
import { Router } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { of, throwError } from 'rxjs';
import type { AdminEventContextPageOptions } from '@cacic-fct/event-manager-admin-contracts';
import { AdminEventContextApiService } from '../graphql/admin-event-context-api.service';
import { EventApiService } from '../graphql/event-api.service';
import { EventGroupApiService } from '../graphql/event-group-api.service';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  contextStoryEvent,
  contextStoryGroup,
  contextStoryMajor,
  contextStoryPage,
} from '../shared/event-context-story.fixtures';
import { TicketAdminLandingPageComponent } from './ticket-admin-landing-page.component';

interface TicketLandingStoryArgs {
  pageState: 'ready' | 'empty' | 'error';
  longNames: boolean;
}

let activeArgs: TicketLandingStoryArgs = { pageState: 'ready', longNames: false };
let navigate: ReturnType<typeof fn>;

const meta: Meta<TicketLandingStoryArgs> = {
  component: TicketAdminLandingPageComponent,
  title: 'CACiC Eventos/Workspace/Tickets/Ticket Admin Landing',
  tags: ['autodocs', 'ticketing'],
  args: { pageState: 'ready', longNames: false },
  argTypes: {
    pageState: { control: 'inline-radio', options: ['ready', 'empty', 'error'] },
    longNames: { control: 'boolean' },
  },
  decorators: [
    (story, context) => {
      activeArgs = context.args;
      navigate = fn();
      return applicationConfig({
        providers: [
          {
            provide: AdminEventContextApiService,
            useValue: {
              listPage: (options: AdminEventContextPageOptions) => activeArgs.pageState === 'error'
                ? throwError(() => new Error('Não foi possível carregar os contextos.'))
                : of(contextStoryPage(options, { empty: activeArgs.pageState === 'empty', longNames: activeArgs.longNames })),
            },
          },
          { provide: EventApiService, useValue: { getEvent: () => of(contextStoryEvent) } },
          { provide: EventGroupApiService, useValue: { getEventGroup: () => of(contextStoryGroup) } },
          { provide: MajorEventApiService, useValue: { getMajorEvent: () => of(contextStoryMajor) } },
          { provide: PermissionsService, useValue: { has: () => true, evaluateWorkspacePermissions: async () => undefined } },
          provideAppInitializer(() => {
            const router = inject(Router);
            router.navigate = async (commands) => {
              navigate(commands);
              return true;
            };
          }),
        ],
      })(story, context);
    },
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<TicketLandingStoryArgs>;

export const Playground: Story = {};

export const ChooseEvent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Selecionar evento' })).toBeVisible();
    await userEvent.click(await canvas.findByRole('button', { name: 'Expandir Semana da Computação' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Selecionar Oficina de acessibilidade' }));
    expect(navigate).toHaveBeenCalledWith(['/tickets', 'event', 'event-1']);
  },
};

export const NoEventsFound: Story = {
  args: { pageState: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum contexto encontrado. Revise a busca ou volte à página anterior.')).toBeVisible();
  },
};

export const ContextSearchError: Story = {
  args: { pageState: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  },
};

export const LongNamesOnMobile: Story = {
  args: { longNames: true },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};
