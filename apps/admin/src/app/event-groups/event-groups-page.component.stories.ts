import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
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
  title: 'Admin/Event Management/Event Groups',
  tags: ['autodocs'],
  args: defaultPageStoryArgs,
  argTypes: pageStoryArgTypes,
  decorators: [withPageStoryProviders],
  parameters: {
    docs: {
      description: {
        component: 'Event group catalog with controls for group density, selection, and publication state.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
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
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await exercisePageStory(canvasElement);
    await expect(canvas.getByText('Emitir para presentes não pagantes')).toBeVisible();
    await expect(canvas.getByText('Emitir para presentes não inscritos')).toBeVisible();
  },
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

export const LongContent: Story = {
  args: { longContent: true, itemCount: 12, certificateMode: 'all' },
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

export const InterestAndEligibility: Story = {
  args: { selectedIndex: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Permitir manifestação de interesse')).toBeVisible();
    await expect(canvas.getByText('Qualquer participante')).toBeVisible();
  },
};

export const CourseAudience: Story = {
  args: { selectedIndex: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Curso permitido')).toBeVisible();
    await expect(canvas.getAllByText(/matrícula confirmada no Account Manager/i)[0]).toBeVisible();
  },
};

export const InvitationAudience: Story = {
  args: { selectedIndex: 3 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Pessoas convidadas')).toBeVisible();
    await expect(canvas.getByText('Pessoa convidada 4')).toBeVisible();
  },
};

export const CertificateDisclosure: Story = {
  args: { certificateMode: 'none', sportsEvery: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('checkbox', { name: 'Permitir certificado parcial' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('checkbox', { name: 'Emitir certificado' }));
    await expect(canvas.getByRole('checkbox', { name: 'Permitir certificado parcial' })).toBeInTheDocument();
    await expect(canvas.getByText('Permitir certificado parcial')).toBeVisible();
    await expect(canvas.getByRole('checkbox', { name: 'Um certificado por evento' })).toBeInTheDocument();
    await expect(canvas.getByText('Um certificado por evento')).toBeVisible();
  },
};
