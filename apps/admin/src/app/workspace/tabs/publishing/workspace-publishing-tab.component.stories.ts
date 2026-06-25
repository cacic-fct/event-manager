import { provideHttpClient } from '@angular/common/http';
import { LOCALE_ID } from '@angular/core';
import { provideRouter } from '@angular/router';
import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PublicContentWorkspace } from '../../../graphql/publishing-api.service';
import { WorkspacePublicationTabComponent } from './workspace-publishing-tab.component';
import {
  PublicationStoryArgs,
  applyStoryBulkOperation,
  applyStoryPublicationState,
  buildPublicationWorkspace,
  defaultPublicationStoryArgs,
} from './workspace-publishing-story-support';

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
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<PublicationStoryArgs>;

const playgroundContext = createStoryContext();
const emptyContext = createStoryContext({
  state: 'empty',
  majorEvents: 0,
  standaloneGroups: 0,
  standaloneEvents: 0,
  includeCriticalWarnings: false,
  includeHiddenEvents: false,
});
const loadingContext = createStoryContext({ state: 'loading' });
const errorContext = createStoryContext({ state: 'error' });

export const Playground: Story = {
  globals: { theme: 'light' },
  parameters: storyParameters(playgroundContext),
  render: (args) => renderStory(args, playgroundContext),
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
  parameters: storyParameters(emptyContext),
  render: (args) => renderStory(args, emptyContext),
};

export const Loading: Story = {
  args: {
    state: 'loading',
  },
  globals: { theme: 'light' },
  parameters: storyParameters(loadingContext),
  render: (args) => renderStory(args, loadingContext),
};

export const ErrorState: Story = {
  args: {
    state: 'error',
  },
  globals: { theme: 'light' },
  parameters: storyParameters(errorContext),
  render: (args) => renderStory(args, errorContext),
};

interface PublicationStoryContext {
  args: PublicationStoryArgs;
  workspace: PublicContentWorkspace;
}

function createStoryContext(args: Partial<PublicationStoryArgs> = {}): PublicationStoryContext {
  const storyArgs = { ...defaultPublicationStoryArgs, ...args };
  return {
    args: storyArgs,
    workspace: buildPublicationWorkspace(storyArgs),
  };
}

function renderStory(args: PublicationStoryArgs, context: PublicationStoryContext) {
  context.args = { ...defaultPublicationStoryArgs, ...args };
  context.workspace = buildPublicationWorkspace(context.args);

  return { props: {} };
}

function storyParameters(context: PublicationStoryContext) {
  return {
    msw: {
      handlers: [createGraphqlHandler(context)],
    },
  };
}

function createGraphqlHandler(context: PublicationStoryContext) {
  return http.post('/api/graphql', async ({ request }) => {
    const body = (await request.json()) as { query?: string; variables?: { input?: unknown } };
    if (context.args.state === 'loading') {
      await delay('infinite');
    }

    if (context.args.state === 'error') {
      return HttpResponse.json({
        errors: [{ message: 'Falha simulada ao carregar publicação.' }],
      });
    }

    if (body.query?.includes('publicContentWorkspace')) {
      return HttpResponse.json({
        data: {
          publicContentWorkspace: context.workspace,
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
          setPublicationState: applyStoryPublicationState(context.workspace, body.variables?.input),
        },
      });
    }

    if (body.query?.includes('runPublicationBulkOperation')) {
      return HttpResponse.json({
        data: {
          runPublicationBulkOperation: applyStoryBulkOperation(context.workspace, body.variables?.input),
        },
      });
    }

    return HttpResponse.json(
      {
        errors: [{ message: 'Operação GraphQL não simulada nesta história.' }],
      },
      { status: 500 },
    );
  });
}
