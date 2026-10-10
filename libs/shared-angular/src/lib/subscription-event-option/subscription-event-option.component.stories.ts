import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SubscriptionEventOptionComponent } from './subscription-event-option.component';

const meta: Meta<SubscriptionEventOptionComponent> = {
  component: SubscriptionEventOptionComponent,
  title: 'CACiC Eventos/Subscriptions/Event selection/Subscription event option',
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideNoopAnimations()] })],
  args: {
    option: {
      id: 'event-1',
      name: 'Arquitetura Angular para aplicações acadêmicas',
      emoji: '💻',
      description: 'Minicurso',
      startDate: '2026-06-02T12:00:00.000Z',
      endDate: '2026-06-02T14:00:00.000Z',
      locationDescription: 'Auditório 2',
      availabilityLine: '2 vagas disponíveis · Posição 4 na fila',
    },
    selected: true,
    disabled: false,
    disabledReason: null,
    warningReason: null,
    interested: false,
    readOnly: false,
    showInfoButton: false,
    showFullDate: false,
    selectionChange: fn(),
    info: fn(),
  },
  argTypes: {
    option: { control: 'object', description: 'Dados do evento exibidos na opção de inscrição.' },
    selected: { control: 'boolean', description: 'Indica se a pessoa selecionou este evento.' },
    disabled: { control: 'boolean', description: 'Impede a seleção do evento.' },
    disabledReason: { control: 'text', description: 'Explica por que a seleção está indisponível.' },
    warningReason: { control: 'text', description: 'Aviso associado à inscrição neste evento.' },
    interested: { control: 'boolean', description: 'Indica se a pessoa já marcou Quero ir.' },
    readOnly: { control: 'boolean', description: 'Exibe a opção sem permitir alterações.' },
    showInfoButton: { control: 'boolean', description: 'Exibe a ação para consultar informações do evento.' },
    showFullDate: { control: 'boolean', description: 'Exibe a data completa em vez de apenas os horários.' },
    selectionChange: { table: { disable: true } },
    info: { table: { disable: true } },
  },
  parameters: { layout: 'padded', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<SubscriptionEventOptionComponent>;

export const Playground: Story = {
  args: {
    selectionChange: fn(),
    info: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const selection = canvas.getByRole('checkbox', {
      name: 'Selecionar Arquitetura Angular para aplicações acadêmicas',
    });

    await expect(selection).toBeChecked();
    await userEvent.click(selection);
    await expect(args.selectionChange).toHaveBeenCalledWith(false);
  },
};

export const Selected: Story = {};

export const LecturerOwnEventWarning: Story = {
  args: { warningReason: 'Palestrante inscrito no próprio evento' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Palestrante inscrito no próprio evento')).toBeVisible();
    await expect(canvas.getByText('warning')).toBeVisible();
  },
};

export const PublicWithInfoAction: Story = {
  args: { showInfoButton: true, info: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Mais informações sobre Arquitetura Angular para aplicações acadêmicas' }));
    await expect(args.info).toHaveBeenCalledOnce();
  },
};

export const DarkReducedMotion: Story = {
  args: {
    selected: false,
    interested: true,
    showFullDate: true,
  },
  globals: { theme: 'dark', motion: 'reduced' },
};
