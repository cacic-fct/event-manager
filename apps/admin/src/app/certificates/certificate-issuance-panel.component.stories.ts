import { componentWrapperDecorator, type Meta, type StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { CertificateIssuanceRun } from '@cacic-fct/event-manager-admin-contracts';
import { CertificateIssuancePanelComponent } from './certificate-issuance-panel.component';

const now = new Date();
const run: CertificateIssuanceRun = {
  id: 'issuance-story',
  configId: 'config-story',
  status: 'PENDING',
  scheduledAt: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
  reissue: false,
  notifyRecipients: true,
  automatic: false,
  createdAt: now.toISOString(),
  certificateCount: 0,
};

const meta: Meta<CertificateIssuancePanelComponent> = {
  title: 'Admin/Settings/Certificates/Issuance',
  component: CertificateIssuancePanelComponent,
  tags: ['autodocs'],
  decorators: [
    componentWrapperDecorator(
      (story) => `<main><h1>Certificados</h1><h2>Certificado de participação</h2>${story}</main>`,
    ),
  ],
  args: {
    saved: true,
    enabled: true,
    canIssue: true,
    canReissue: true,
    issuanceRequested: fn(),
    cancelRequested: fn(),
    refreshRequested: fn(),
  },
  parameters: { a11y: { test: 'error' }, layout: 'padded' },
};
export default meta;
type Story = StoryObj<CertificateIssuancePanelComponent>;

export const IssueNow: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Emitir e publicar agora' }));
    await expect(args.issuanceRequested).toHaveBeenCalledWith({
      scheduledAt: undefined,
      reissue: false,
      notifyRecipients: true,
    });
  },
};
export const ManualRecipients: Story = { args: { manual: true } };
export const Scheduled: Story = { args: { runs: [run] } };
export const ScheduledWithoutNotifications: Story = { args: { runs: [{ ...run, notifyRecipients: false }] } };
export const Processing: Story = { args: { runs: [{ ...run, status: 'PROCESSING', startedAt: now.toISOString() }] } };
export const Completed: Story = {
  args: { runs: [{ ...run, status: 'COMPLETED', certificateCount: 42, completedAt: now.toISOString() }] },
};
export const Failed: Story = {
  args: { runs: [{ ...run, status: 'FAILED', error: 'A configuração foi alterada. Solicite uma nova emissão.' }] },
};
export const LoadingFailure: Story = {
  args: { loadError: 'Não foi possível carregar o status. Tente atualizar o status.' },
};
