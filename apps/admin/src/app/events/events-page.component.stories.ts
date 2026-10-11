import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { EventsPageComponent } from './events-page.component';
import {
  defaultPageStoryArgs,
  exercisePageStory,
  pageStoryArgTypes,
  withPageStoryProviders,
  type PageStoryArgs,
} from '../stories/page-story-support';

const meta: Meta<PageStoryArgs> = {
  component: EventsPageComponent,
  title: 'Admin/Event Management/Events',
  tags: ['autodocs'],
  args: defaultPageStoryArgs,
  argTypes: pageStoryArgTypes,
  decorators: [withPageStoryProviders],
  parameters: {
    docs: {
      description: {
        component: 'Standalone event catalog with controls for publication, density, and selection. Stories cover drafts, loading, frozen events, and audience settings.',
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

export const WithDrafts: Story = {
  args: {
    mode: 'drafts',
    publicationState: 'PUBLISHED',
  },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const DenseMixedEvents: Story = {
  args: { itemCount: 30, sportsEvery: 2, coordinates: true, certificateMode: 'mixed' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const Loading: Story = {
  args: { mode: 'loading' },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const FrozenSportsEvent: Story = {
  args: { frozenSelected: true, sportsEvery: 1, selectedIndex: 2 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const LongContent: Story = {
  args: { longContent: true, itemCount: 12 },
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

export const SwagKitAttendance: Story = {
  args: { restrictAttendancePriceTiers: true, sportsEvery: 0 },
  play: async ({ canvasElement }) => exercisePageStory(canvasElement),
};

export const InterestAndEligibility: Story = {
  args: { selectedIndex: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Permitir manifestação de interesse')).toBeVisible();
    await expect(canvas.getByText('Qualquer participante')).toBeVisible();
    await expect(canvas.getByText('Emitir para presentes não pagantes')).toBeVisible();
    await expect(canvas.getByText('Emitir para presentes não inscritos')).toBeVisible();
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

export const OnlineAttendanceControls: Story = {
  args: { sportsEvery: 0, selectedIndex: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const online = canvas.getByRole('checkbox', { name: 'Presença on-line' });
    if ((online as HTMLInputElement).checked) await userEvent.click(online);
    await expect(canvas.queryByLabelText('Código da presença on-line')).not.toBeInTheDocument();
    await userEvent.click(online);
    const code = canvas.getByLabelText('Código da presença on-line');
    await userEvent.clear(code);
    await userEvent.type(code, 'EVENTO');
    await userEvent.click(online);
    await userEvent.click(online);
    await expect(canvas.getByLabelText('Código da presença on-line')).toHaveValue('EVENTO');
  },
};

export const ReadonlyLinkedPeople: Story = {
  args: { mode: 'readonly', itemCount: 4 },
  play: async ({ canvasElement }) => {
    const linkedPeople = canvasElement.querySelectorAll('.linked-person');
    await expect(linkedPeople).toHaveLength(2);
    for (const person of linkedPeople) await expect(person).toBeVisible();
    await expect(within(canvasElement).queryByRole('button', { name: 'Editar evento' })).not.toBeInTheDocument();
  },
};
