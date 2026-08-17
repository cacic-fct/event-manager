import type { Meta, StoryObj } from '@storybook/angular';
import { MajorEventsPageComponent } from './major-events-page.component';
import {
  defaultPageStoryArgs,
  exercisePageStory,
  pageStoryArgTypes,
  withPageStoryProviders,
  type PageStoryArgs,
} from '../stories/page-story-support';

const meta: Meta<PageStoryArgs> = {
  component: MajorEventsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Major Events/Workspace Major Events Tab',
  tags: ['autodocs'],
  args: defaultPageStoryArgs,
  argTypes: pageStoryArgTypes,
  decorators: [withPageStoryProviders],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<PageStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const ScheduledPaymentEvent: Story = {
  args: {
    mode: 'populated',
    selectedIndex: 1,
    publicationState: 'SCHEDULED',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const DenseMixedCatalog: Story = {
  args: { itemCount: 30, requiresPayment: true, sportsEvery: 2 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const FreeCatalog: Story = {
  args: { itemCount: 12, requiresPayment: false, sportsEvery: 0 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const Loading: Story = {
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const FrozenSportsTournament: Story = {
  args: { frozenSelected: true, sportsEvery: 1, selectedIndex: 2 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const LongContentTablet: Story = {
  args: { longContent: true, itemCount: 12 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const EmptyReadonly: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    mode: 'readonly',
    itemCount: 0,
    selectedIndex: 0,
    publicationState: 'DRAFT',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};
