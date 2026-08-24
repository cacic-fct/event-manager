import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { type FormElement } from '@cacic-fct/form-contracts';
import { EventFormBuilderComponent } from './event-form-builder.component';

type EventFormBuilderStoryArgs = {
  elements: readonly FormElement[];
  elementsChange: ReturnType<typeof fn>;
};

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

const meta: Meta<EventFormBuilderStoryArgs> = {
  component: EventFormBuilderComponent,
  title: 'CACiC Eventos/Shared/Event forms/Builder',
  tags: ['autodocs'],
  args: {
    elements,
    elementsChange: fn(),
  },
  argTypes: {
    elements: {
      control: 'object',
      description: 'Estrutura editável do formulário, incluindo seções, perguntas e configurações avançadas.',
    },
    elementsChange: { table: { disable: true } },
  },
  render: (args) => ({
    props: args,
    template: `
      <lib-event-form-builder
        [elements]="elements"
        (elementsChange)="elementsChange($event)" />
    `,
  }),
};

export default meta;

type Story = StoryObj<EventFormBuilderStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Tamanho da camiseta')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Adicionar' }));
    await expect(args.elementsChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ type: 'shortText', title: '' })]),
    );
  },
};

export const Empty: Story = {
  args: {
    elements: [],
    elementsChange: fn(),
  },
};

export const MinimalRegistrationForm: Story = {
  args: {
    elements: elements.slice(0, 2),
    elementsChange: fn(),
  },
};

export const DarkReducedMotion: Story = {
  args: {
    elements: elements.slice(0, 3),
    elementsChange: fn(),
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
