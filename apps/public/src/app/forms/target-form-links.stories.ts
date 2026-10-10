import type { Meta, StoryObj } from '@storybook/angular';
import { createPublicEventForm, createPublicEventFormLink } from '@cacic-fct/event-manager-public-testing';
import { HttpResponse, http } from 'msw';
import { expect, within } from 'storybook/test';
import { TargetFormLinks } from './target-form-links';

const form = createPublicEventForm({ name: 'Prepare sua visita', links: [
  createPublicEventFormLink({ targetType: 'MAJOR_EVENT', eventId: null, majorEventId: 'major-1', audiences: ['INTERESTED'] }),
] });
const meta: Meta<TargetFormLinks> = {
  component: TargetFormLinks,
  title: 'Public/Registration/Forms/Target Links',
  tags: ['autodocs'],
  args: { targetType: 'MAJOR_EVENT', targetId: 'major-1' },
  argTypes: { targetType: { control: 'select', options: ['EVENT', 'MAJOR_EVENT'] }, targetId: { control: 'text' } },
  parameters: {
    layout: 'padded', a11y: { test: 'error' },
    msw: { handlers: { graphql: [http.post('/api/graphql', () => HttpResponse.json({ data: { currentUserEventForms: [form] } }))] } },
  },
};
export default meta;
type Story = StoryObj<TargetFormLinks>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByRole('link', { name: 'Prepare sua visita' })).toBeVisible();
  },
};
export const NoEligibleForms: Story = {
  parameters: { msw: { handlers: { graphql: [http.post('/api/graphql', () => HttpResponse.json({ data: { currentUserEventForms: [] } }))] } } },
};
