import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PermissionsService } from '../permissions/permissions.service';
import { GlobalOperationsPageComponent } from './global-operations-page.component';

type GlobalOperationsStoryArgs = {
  configCount: number;
  certificateCount: number;
  operationState: 'ready' | 'loading' | 'error';
  latencyMs: number;
  canReissue: boolean;
};

let activeArgs: GlobalOperationsStoryArgs = {
  configCount: 4,
  certificateCount: 138,
  operationState: 'ready',
  latencyMs: 120,
  canReissue: true,
};

const meta: Meta<GlobalOperationsStoryArgs> = {
  component: GlobalOperationsPageComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Global Operations/Workspace Global Operations Tab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: PermissionsService,
          useValue: {
            canEdit: () => activeArgs.canReissue,
            has: () => activeArgs.canReissue,
          },
        },
      ],
    }),
  ],
  args: activeArgs,
  argTypes: {
    configCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    certificateCount: { control: { type: 'range', min: 0, max: 500, step: 1 } },
    operationState: { control: 'inline-radio', options: ['ready', 'loading', 'error'] },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    canReissue: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = args;
    return { props: args };
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    msw: {
      handlers: {
        graphql: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as { query?: string };

          if (body.query?.includes('ReissueAllCertificates')) {
            if (activeArgs.operationState === 'loading') await delay('infinite');
            if (activeArgs.latencyMs > 0) await delay(activeArgs.latencyMs);
            if (activeArgs.operationState === 'error') {
              return HttpResponse.json({ errors: [{ message: 'Não foi possível reemitir os certificados.' }] });
            }
            return HttpResponse.json({
              data: {
                reissueAllCertificates: {
                  configCount: activeArgs.configCount,
                  certificateCount: activeArgs.certificateCount,
                },
              },
            });
          }

          return HttpResponse.json({ data: {} });
        }),
        ],
      },
    },
  },
};

export default meta;

type Story = StoryObj<GlobalOperationsStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Reemissão global de certificados')).toBeVisible();
    await expect(await canvas.findByText('Escopo amplo')).toBeVisible();
    const reissueButton = await canvas.findByRole('button', { name: /reemitir certificados/i });
    await userEvent.hover(reissueButton);
    await expect(within(document.body).queryByText('Reemitir todos os certificados?')).not.toBeInTheDocument();
  },
};

export const SlowReissue: Story = {
  args: {
    latencyMs: 1_500,
    configCount: 8,
    certificateCount: 420,
  },
};

export const ZeroResult: Story = {
  args: { configCount: 0, certificateCount: 0, latencyMs: 0 },
};

export const LargeResult: Story = {
  args: { configCount: 20, certificateCount: 500, latencyMs: 0 },
};

export const OperationLoading: Story = {
  args: { operationState: 'loading', latencyMs: 0 },
};

export const OperationError: Story = {
  args: { operationState: 'error', latencyMs: 0 },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const WithoutPermission: Story = {
  globals: { theme: 'dark', motion: 'reduced' },
  args: {
    canReissue: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Escopo amplo')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /reemitir certificados/i })).not.toBeInTheDocument();
  },
};
