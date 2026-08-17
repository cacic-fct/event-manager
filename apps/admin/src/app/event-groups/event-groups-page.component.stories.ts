import type { Meta, StoryObj } from '@storybook/angular';
import { EventGroupsPageComponent } from './event-groups-page.component';
import {
  defaultPageStoryArgs,
  exercisePageStory,
  pageStoryArgTypes,
  withPageStoryProviders,
  type PageStoryArgs,
} from '../stories/page-story-support';

const meta: Meta<PageStoryArgs> = {
  component: EventGroupsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Event Groups/Workspace Event Groups Tab',
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

export const CertificateRules: Story = {
  args: {
    mode: 'populated',
    selectedIndex: 2,
    publicationState: 'PUBLISHED',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const DenseCertificateMatrix: Story = {
  args: { itemCount: 30, certificateMode: 'mixed', sportsEvery: 2 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const AllCertificates: Story = {
  args: { itemCount: 10, certificateMode: 'all' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const Loading: Story = {
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const LongContentTablet: Story = {
  args: { longContent: true, itemCount: 12, certificateMode: 'all' },
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
