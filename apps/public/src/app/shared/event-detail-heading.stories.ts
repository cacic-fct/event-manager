import { type Meta, type StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { EventDetailHeading } from './event-detail-heading';

const identityClicked = fn();

const meta: Meta<EventDetailHeading> = {
  title: 'Public/Shared/Event Detail Heading',
  component: EventDetailHeading,
  tags: ['autodocs'],
  args: { title: 'Encontro de ciência e comunidade', emoji: '🌎', copyable: false, identityClicked },
  parameters: { a11y: { test: 'error' } },
  render: (args) => ({
    props: { ...args, onIdentityClicked: () => identityClicked() },
    template: `<app-event-detail-heading [title]="title" [emoji]="emoji" [subtitle]="subtitle"
      [copyable]="copyable" (identityClicked)="onIdentityClicked()" />`,
  }),
};
export default meta;
type Story = StoryObj<EventDetailHeading>;
export const Default: Story = {};
export const WithDescription: Story = {
  args: { subtitle: 'Ideias, projetos e experiências da comunidade acadêmica.' },
};
export const LongTitle: Story = {
  args: {
    title:
      'Encontro interdisciplinar de tecnologia, acessibilidade, ciência aberta e transformação social na universidade',
  },
};
export const CopyIdentifier: Story = {
  args: { copyable: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Copiar identificador do evento' }));
    await expect(identityClicked).toHaveBeenCalled();
  },
};
