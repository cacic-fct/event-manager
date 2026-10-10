import type { Meta, StoryObj } from '@storybook/angular';
import { createPublicEventInterest, publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { HttpResponse, delay, http } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { InterestToggle } from './interest-toggle';

const meta: Meta<InterestToggle> = {
  title: 'CACiC Eventos/Events/Quero ir',
  component: InterestToggle,
  tags: ['autodocs'],
  args: { targetType: 'EVENT', targetId: 'event-1', targetName: 'Palestra aberta' },
  argTypes: {
    targetType: { control: 'select', options: ['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT'] },
    targetId: { control: 'text' },
    targetName: { control: 'text' },
    subscribed: { control: 'boolean' },
    interestEnabled: { control: 'boolean' },
    endsAt: { control: 'text' },
  },
  parameters: { layout: 'padded', a11y: { test: 'error' } },
};
export default meta;
type Story = StoryObj<InterestToggle>;

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  parameters: mockInterest(false),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole('button', { name: 'Quero ir: Palestra aberta' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
    await expect(await within(document.body).findByText('Seu interesse foi registrado! A inscrição, quando necessária, é feita separadamente.')).toBeVisible();
    await userEvent.click(await within(document.body).findByRole('button', { name: 'Fechar' }));
  },
};

export const Interested: Story = {
  globals: { theme: 'light', network: 'online' },
  parameters: mockInterest(true),
};

export const ExistingInterestAfterDisablement: Story = {
  args: { interestEnabled: false },
  globals: { theme: 'light', network: 'online' },
  parameters: mockInterest(true, false, false, false),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole('button', { name: 'Quero ir: Palestra aberta' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(toggle);
    await waitFor(() => expect(canvas.queryByRole('button', { name: 'Quero ir: Palestra aberta' })).toBeNull());
  },
};

export const SaveError: Story = {
  globals: { theme: 'light', network: 'online' },
  parameters: mockInterest(false, true),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole('button', { name: 'Quero ir: Palestra aberta' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await userEvent.click(toggle);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Não foi possível salvar');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  },
};

export const DarkReducedMotion: Story = {
  globals: { theme: 'dark', motion: 'reduced', network: 'online' },
  parameters: mockInterest(true),
  play: async ({ canvasElement }) => {
    const toggle = await within(canvasElement).findByRole('button', { name: 'Quero ir: Palestra aberta' });
    await waitFor(() => expect(toggle).toBeEnabled());
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  },
};

export const Offline: Story = {
  globals: { theme: 'light', network: 'offline' },
  parameters: mockInterest(false),
};

export const AlreadySubscribed: Story = {
  args: { subscribed: true },
  globals: { theme: 'light', network: 'online' },
  parameters: mockInterest(false),
};

export const Finished: Story = {
  globals: { theme: 'dark', network: 'online', motion: 'reduced' },
  parameters: mockInterest(true, false, true),
};

function mockInterest(initiallyInterested: boolean, failSave = false, finished = false, enabled = true) {
  let interested = initiallyInterested;
  return { msw: { handlers: { graphql: [http.post('/api/graphql', async ({ request }) => {
    const { query, variables } = await request.json() as {
      query: string;
      variables: { targetId: string; targetType: string; interested?: boolean };
    };
    await delay(100);
    const mutation = query.includes('SetCurrentUserInterest');
    if (mutation && failSave) return HttpResponse.json({ errors: [{ message: 'Falha de conexão.' }] });
    if (mutation) interested = variables.interested === true;
    const key = variables.targetType === 'MAJOR_EVENT' ? 'majorEventId'
      : variables.targetType === 'EVENT_GROUP' ? 'eventGroupId' : 'eventId';
    const record = interested ? createPublicEventInterest({ [key]: variables.targetId }) : null;
    if (query.includes('CurrentUserInterestState')) {
      return HttpResponse.json({ data: { currentUserInterestState: {
        interest: record, subscribed: false, endsAt: publicFixtureDateFromNow(finished ? -1 : 1), enabled,
      } } });
    }
    return HttpResponse.json({ data: { [mutation ? 'setCurrentUserInterest' : 'currentUserInterest']: record } });
  })] } } };
}
