import type { Meta, StoryObj } from '@storybook/angular';
import { createPublicMajorEvent } from '@cacic-fct/event-manager-public-testing';
import { expect, userEvent, within } from 'storybook/test';
import { SubscriptionTierSelection } from './tier-selection';

const tiers = [
  { id: 'events', name: 'Eventos', value: 3000, includesEventRegistration: true, includesSportsRegistration: false },
  { id: 'sports', name: 'Esportes', value: 2000, includesEventRegistration: false, includesSportsRegistration: true },
  {
    id: 'both',
    name: 'Eventos e esportes',
    value: 4500,
    includesEventRegistration: true,
    includesSportsRegistration: true,
  },
  {
    id: 'support',
    name: 'Participação no grande evento',
    value: 0,
    includesEventRegistration: false,
    includesSportsRegistration: false,
  },
];
const meta: Meta<SubscriptionTierSelection> = {
  component: SubscriptionTierSelection,
  title: 'Public/Registration/Major Event/Tier Selection',
  tags: ['autodocs'],
  args: {
    majorEvent: createPublicMajorEvent({
      isPaymentRequired: true,
      sportsTournament: { id: 'tournament', selfSubscriptionEnabled: true, registrationOpen: true },
    }),
    tiers,
    selectedName: null,
    busy: false,
  },
  argTypes: {
    majorEvent: { control: false, table: { category: 'Fixture Data' } },
    tiers: { control: false, table: { category: 'Fixture Data' } },
    selectedName: {
      control: {
        type: 'select',
        labels: {
          null: 'No selection',
          Eventos: 'Events',
          Esportes: 'Sports',
          'Eventos e esportes': 'Events and sports',
          'Participação no grande evento': 'Major event participation',
        },
      },
      options: [null, ...tiers.map((tier) => tier.name)],
      name: 'Selected Tier',
      description: 'Selects a registration tier, or leave empty to start without a selection.',
      table: { category: 'Selection' },
    },
    busy: {
      control: 'boolean',
      name: 'Loading',
      description: 'Disables selection while the registration request is in progress.',
      table: { category: 'Selection' },
    },
  },
  render: (args) => ({
    props: args,
    template: `<app-subscription-tier-selection [majorEvent]="majorEvent" [tiers]="tiers" [selectedName]="selectedName"
      [busy]="busy" (selectTier)="selectedName = $event" />`,
  }),
};
export default meta;
type Story = StoryObj<SubscriptionTierSelection>;

export const Playground: Story = {
};

export const CompareModalities: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: /Continuar/ })).toBeDisabled();
    await userEvent.click(canvas.getByRole('radio', { name: /Eventos e esportes/ }));
    await expect(canvas.getByRole('button', { name: 'Continuar para eventos' })).toBeEnabled();
  },
};
export const SportsOnly: Story = { args: { selectedName: 'Esportes' } };
export const NoActivities: Story = { args: { selectedName: 'Participação no grande evento' } };

export const SingleTier: Story = { args: { tiers: [tiers[0]], selectedName: 'Eventos' } };
export const TournamentClosed: Story = {
  args: {
    selectedName: 'Esportes',
    majorEvent: createPublicMajorEvent({
      isPaymentRequired: true,
      sportsTournament: { id: 'tournament', selfSubscriptionEnabled: true, registrationOpen: false },
    }),
  },
};
export const LoadingSubscription: Story = { args: { busy: true } };

export const WithoutTournament: Story = {
  args: {
    majorEvent: createPublicMajorEvent({ sportsTournament: null }),
    tiers: [tiers[0], tiers[3]],
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.textContent).not.toMatch(/esport|torneio/i);
  },
};
