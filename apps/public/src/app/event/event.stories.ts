import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { createStoryPublicEvent, publicStoryFixtureDate } from '@cacic-fct/event-manager-public-testing';
import { HttpResponse, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { Event } from './event';

interface EventStoryArgs {
  allowSubscription: boolean;
  includeMajorEvent: boolean;
}

const defaultArgs: EventStoryArgs = {
  allowSubscription: true,
  includeMajorEvent: true,
};

interface EventStoryContext {
  args: EventStoryArgs;
}

const previewRoute = {
  paramMap: of(convertToParamMap({ previewToken: 'storybook-event-preview' })),
  queryParamMap: of(convertToParamMap({ returnUrl: '/menu' })),
  snapshot: {
    paramMap: convertToParamMap({ previewToken: 'storybook-event-preview' }),
    queryParamMap: convertToParamMap({ returnUrl: '/menu' }),
  },
};

const meta: Meta<EventStoryArgs> = {
  component: Event,
  title: 'Public/Event/Event',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    allowSubscription: { control: 'boolean' },
    includeMajorEvent: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<EventStoryArgs>;

const previewContext = createStoryContext();

const exerciseStory = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.tab();
  const buttons = canvas.queryAllByRole('button');
  const enabledButton = buttons.find((button) => !button.hasAttribute('disabled') && button.getAttribute('aria-disabled') !== 'true');
  if (enabledButton) {
    await userEvent.hover(enabledButton);
    await expect(enabledButton).toBeVisible();
  }
  const links = canvas.queryAllByRole('link');
  if (links[0]) {
    await expect(links[0]).toBeVisible();
  }
};

export const Online: Story = {
  args: {},
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const OfflineFallback: Story = {
  args: {},
  globals: { theme: 'light', network: 'offline' },
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const PreviewLink: Story = {
  args: defaultArgs,
  globals: { theme: 'light', network: 'online' },
  render: (args) => renderStory(args, previewContext),
  decorators: [
    applicationConfig({
      providers: [{ provide: ActivatedRoute, useValue: previewRoute }],
    }),
  ],
  parameters: previewParameters(previewContext),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Pré-Visualização')).toBeVisible();
    await expect(await canvas.findByText(/Pré-visualização temporária/)).toBeVisible();
  },
};

function createStoryContext(args: Partial<EventStoryArgs> = {}): EventStoryContext {
  return {
    args: { ...defaultArgs, ...args },
  };
}

function renderStory(args: EventStoryArgs, context: EventStoryContext) {
  context.args = { ...defaultArgs, ...args };
  return { props: {} };
}

function previewParameters(context: EventStoryContext) {
  return {
    msw: {
      handlers: [
        http.post('/api/graphql', () =>
          HttpResponse.json({
            data: {
              publicContentPreview: buildPreview(context.args),
            },
          }),
        ),
      ],
    },
  };
}

function buildPreview(args: EventStoryArgs) {
  const event = buildEvent(args);
  return {
    previewAt: publicStoryFixtureDate,
    expiresAt: '2026-08-01T13:00:00.000Z',
    event,
  };
}

function buildEvent(args: EventStoryArgs) {
  return createStoryPublicEvent(1, {
    includeMajorEvent: args.includeMajorEvent,
    includeEventGroup: false,
    allowSubscription: args.allowSubscription,
  });
}
