import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { FormImage } from '@cacic-fct/form-contracts';
import { EventFormDescriptionContentComponent } from './event-form-description-content.component';

const images: FormImage[] = [
  {
    id: 'landscape',
    url: 'https://placehold.co/1200x675',
    width: 1200,
    height: 675,
    altText: 'Imagem horizontal de referência',
    caption: 'Formato horizontal em toda a largura disponível.',
  },
  {
    id: 'portrait',
    url: 'https://placehold.co/900x1200',
    width: 900,
    height: 1200,
    altText: 'Imagem vertical de referência',
    caption: 'Formato vertical sem corte do conteúdo.',
  },
];

const meta: Meta<EventFormDescriptionContentComponent> = {
  component: EventFormDescriptionContentComponent,
  title: 'CACiC Eventos/Shared/Event forms/Description Content',
  tags: ['autodocs'],
  args: {
    text: 'As imagens mantêm as proporções originais e reservam espaço durante o carregamento.',
    images,
  },
  argTypes: {
    text: { control: 'text' },
    images: { control: 'object' },
  },
  render: (args) => ({
    props: args,
    template: `<lib-event-form-description-content [text]="text" [images]="images" />`,
  }),
};

export default meta;

type Story = StoryObj<EventFormDescriptionContentComponent>;

export const Playground: Story = {};

export const LandscapeAndPortrait: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: 'Imagem horizontal de referência' })).toHaveAttribute('width', '1200');
    await expect(canvas.getByRole('img', { name: 'Imagem vertical de referência' })).toHaveAttribute('height', '1200');
  },
};

export const ImageOnlyMobile: Story = {
  args: { text: undefined, images: [images[1]] },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

export const DecorativeWithoutCaption: Story = {
  args: {
    text: undefined,
    images: [{ ...images[0], altText: undefined, caption: undefined }],
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
