import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { EventDetailTabs } from './event-detail-tabs';

const meta: Meta<EventDetailTabs> = {
  title: 'Public/Shared/Event Detail Tabs',
  component: EventDetailTabs,
  tags: ['autodocs'],
  args: { hasSubscription: true, contextKey: 'example-event' },
  parameters: { a11y: { test: 'error' } },
  argTypes: { subscriptionContent: { control: false }, generalContent: { control: false } },
  render: (args) => ({
    props: args,
    template: `
      <ng-template #subscription><h2>Sua participação</h2><p>Sua inscrição está confirmada.</p></ng-template>
      <ng-template #general><h2>Sobre o evento</h2><p>Informações sobre as atividades da comunidade.</p></ng-template>
      <app-event-detail-tabs [contextKey]="contextKey" [hasSubscription]="hasSubscription"
        [subscriptionContent]="subscription" [generalContent]="general" />
    `,
  }),
};
export default meta;
type Story = StoryObj<EventDetailTabs>;
export const Subscribed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const subscription = canvas.getByRole('tab', { name: /^(Minha inscrição|Inscrição)$/ });
    await expect(subscription).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(canvas.getByRole('tab', { name: /^(Sobre o evento|Sobre)$/ }));
    await expect(canvas.getByRole('heading', { name: 'Sobre o evento' })).toBeVisible();
    await userEvent.click(subscription);
    await expect(canvas.getByRole('heading', { name: 'Sua participação' })).toBeVisible();
  },
};
export const NotSubscribed: Story = {
  args: { hasSubscription: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: 'Sobre o evento' })).toBeVisible();
  },
};
