import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { ErrorStateComponent } from './error-state.component';
import { expect, userEvent, within } from 'storybook/test';

const meta: Meta<ErrorStateComponent> = {
  title: 'Shared/Feedback/Error State',
  component: ErrorStateComponent,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: { status: 403, actionLabel: 'Ir para a página inicial', actionUrl: '/' },
  argTypes: {
    status: { control: 'select', options: [403, 404, 500, 503], description: 'HTTP status represented by the error state.' },
    title: { control: 'text', description: 'Override the default error heading.' },
    description: { control: 'text', description: 'Override the supporting error message.' },
    actionLabel: { control: 'text', description: 'Label for the primary action.' },
    actionUrl: { control: 'text', description: 'Router destination for the primary action.' },
    actionHref: { control: 'text', description: 'External URL for the primary action.' },
    technicalDetails: { control: 'text', description: 'Technical details available to the user.' },
    retryLabel: { control: 'text', description: 'Label for a retry action.' },
  },
  parameters: { a11y: { test: 'error' }, msw: { handlers: { graphql: null, rest: null } } },
  globals: { network: 'online' },
};
export default meta;
type Story = StoryObj<ErrorStateComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Você não tem acesso a esta página.' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Ir para a página inicial' })).toBeVisible();
    await userEvent.click(canvas.getByText('Detalhes técnicos'));
    await expect(canvas.getByText(/"statusCode": 403/)).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Copiar detalhes técnicos' })).toBeVisible();
  },
};
export const NotFound: Story = { args: { status: 404 } };
export const ServerError: Story = { args: { status: 500 } };
export const Unavailable: Story = { args: { status: 503, retryLabel: 'Tentar novamente' } };
export const WorkspacePermission: Story = {
  args: {
    status: 403,
    title: 'Você não tem acesso à gestão deste evento.',
    description: 'Sua conta não tem permissão para abrir esta área. Volte para os eventos disponíveis.',
    actionLabel: 'Voltar para eventos',
    actionUrl: '/events',
    technicalDetails: '{"statusCode":403,"code":"workspace_access_denied"}',
  },
};
export const LongContent: Story = {
  args: {
    title: 'Não foi possível abrir esta área de gestão com as permissões atuais da sua conta.',
    description: 'Volte para os eventos disponíveis para continuar. Caso precise acessar esta área, fale com a organização do evento.',
    actionLabel: 'Voltar para os eventos disponíveis',
    technicalDetails: JSON.stringify({ statusCode: 403, code: 'workspace_access_denied', requestId: 'storybook-example-request-reference' }, null, 2),
  },
};
