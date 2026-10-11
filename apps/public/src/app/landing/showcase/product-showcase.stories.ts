import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ProductShowcaseComponent } from './product-showcase';

const meta: Meta<ProductShowcaseComponent> = {
  component: ProductShowcaseComponent,
  title: 'Public/Landing/Demos/Product Overview',
  tags: ['autodocs', 'landing-showcase'],
  parameters: { controls: { disable: true }, layout: 'fullscreen', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<ProductShowcaseComponent>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const participantRegion = canvas.getByRole('region', { name: 'Você participa. Tudo se conecta.' });
    participantRegion.scrollIntoView();
    const participant = within(participantRegion);
    await expect(await participant.findByRole('button', { name: 'Meu dia' })).toHaveAttribute('aria-pressed', 'true');
    await expect(participant.getByRole('heading', { name: 'Boa tarde, Marina.' })).toBeVisible();

    const organizerRegion = canvas.getByRole('region', { name: /Você organiza\s*com tudo à mão\./ });
    organizerRegion.scrollIntoView();
    await expect(await within(organizerRegion).findByRole('button', { name: 'Painel inteligente' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};

export const OrganizerExperience: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: /Você organiza\s*com tudo à mão\./ });
    region.scrollIntoView();
    const canvas = within(region);
    await userEvent.click(await canvas.findByRole('button', { name: 'Presenças' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Marcar como presente' }));
    await expect(canvas.getByRole('heading', { name: 'Rafael Almeida' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Certificados' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Emitir certificados pendentes' }));
    await expect(await canvas.findByText('Certificados disponíveis')).toBeVisible();
  },
};

export const InvalidAttendanceCode: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: 'Você participa. Tudo se conecta.' });
    region.scrollIntoView();
    const canvas = within(region);
    await userEvent.click(await canvas.findByRole('button', { name: 'Autorregistro' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Código de presença' }), 'AB12');
    await userEvent.click(canvas.getByRole('button', { name: 'Confirmar presença' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('Código não encontrado. Experimente KC1C.');
  },
};

export const PendingReceipt: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: 'Você participa. Tudo se conecta.' });
    region.scrollIntoView();
    const canvas = within(region);
    await userEvent.click(await canvas.findByRole('button', { name: /Envie seu comprovante/ }));
    await expect(await canvas.findByRole('heading', { name: 'Jornada de Inovação' })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Enviar comprovante' })).toBeDisabled();
  },
};

export const AutomaticCodeEntry: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: 'Você participa. Tudo se conecta.' });
    region.scrollIntoView();
    const canvas = within(region);
    await userEvent.click(await canvas.findByRole('button', { name: 'Autorregistro' }));
    await waitFor(async () => {
      await expect(canvas.getByRole('textbox', { name: 'Código de presença' })).toHaveValue('KC1C');
    }, { timeout: 3000 });
    await expect(canvas.queryByRole('heading', { name: 'Presença confirmada.' })).not.toBeInTheDocument();
  },
};

export const NotificationDestinations: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: 'Você participa. Tudo se conecta.' });
    region.scrollIntoView();
    const canvas = within(region);
    await userEvent.click(await canvas.findByRole('button', { name: 'Notificações' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Um bilhete para você' }));
    await expect(await canvas.findByRole('button', { name: 'Receber bilhete' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Notificações' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Seu certificado está disponível' }));
    await expect(await canvas.findByRole('button', { name: 'Baixar todos os certificados' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Notificações' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Falta enviar seu comprovante' }));
    await expect(await canvas.findByRole('button', { name: 'Escolher comprovante' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Notificações' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Seu próximo minicurso' }));
    await expect(await canvas.findByRole('heading', { name: 'Realidade Virtual' })).toBeVisible();
  },
};

export const OrganizerTeamAndAudit: Story = {
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole('region', { name: /Você organiza\s*com tudo à mão\./ });
    region.scrollIntoView();
    const canvas = within(region);
    await userEvent.click(await canvas.findByRole('button', { name: 'Equipe e permissões' }));
    await userEvent.clear(await canvas.findByRole('textbox', { name: 'Nome do cargo' }));
    await userEvent.type(canvas.getByRole('textbox', { name: 'Nome do cargo' }), 'Recepção');
    await userEvent.click(canvas.getByRole('button', { name: 'Criar cargo' }));
    await expect(await canvas.findByText('Cargo criado')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Histórico de alterações' }));
    await userEvent.click(await canvas.findByRole('button', { name: /Evento atualizado pelo painel administrativo/ }));
    await expect(await canvas.findByRole('heading', { name: 'Campos alterados' })).toBeVisible();
  },
};
