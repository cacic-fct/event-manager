import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { EventMaterialsComponent } from './event-materials.component';
import { EventPreparationApiService } from './event-preparation-api.service';
import { createEventPreparationStoryApi, storyMaterialLinks } from './event-preparation.story-fixtures';

type Args = { eventId: string; eventName: string; editable: boolean; state: 'ready' | 'empty' | 'loading' | 'error' };
let active: Args;
const meta: Meta<Args> = {
  title: 'Shared/Events/Materials',
  component: EventMaterialsComponent,
  args: { eventId: 'event-story', eventName: 'Introdução à computação', editable: true, state: 'ready' },
  argTypes: { state: { control: 'select', options: ['ready', 'empty', 'loading', 'error'] } },
  parameters: { layout: 'padded', a11y: { test: 'error' } },
  render: (args) => {
    active = args;
    return { props: args };
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: EventPreparationApiService,
          useFactory: () => ({
            ...createEventPreparationStoryApi(),
            getMaterials: async () => {
              if (active.state === 'loading') return new Promise(() => undefined);
              if (active.state === 'error') throw new Error('Falha de conexão');
              return {
                links: active.state === 'empty' ? [] : storyMaterialLinks.map((link) => ({ ...link })),
                updatedAt: null,
              };
            },
          }),
        },
      ],
    }),
  ],
};
export default meta;
type Story = StoryObj<Args>;
export const LecturerEditor: Story = {};
export const SubscriberMaterials: Story = { args: { editable: false } };
export const Empty: Story = { args: { state: 'empty' } };
export const Loading: Story = { args: { state: 'loading' } };
export const ConnectionError: Story = { args: { state: 'error' } };
export const ShareLinkWithoutNotifications: Story = {
  args: { state: 'empty' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Adicionar link' }));
    await userEvent.type(canvas.getByLabelText('Título'), 'Slides');
    await userEvent.type(canvas.getByLabelText('Link HTTPS'), 'https://example.org/slides');
    await userEvent.click(canvas.getByRole('button', { name: 'Salvar materiais' }));
    await expect(await canvas.findByText('Materiais salvos. Nenhum aviso foi enviado aos inscritos.')).toBeVisible();
  },
};

export const ReleaseAfterEvent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click((await canvas.findAllByRole('checkbox', { name: 'Liberar após o término do evento' }))[0]);
    await expect(canvas.getAllByRole('checkbox')[0]).toBeChecked();
    await userEvent.click(canvas.getByRole('button', { name: 'Salvar materiais' }));
    await expect(await canvas.findByText('Materiais salvos. Nenhum aviso foi enviado aos inscritos.')).toBeVisible();
  },
};
