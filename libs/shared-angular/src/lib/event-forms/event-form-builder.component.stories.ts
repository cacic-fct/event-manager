import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { type FormElement } from '@cacic-fct/form-contracts';
import { EventFormBuilderComponent } from './event-form-builder.component';

const elements: FormElement[] = [
  { id: 'section', type: 'section', title: 'Inscrição', required: false, options: [] },
  {
    id: 'shirt',
    type: 'singleChoice',
    title: 'Tamanho da camiseta',
    required: true,
    options: [
      { id: 'p', label: 'P' },
      { id: 'm', label: 'M' },
      { id: 'g', label: 'G' },
    ],
  },
  {
    id: 'grid',
    type: 'multipleSelectionGrid',
    title: 'Disponibilidade',
    required: false,
    options: [],
    settings: {
      grid: {
        rows: [
          { id: 'mon', label: 'Segunda' },
          { id: 'tue', label: 'Terça' },
        ],
        columns: [
          { id: 'morning', label: 'Manhã' },
          { id: 'night', label: 'Noite' },
        ],
      },
    },
  },
  {
    id: 'schedule',
    type: 'scheduling',
    title: 'Agendamento',
    required: false,
    options: [],
    settings: {
      scheduling: {
        timezone: 'America/Sao_Paulo',
        durationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        inviteeMode: 'optional',
        maxInvitees: 1,
        availability: [{ id: 'window-1', date: '2026-07-01', startTime: '09:00', endTime: '11:00' }],
      },
    },
  },
];

const meta: Meta<EventFormBuilderComponent> = {
  component: EventFormBuilderComponent,
  title: 'Shared/Event Forms/Builder',
  tags: ['autodocs'],
  args: {
    elements,
  },
};

export default meta;

type Story = StoryObj<EventFormBuilderComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Tamanho da camiseta')).toBeVisible();
    await userEvent.click(await canvas.findByText('Adicionar'));
  },
};

export const Empty: Story = {
  args: {
    elements: [],
  },
};
