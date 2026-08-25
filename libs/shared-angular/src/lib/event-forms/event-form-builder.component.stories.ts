import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { type FormElement, type FormImage } from '@cacic-fct/form-contracts';
import { EventFormBuilderComponent } from './event-form-builder.component';

type EventFormBuilderStoryArgs = {
  elements: readonly FormElement[];
  elementsChange: ReturnType<typeof fn>;
  imageUpload: ReturnType<typeof fn>;
  imageRemove: ReturnType<typeof fn>;
  uploadingImageTarget: string | null;
};

const landscapeImage = {
  id: 'form-image-landscape',
  url: 'https://placehold.co/1200x675',
  width: 1200,
  height: 675,
  altText: 'Mapa ilustrativo do local de retirada das camisetas',
  caption: 'Ponto de retirada no saguão principal.',
} satisfies FormImage;

const elements: FormElement[] = [
  { id: 'section', type: 'section', title: 'Inscrição', required: false, options: [] },
  {
    id: 'shirt',
    type: 'singleChoice',
    title: 'Tamanho da camiseta',
    descriptionImages: [landscapeImage],
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
    imageUpload: fn(),
    imageRemove: fn(),
    uploadingImageTarget: null,
  },
  argTypes: {
    elements: {
      control: 'object',
      description: 'Estrutura editável do formulário, incluindo seções, perguntas e configurações avançadas.',
    },
    elementsChange: { table: { disable: true } },
    imageUpload: { table: { disable: true } },
    imageRemove: { table: { disable: true } },
    uploadingImageTarget: { control: 'text' },
  },
  render: (args) => ({
    props: args,
    template: `
      <lib-event-form-builder
        [elements]="elements"
        [uploadingImageTarget]="uploadingImageTarget"
        (elementsChange)="elementsChange($event)"
        (imageUpload)="imageUpload($event)"
        (imageRemove)="imageRemove($event)" />
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

export const WithQuestionImage: Story = {
  args: {
    elements: elements.slice(0, 2),
    elementsChange: fn(),
    imageUpload: fn(),
    imageRemove: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: landscapeImage.altText })).toBeVisible();
    await expect(canvas.getByDisplayValue(landscapeImage.caption)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Remover imagem deste item' })).toBeVisible();
  },
};

export const UploadingQuestionImage: Story = {
  args: {
    elements: elements.slice(0, 2),
    uploadingImageTarget: 'shirt',
    elementsChange: fn(),
    imageUpload: fn(),
    imageRemove: fn(),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('Enviando imagem')).toBeVisible();
  },
};

export const UntitledQuestion: Story = {
  args: {
    elements: [{ id: 'untitled', type: 'shortText', title: '', required: false, options: [] }],
    elementsChange: fn(),
    imageUpload: fn(),
    imageRemove: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Informe o título da pergunta.')).toBeVisible();
    await expect(canvas.getByLabelText('Título')).toHaveAttribute('aria-invalid', 'true');
  },
};

export const DarkReducedMotion: Story = {
  args: {
    elements: elements.slice(0, 3),
    elementsChange: fn(),
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
