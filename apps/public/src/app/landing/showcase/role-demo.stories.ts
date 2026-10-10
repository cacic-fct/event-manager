import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { RoleDemoComponent } from './role-demo';

const meta: Meta<RoleDemoComponent> = {
  component: RoleDemoComponent,
  title: 'CACiC Eventos/Landing/Cargos da equipe',
  tags: ['autodocs', 'landing-showcase'],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<RoleDemoComponent>;

export const Playground: Story = {
  globals: { theme: 'light', motion: 'full' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { name: 'Novo cargo' })).toBeVisible();
    await userEvent.click(canvas.getByRole('checkbox', { name: /Emitir certificados/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Criar cargo' }));

    await expect(canvas.getByRole('status')).toHaveTextContent('Cargo criado');
    await expect(canvas.getByRole('heading', { name: 'Equipe de credenciamento' })).toBeVisible();
    await expect(canvas.getByText('Emitir certificados')).toBeVisible();
  },
};

export const DarkEditRole: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Criar cargo' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Editar cargo' }));
    const name = canvas.getByRole('textbox', { name: 'Nome do cargo' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Equipe de apoio');
    await userEvent.click(canvas.getByRole('checkbox', { name: /Conferir comprovantes/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Salvar alterações' }));

    await expect(canvas.getByRole('status')).toHaveTextContent('Alterações salvas');
    await expect(canvas.getByRole('heading', { name: 'Equipe de apoio' })).toBeVisible();
    await expect(canvas.getByText('Conferir comprovantes')).toBeVisible();
  },
};

export const PermissionSelection: Story = {
  globals: { theme: 'light', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('checkbox', { name: /Conferir comprovantes/ }));
    await expect(canvas.getByText('3 de 4 selecionadas')).toBeVisible();
    await userEvent.click(canvas.getByRole('checkbox', { name: /Registrar presenças/ }));
    await expect(canvas.getByText('2 de 4 selecionadas')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Criar cargo' }));

    await expect(canvas.getByText('Acompanhar inscrições')).toBeVisible();
    await expect(canvas.getByText('Conferir comprovantes')).toBeVisible();
    await expect(canvas.queryByText('Registrar presenças')).not.toBeInTheDocument();
  },
};

export const MobileCreateAnotherRole: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Criar cargo' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Criar outro cargo' }));
    const name = canvas.getByRole('textbox', { name: 'Nome do cargo' });
    await expect(name).toHaveValue('');
    await userEvent.type(name, 'Monitores de atividades');
    await userEvent.click(canvas.getByRole('checkbox', { name: /Registrar presenças/ }));
    await userEvent.click(canvas.getByRole('button', { name: 'Criar cargo' }));

    await expect(canvas.getByRole('heading', { name: 'Monitores de atividades' })).toBeVisible();
    await expect(canvas.getByText('Registrar presenças')).toBeVisible();
  },
};
