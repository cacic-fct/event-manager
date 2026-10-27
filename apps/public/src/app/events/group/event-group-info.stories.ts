import type { Meta, StoryObj } from '@storybook/angular';
import { createParticipationInformationFixture } from '@cacic-fct/event-manager-public-testing';
import { EventGroupInfo } from './event-group-info';
import { expect, within } from 'storybook/test';

const fixture = createParticipationInformationFixture({ targetType: 'event-group' });
const meta: Meta<EventGroupInfo> = {
  title: 'Public/Discovery/Event Group Information',
  component: EventGroupInfo,
  tags: ['autodocs'],
  args: { group: fixture.eventGroup, events: fixture.events, isAuthenticated: false, hasParticipation: false },
  parameters: { layout: 'fullscreen', a11y: { test: 'error' } },
};
export default meta;
type Story = StoryObj<EventGroupInfo>;
export const Visitor: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1 })).toHaveTextContent(fixture.eventGroup.name);
    await expect(canvas.getByRole('link', { name: 'Ver opções de inscrição' })).toBeVisible();
  },
};
export const SignedIn: Story = { args: { isAuthenticated: true } };
export const Empty: Story = { args: { events: [] } };
export const SingleActivity: Story = { args: { events: fixture.events.slice(0, 1) } };
export const ManyActivities: Story = {
  args: { events: createParticipationInformationFixture({ targetType: 'event-group', eventCount: 20 }).events },
};
export const NoCertificate: Story = { args: { group: { ...fixture.eventGroup, shouldIssueCertificate: false } } };
export const PerActivityCertificates: Story = {
  args: {
    group: { ...fixture.eventGroup, shouldIssuePartialCertificate: false, shouldIssueCertificateForEachEvent: true },
  },
};
export const UnknownWorkload: Story = {
  args: { events: fixture.events.map((event) => ({ ...event, creditMinutes: null })) },
};
export const Loading: Story = { args: { events: [], loading: true } };
export const Error: Story = { args: { events: [], error: true } };
export const LongContent: Story = {
  args: {
    group: {
      ...fixture.eventGroup,
      name: 'Oficinas interdisciplinares de tecnologia, acessibilidade e criação em comunidade',
    },
    events: fixture.events.map((event) => ({
      ...event,
      name: `${event.name}: perspectivas interdisciplinares para a comunidade acadêmica e a sociedade`,
    })),
  },
};
