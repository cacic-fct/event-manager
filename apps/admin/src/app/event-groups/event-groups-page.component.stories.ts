import type { Meta, StoryObj } from '@storybook/angular';
import { EventGroupsPageComponent } from './event-groups-page.component';
import {
  defaultPageStoryArgs,
  exercisePageStory,
  withPageStoryProviders,
  type PageStoryArgs,
} from '../stories/page-story-support';

const meta: Meta<PageStoryArgs> = {
  component: EventGroupsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Event Groups/Workspace Event Groups Tab',
  tags: ['autodocs'],
  args: defaultPageStoryArgs,
  argTypes: {
    mode: {
      control: 'select',
      options: ['populated', 'empty', 'readonly', 'loading', 'drafts'],
    },
    itemCount: { control: { type: 'range', min: 0, max: 8, step: 1 } },
    selectedIndex: { control: { type: 'range', min: 0, max: 7, step: 1 } },
    publicationState: {
      control: 'select',
      options: ['DRAFT', 'PUBLISHED', 'SCHEDULED', 'UNPUBLISHED'],
    },
  },
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

export const CertificateRules: Story = {
  args: {
    mode: 'populated',
    selectedIndex: 2,
    publicationState: 'PUBLISHED',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const EmptyReadonly: Story = {
  args: {
    mode: 'readonly',
    itemCount: 0,
    selectedIndex: 0,
    publicationState: 'DRAFT',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};
