import type { Meta, StoryObj } from '@storybook/angular';
import { WorkspaceEventsTabComponent } from './workspace-events-tab.component';
import {
  defaultWorkspaceTabStoryArgs,
  exerciseWorkspaceTabStory,
  withWorkspaceTabStoryProviders,
  type WorkspaceTabStoryArgs,
} from '../workspace-tab-story-support';

const meta: Meta<WorkspaceTabStoryArgs> = {
  component: WorkspaceEventsTabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Events/Workspace Events Tab',
  tags: ['autodocs'],
  args: defaultWorkspaceTabStoryArgs,
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
  decorators: [withWorkspaceTabStoryProviders],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceTabStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseWorkspaceTabStory(canvasElement),
};

export const WithDrafts: Story = {
  args: {
    mode: 'drafts',
    publicationState: 'PUBLISHED',
  },
  play: async ({ canvasElement }) => exerciseWorkspaceTabStory(canvasElement),
};

export const EmptyReadonly: Story = {
  args: {
    mode: 'readonly',
    itemCount: 0,
    selectedIndex: 0,
    publicationState: 'DRAFT',
  },
  play: async ({ canvasElement }) => exerciseWorkspaceTabStory(canvasElement),
};
