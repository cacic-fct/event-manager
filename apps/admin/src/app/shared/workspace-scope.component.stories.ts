import { type Meta, type StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspaceScopeComponent } from './workspace-scope.component';

const meta: Meta<WorkspaceScopeComponent> = {
  component: WorkspaceScopeComponent,
  title: 'CACiC Eventos/Workspace/Components/Scope',
  tags: ['autodocs'],
  args: { scopeId: 'selected-event', emoji: '🧠', title: 'Oficina de acessibilidade', emptyLabel: 'Selecionar evento', changeLabel: 'Trocar evento', description: 'Busque um evento para consultar sua participação.', disabled: false },
  argTypes: {
    emoji: { control: 'text' }, scopeId: { control: 'text' }, title: { control: 'text' }, emptyLabel: { control: 'text' },
    changeLabel: { control: 'text' }, description: { control: 'text' }, disabled: { control: 'boolean' },
  },
  render: (args) => ({ props: args, template: `
    <app-workspace-scope [scopeId]="scopeId" [emoji]="emoji" [title]="title" [emptyLabel]="emptyLabel" [changeLabel]="changeLabel" [description]="description" [disabled]="disabled">
      <p>Seletor de eventos</p>
    </app-workspace-scope>
  ` }),
  parameters: { a11y: { test: 'error' } },
};
export default meta;
type Story = StoryObj<WorkspaceScopeComponent>;
export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole('button', { name: /Oficina de acessibilidade/ });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    await expect(canvas.getByText('Seletor de eventos')).toBeVisible();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  },
};
export const NoSelection: Story = {
  args: { scopeId: null, title: '' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Seletor de eventos')).toBeVisible();
  },
};
export const DarkReducedMotion: Story = { globals: { theme: 'dark', motion: 'reduced' } };
export const UnsavedChanges: Story = { args: { disabled: true } };
export const LongTitle: Story = { args: { title: 'Semana de ciência e tecnologia: atividades de extensão, oficinas e encontros da comunidade universitária' }, globals: { viewport: { value: 'mobile1', isRotated: false } } };
