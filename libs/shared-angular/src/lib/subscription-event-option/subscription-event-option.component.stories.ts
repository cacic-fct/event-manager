import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SubscriptionEventOptionComponent } from './subscription-event-option.component';

const meta: Meta<SubscriptionEventOptionComponent> = {
  component: SubscriptionEventOptionComponent,
  title: 'Shared/Subscription Event Option',
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
  },
  parameters: { layout: 'padded', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<SubscriptionEventOptionComponent>;

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
  args: { showInfoButton: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Mais informações sobre Arquitetura Angular para aplicações acadêmicas' }));
  },
};
