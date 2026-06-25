import { HttpResponse, delay, http } from 'msw';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { WorkspacePermissionsService } from '../../../shared/services/workspace-permissions.service';
import { WorkspaceGlobalOperationsTabComponent } from './workspace-global-operations-tab.component';

type GlobalOperationsStoryArgs = {
  configCount: number;
  certificateCount: number;
  slowResponse: boolean;
  canReissue: boolean;
};

let activeArgs: GlobalOperationsStoryArgs = {
  configCount: 4,
  certificateCount: 138,
  slowResponse: false,
  canReissue: true,
};

const meta: Meta<GlobalOperationsStoryArgs> = {
  component: WorkspaceGlobalOperationsTabComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Global Operations/Workspace Global Operations Tab',
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: WorkspacePermissionsService,
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
    slowResponse: { control: 'boolean' },
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
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          const body = (await request.json()) as { query?: string };

          if (body.query?.includes('ReissueAllCertificates')) {
            if (activeArgs.slowResponse) {
              await delay(1200);
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
    slowResponse: true,
    configCount: 8,
    certificateCount: 420,
  },
};

export const WithoutPermission: Story = {
  args: {
    canReissue: false,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Escopo amplo')).toBeVisible();
    await expect(canvas.queryByRole('button', { name: /reemitir certificados/i })).not.toBeInTheDocument();
  },
};
