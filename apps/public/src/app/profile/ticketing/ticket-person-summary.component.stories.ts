import { type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TicketPersonSummaryComponent } from './ticket-person-summary.component';

type TicketPersonSummaryStoryArgs = {
  fullName: string;
  avatarUrl: string | null;
  identityDocument: string | null;
};

const meta: Meta<TicketPersonSummaryStoryArgs> = {
  component: TicketPersonSummaryComponent,
  title: 'Public/Ticketing/Tickets/Person',
  tags: ['autodocs', 'ticketing'],
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  args: {
    fullName: 'Marina da Silva',
    avatarUrl: null,
    identityDocument: '•••.982.247-••',
  },
  argTypes: {
    fullName: { control: 'text' },
    avatarUrl: { control: 'text' },
    identityDocument: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<TicketPersonSummaryStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Marina da Silva')).toBeVisible();
    await expect(canvas.getByText('•••.982.247-••')).toBeVisible();
  },
};

export const Cpf: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Marina da Silva')).toBeVisible();
    await expect(canvas.getByText('•••.982.247-••')).toBeVisible();
    await expect(canvas.getByText('MS')).toBeVisible();
  },
};

export const Passport: Story = {
  args: { fullName: 'Alex Morgan', identityDocument: 'XK1234567' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('XK1234567')).toBeVisible();
  },
};

export const MissingAvatar: Story = {
  args: { fullName: 'João Pedro', avatarUrl: null, identityDocument: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('JP')).toBeVisible();
    await expect(within(canvasElement).getByText('Documento não informado')).toBeVisible();
  },
};
