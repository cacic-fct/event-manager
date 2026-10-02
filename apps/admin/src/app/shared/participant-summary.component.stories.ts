import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { ParticipantSummaryComponent } from './participant-summary.component';

const meta: Meta<ParticipantSummaryComponent> = {
  title: 'CACiC Eventos/Workspace/Shared/Participant Summary',
  component: ParticipantSummaryComponent,
  tags: ['autodocs'],
  argTypes: {
    showName: { control: 'boolean' },
    maskIdentityDocument: { control: 'boolean' },
  },
  parameters: { a11y: { test: 'error' } },
  args: {
    person: {
      id: 'person-1',
      name: 'Ana Carolina de Oliveira Silva',
      email: 'ana.silva@unesp.br',
      phone: '18999999999',
      identityDocument: '12345678901',
      academicId: '202612345',
      user: {
        id: 'user-1',
        name: 'Ana Carolina de Oliveira Silva',
        email: 'ana.silva@unesp.br',
        role: 'USER',
        unespRole: ['aluno-graduacao'],
      },
    },
  },
};

export default meta;
type Story = StoryObj<ParticipantSummaryComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByText('Ana Carolina de Oliveira Silva')).resolves.toBeVisible();
    await expect(canvas.findByText('RA 202612345')).resolves.toBeVisible();
    await expect(canvas.findByText('•••8901')).resolves.toBeVisible();
  },
};

export const MissingOptionalData: Story = {
  args: {
    person: {
      id: 'person-2',
      name: 'Pessoa sem dados complementares',
    },
  },
};

export const DarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    maskIdentityDocument: false,
  },
  play: Playground.play,
};
