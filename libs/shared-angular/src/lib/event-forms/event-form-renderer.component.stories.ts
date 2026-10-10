import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { type FormElement, type FormImage, type FormResponseAnswer } from '@cacic-fct/form-contracts';
import { EventFormRendererComponent } from './event-form-renderer.component';

type EventFormRendererStoryArgs = {
  elements: readonly FormElement[];
  initialAnswers: readonly FormResponseAnswer[];
  readOnly: boolean;
  showSubmit: boolean;
  submitLabel: string;
  formSubmitted: ReturnType<typeof fn>;
  answersChange: ReturnType<typeof fn>;
};

const sharedLandscapeImage = {
  id: 'shared-form-image',
  url: 'https://placehold.co/1200x675',
  width: 1200,
  height: 675,
  altText: 'Diagrama de referência para responder às perguntas',
  caption: 'A mesma imagem pode apoiar mais de uma pergunta.',
} satisfies FormImage;

const portraitImage = {
  id: 'portrait-form-image',
  url: 'https://placehold.co/900x1200',
  width: 900,
  height: 1200,
  altText: 'Cartaz vertical com informações da atividade',
  caption: 'Exemplo de imagem vertical preservando toda a composição.',
} satisfies FormImage;

const elements: FormElement[] = [
  { id: 'section', type: 'section', title: 'Dados do participante', required: false, options: [] },
  {
    id: 'shirt',
    type: 'selectionDropdown',
    title: 'Tamanho da camiseta',
    required: true,
    options: [
      { id: 'p', label: 'P' },
      { id: 'm', label: 'M' },
      { id: 'g', label: 'G' },
    ],
  },
  { id: 'bio', type: 'longText', title: 'Observações', required: false, options: [] },
  {
    id: 'tracks',
    type: 'multipleChoice',
    title: 'Áreas de interesse',
    required: true,
    options: [
      { id: 'web', label: 'Web' },
      { id: 'data', label: 'Dados' },
      { id: 'infra', label: 'Infraestrutura' },
    ],
  },
  {
    id: 'scale',
    type: 'linearScale',
    title: 'Expectativa',
    required: true,
    options: [],
    settings: {
      linearScale: { min: 1, max: 5, minLabel: 'Baixa', maxLabel: 'Alta' },
    },
  },
  {
    id: 'rating',
    type: 'starRating',
    title: 'Avaliação geral',
    required: false,
    options: [],
    settings: {
      starRating: { max: 5 },
    },
  },
  {
    id: 'grid',
    type: 'singleSelectionGrid',
    title: 'Disponibilidade por turno',
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
  { id: 'date', type: 'date', title: 'Data preferida', required: false, options: [] },
  { id: 'time', type: 'time', title: 'Horário preferido', required: false, options: [] },
  {
    id: 'schedule',
    type: 'scheduling',
    title: 'Agende atendimento',
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

const meta: Meta<EventFormRendererStoryArgs> = {
  component: EventFormRendererComponent,
  title: 'Shared/Forms/Form Renderer',
  tags: ['autodocs'],
  args: {
    elements,
    initialAnswers: [],
    readOnly: false,
    showSubmit: true,
    submitLabel: 'Salvar respostas',
    formSubmitted: fn(),
    answersChange: fn(),
  },
  argTypes: {
    elements: {
      control: 'object',
      description: 'Form items displayed to the participant.',
    },
    initialAnswers: {
      control: 'object',
      description: 'Existing answers used for editing or review.',
    },
    readOnly: { control: 'boolean', description: 'Disable answer editing.' },
    showSubmit: { control: 'boolean', description: 'Show the submit action.' },
    submitLabel: { control: 'text', description: 'Label shown on the submit action.' },
    formSubmitted: { table: { disable: true } },
    answersChange: { table: { disable: true } },
  },
  render: (args) => ({
    props: args,
    template: `
      <lib-event-form-renderer
        [elements]="elements"
        [initialAnswers]="initialAnswers"
        [readOnly]="readOnly"
        [showSubmit]="showSubmit"
        [submitLabel]="submitLabel"
        (formSubmitted)="formSubmitted($event)"
        (answersChange)="answersChange($event)" />
    `,
  }),
  parameters: {
    docs: {
      description: {
        component:
          'Answers stay local to the renderer while changes and submissions are captured by Storybook callbacks. Use the controls to review editable, read-only, and media-rich forms.',
      },
    },
  },
};

export default meta;

type Story = StoryObj<EventFormRendererStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText('Salvar respostas'));
    await expect(await canvas.findAllByText('Esta pergunta é obrigatória.')).toHaveLength(3);
  },
};

export const ReadOnly: Story = {
  args: {
    initialAnswers: answers,
    readOnly: true,
    showSubmit: false,
    formSubmitted: fn(),
    answersChange: fn(),
  },
};

export const Empty: Story = {
  args: {
    elements: [],
    initialAnswers: [],
    formSubmitted: fn(),
    answersChange: fn(),
  },
};

export const ResponsiveQuestionImages: Story = {
  args: {
    elements: [
      {
        id: 'image-section',
        type: 'section',
        title: 'Material de referência',
        description: 'Observe as imagens antes de responder.',
        descriptionImages: [portraitImage],
        required: false,
        options: [],
      },
      { ...elements[1], descriptionImages: [sharedLandscapeImage] },
      {
        ...elements[2],
        descriptionImages: [
          {
            ...sharedLandscapeImage,
            caption: 'O mesmo arquivo, reutilizado sem duplicar o objeto armazenado.',
          },
        ],
      },
    ],
    initialAnswers: [],
    formSubmitted: fn(),
    answersChange: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: portraitImage.altText })).toBeVisible();
    await expect(canvas.getAllByRole('img', { name: sharedLandscapeImage.altText })).toHaveLength(2);
    await expect(canvas.getByText(/reutilizado sem duplicar/i)).toBeVisible();
  },
};
