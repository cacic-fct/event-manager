import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { RegistrationDemoComponent } from './registration-demo';

const meta: Meta<RegistrationDemoComponent> = {
  component: RegistrationDemoComponent,
  title: 'Public/Landing/Demos/Registration',
  tags: ['autodocs', 'landing-showcase'],
  args: { organizer: false },
  argTypes: { organizer: { control: 'boolean', description: 'Show the organizer registration-management workspace.' } },
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<RegistrationDemoComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Inscrição em grande evento' }),
    ).toBeVisible();
  },
};

export const OrganizerEditingAndSearch: Story = {
  args: { organizer: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nameInput = canvas.getByRole('textbox', { name: 'Nome do evento' });
    const locationInput = canvas.getByRole('textbox', { name: 'Local' });

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Acessibilidade na web');
    await userEvent.clear(locationInput);
    await userEvent.type(locationInput, 'Auditório');
    await userEvent.click(canvas.getByRole('button', { name: 'Salvar alterações' }));

    await expect(await canvas.findByText('Alterações salvas.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Selecionar evento Acessibilidade na web' })).toBeVisible();

    await userEvent.click(canvas.getByRole('tab', { name: 'Inscrições' }));
    const search = await canvas.findByRole('searchbox', { name: 'Buscar inscrito' });
    await userEvent.type(search, 'Marina');
    await expect(canvas.getByText('Marina Costa')).toBeVisible();
    await expect(canvas.queryByText('Rafael Almeida')).not.toBeInTheDocument();
  },
};

export const OrganizerSubscriptionSearch: Story = {
  args: { organizer: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'Inscrições' }));
    await userEvent.type(await canvas.findByRole('searchbox', { name: 'Buscar inscrito' }), 'Beatriz');
    await expect(await canvas.findByText('Beatriz Lima')).toBeVisible();
    await expect(canvas.getByText('Conflito de horário')).toBeVisible();
    await expect(canvas.queryByText('Rafael Almeida')).not.toBeInTheDocument();
  },
};
