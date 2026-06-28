import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { type FormElement, type FormResponseAnswer } from '@cacic-fct/form-contracts';
import { EventFormRendererComponent } from './event-form-renderer.component';

const elements: FormElement[] = [
  { id: 'section', type: 'section', title: 'Dados do participante', required: false, options: [] },
  { id: 'shirt', type: 'selectionDropdown', title: 'Tamanho da camiseta', required: true, options: [
    { id: 'p', label: 'P' },
    { id: 'm', label: 'M' },
    { id: 'g', label: 'G' },
  ] },
  { id: 'bio', type: 'longText', title: 'Observações', required: false, options: [] },
  { id: 'tracks', type: 'multipleChoice', title: 'Áreas de interesse', required: true, options: [
    { id: 'web', label: 'Web' },
    { id: 'data', label: 'Dados' },
    { id: 'infra', label: 'Infraestrutura' },
  ] },
  { id: 'scale', type: 'linearScale', title: 'Expectativa', required: true, options: [], settings: {
    linearScale: { min: 1, max: 5, minLabel: 'Baixa', maxLabel: 'Alta' },
  } },
  { id: 'rating', type: 'starRating', title: 'Avaliação geral', required: false, options: [], settings: {
    starRating: { max: 5 },
  } },
  { id: 'grid', type: 'singleSelectionGrid', title: 'Disponibilidade por turno', required: false, options: [], settings: {
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
  } },
  { id: 'date', type: 'date', title: 'Data preferida', required: false, options: [] },
  { id: 'time', type: 'time', title: 'Horário preferido', required: false, options: [] },
  { id: 'schedule', type: 'scheduling', title: 'Agende atendimento', required: false, options: [], settings: {
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
  } },
];

const answers: FormResponseAnswer[] = [
  { elementId: 'shirt', value: 'm' },
  { elementId: 'bio', value: 'Prefiro retirar no primeiro dia.' },
  { elementId: 'tracks', value: ['web', 'data'] },
  { elementId: 'scale', value: 4 },
  { elementId: 'rating', value: 5 },
  { elementId: 'grid', value: { mon: 'morning' } },
  { elementId: 'date', value: '2026-07-01' },
  { elementId: 'time', value: '09:30' },
  { elementId: 'schedule', value: { slotId: 'window-1:09:00-09:30', invitees: [{ name: 'Ada' }] } },
];

const meta: Meta<EventFormRendererComponent> = {
  component: EventFormRendererComponent,
  title: 'Shared/Event Forms/Renderer',
  tags: ['autodocs'],
  args: {
    elements,
    initialAnswers: [],
    readOnly: false,
    showSubmit: true,
    submitLabel: 'Salvar respostas',
  },
  argTypes: {
    readOnly: { control: 'boolean' },
    showSubmit: { control: 'boolean' },
    submitLabel: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<EventFormRendererComponent>;

export const Editable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Salvar respostas'));
    await expect(await canvas.findByText('Esta pergunta é obrigatória.')).toBeVisible();
  },
};

export const ReadOnly: Story = {
  args: {
    initialAnswers: answers,
    readOnly: true,
    showSubmit: false,
  },
};
