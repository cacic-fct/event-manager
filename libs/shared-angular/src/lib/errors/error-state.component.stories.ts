import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { provideRouter } from '@angular/router';
import { ErrorStateComponent } from './error-state.component';
import { expect, userEvent, within } from 'storybook/test';

const meta: Meta<ErrorStateComponent> = {
  title: 'Shared/Error state',
  component: ErrorStateComponent,
  decorators: [applicationConfig({ providers: [provideRouter([])] })],
  args: { status: 403, actionLabel: 'Ir para a página inicial', actionUrl: '/' },
  argTypes: {
    status: { control: 'select', options: [403, 404, 500, 503] },
    title: { control: 'text' },
    description: { control: 'text' },
    actionLabel: { control: 'text' },
    actionUrl: { control: 'text' },
    actionHref: { control: 'text' },
    technicalDetails: { control: 'text' },
    retryLabel: { control: 'text' },
  },
  parameters: { a11y: { test: 'error' }, msw: { handlers: { graphql: null, rest: null } } },
  globals: { theme: 'light', network: 'online' },
};
export default meta;
type Story = StoryObj<ErrorStateComponent>;

export const Forbidden: Story = {
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
export const DarkTheme: Story = { globals: { theme: 'dark', network: 'online' } };
export const LongContentMobile: Story = {
  args: {
    title: 'Não foi possível abrir esta área de gestão com as permissões atuais da sua conta.',
    description: 'Volte para os eventos disponíveis para continuar. Caso precise acessar esta área, fale com a organização do evento.',
    actionLabel: 'Voltar para os eventos disponíveis',
    technicalDetails: JSON.stringify({ statusCode: 403, code: 'workspace_access_denied', requestId: 'storybook-example-request-reference' }, null, 2),
  },
  globals: { theme: 'light', network: 'online', viewport: { value: 'mobile', isRotated: false } },
  parameters: {
    viewport: { options: { mobile: { name: 'Mobile', styles: { width: '390px', height: '844px' }, type: 'mobile' } } },
  },
};
