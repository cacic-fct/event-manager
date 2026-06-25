import { provideHttpClient } from '@angular/common/http';
import { LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspacePublicationTabComponent } from './workspace-publishing-tab.component';
import {
  PublicationStoryArgs,
  applyStoryBulkOperation,
  applyStoryPublicationState,
  buildPublicationWorkspace,
  defaultPublicationStoryArgs,
  publicationActionResult,
} from './workspace-publishing-story-support';

let activeArgs: PublicationStoryArgs;
let activeWorkspace = buildPublicationWorkspace(defaultPublicationStoryArgs);

const meta: Meta<PublicationStoryArgs> = {
  component: WorkspacePublicationTabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Publicação',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [provideHttpClient(), provideRouter([]), { provide: LOCALE_ID, useValue: 'pt-BR' }],
    }),
  ],
  args: defaultPublicationStoryArgs,
  argTypes: {
    state: {
      control: 'select',
      options: ['loaded', 'empty', 'loading', 'error'],
    },
    majorEvents: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    standaloneGroups: { control: { type: 'range', min: 0, max: 3, step: 1 } },
    standaloneEvents: { control: { type: 'range', min: 0, max: 5, step: 1 } },
    includeHiddenEvents: { control: 'boolean' },
    includeCriticalWarnings: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = args;
    activeWorkspace = buildPublicationWorkspace(args);
    return { props: {} };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as { query?: string; variables?: { input?: unknown } };
          const args = activeArgs ?? defaultPublicationStoryArgs;
          if (args.state === 'loading') {
            await delay('infinite');
          }

          if (args.state === 'error') {
            return HttpResponse.json({
              errors: [{ message: 'Falha simulada ao carregar publicação.' }],
            });
          }

          if (body.query?.includes('publicContentWorkspace')) {
            return HttpResponse.json({
              data: {
                publicContentWorkspace: activeWorkspace,
              },
            });
          }

          if (body.query?.includes('createPublicContentPreview')) {
            return HttpResponse.json({
              data: {
                createPublicContentPreview: {
                  url: 'https://eventos.cacic.dev.br/preview/storybook/event',
                  directPublicUrl: false,
                  expiresAt: new Date('2026-08-01T13:00:00.000Z').toISOString(),
                  message: 'Link temporário criado. Ele expira em 1 hora.',
                },
              },
            });
          }

          if (body.query?.includes('setPublicationState')) {
            return HttpResponse.json({
              data: {
                setPublicationState: applyStoryPublicationState(activeWorkspace, body.variables?.input),
              },
            });
          }

          if (body.query?.includes('runPublicationBulkOperation')) {
            return HttpResponse.json({
              data: {
                runPublicationBulkOperation: applyStoryBulkOperation(activeWorkspace, body.variables?.input),
              },
            });
          }

          return HttpResponse.json({
            data: {
              setPublicationState: publicationActionResult(),
              runPublicationBulkOperation: publicationActionResult(),
            },
          });
        }),
      ],
    },
  },
};

export default meta;

type Story = StoryObj<PublicationStoryArgs>;

export const Playground: Story = {
  globals: { theme: 'light' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Publicação')).toBeVisible();
    await expect(await canvas.findByText('Itens publicáveis')).toBeVisible();
    const buttons = await canvas.findAllByRole('button');
    await userEvent.hover(buttons[0]);
  },
};

export const Empty: Story = {
  args: {
    state: 'empty',
    majorEvents: 0,
    standaloneGroups: 0,
    standaloneEvents: 0,
    includeCriticalWarnings: false,
    includeHiddenEvents: false,
  },
  globals: { theme: 'light' },
};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
  globals: { theme: 'light' },
};

export const ErrorState: Story = {
  args: {
    state: 'error',
  },
  globals: { theme: 'light' },
};
