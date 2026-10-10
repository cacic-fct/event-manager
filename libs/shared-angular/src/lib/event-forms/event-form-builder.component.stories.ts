import { Component, input, linkedSignal } from '@angular/core';
import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
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

@Component({
  selector: 'lib-storybook-event-form-builder-host',
  imports: [EventFormBuilderComponent],
  template: `
    <lib-event-form-builder
      [elements]="currentElements()"
      [uploadingImageTarget]="uploadingImageTarget()"
      (elementsChange)="updateElements($event)"
      (imageUpload)="uploadImage($event)"
      (imageRemove)="removeImage($event)" />
  `,
})
class EventFormBuilderStoryHostComponent {
  readonly elements = input<readonly FormElement[]>([]);
  readonly elementsChange = input<EventFormBuilderStoryArgs['elementsChange']>(fn());
  readonly imageUpload = input<EventFormBuilderStoryArgs['imageUpload']>(fn());
  readonly imageRemove = input<EventFormBuilderStoryArgs['imageRemove']>(fn());
  readonly uploadingImageTarget = input<string | null>(null);
  readonly currentElements = linkedSignal(() => this.elements());

  updateElements(elements: FormElement[]): void {
    this.currentElements.set(elements);
    this.elementsChange()(elements);
  }

  uploadImage(event: { elementId: string; file: File | null }): void {
    this.imageUpload()(event);
  }

  removeImage(event: { elementId: string; image: FormImage }): void {
    this.imageRemove()(event);
  }
}

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
  component: EventFormBuilderStoryHostComponent,
  title: 'Shared/Forms/Form Builder',
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
      description: 'Editable form structure, including sections, questions, and advanced settings.',
    },
    elementsChange: { action: 'elementsChange', control: false, table: { disable: true } },
    imageUpload: { action: 'imageUpload', control: false, table: { disable: true } },
    imageRemove: { action: 'imageRemove', control: false, table: { disable: true } },
    uploadingImageTarget: { control: 'text', description: 'Question ID currently uploading an image.' },
  },
  decorators: [moduleMetadata({ imports: [EventFormBuilderStoryHostComponent] })],
  render: (args) => ({
    props: args,
    template: `
      <lib-storybook-event-form-builder-host
        [elements]="elements"
        [elementsChange]="elementsChange"
        [imageUpload]="imageUpload"
        [imageRemove]="imageRemove"
        [uploadingImageTarget]="uploadingImageTarget" />
    `,
  }),
  parameters: {
    docs: {
      description: {
        component:
          'The story host echoes element changes back into the builder input, so add, edit, duplicate, reorder, and remove actions update the displayed form.',
      },
    },
  },
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
    await expect(canvasElement.querySelectorAll('.builder-item')).toHaveLength(5);
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
    const title = canvas.getByLabelText('Título');
    await expect(title).toBeRequired();
    await expect(title).toBeInvalid();
  },
};
