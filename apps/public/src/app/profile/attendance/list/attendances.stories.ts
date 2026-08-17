import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig, type Decorator } from '@storybook/angular';
import { NEVER, of, throwError } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { NetworkStatusService } from '../../../shared/network-status.service';
import { AttendancesApiService } from '../attendances-api.service';
import {
  AttendancesStoryControls,
  attendancesStoryControlArgTypes,
  attendancesStoryDefaultControls,
  createAttendancesStoryFeed,
} from './attendances-story.fixtures';
import { Attendances } from './attendances';

const withStoryData: Decorator<AttendancesStoryControls> = (story, context) => {
  const args = { ...attendancesStoryDefaultControls, ...context.args };
  const feed = createAttendancesStoryFeed(args);
  const failCache = args.state === 'error';

  return applicationConfig({
    providers: [
      {
        provide: NetworkStatusService,
        useValue: { isOnline: () => args.state !== 'offline' },
      },
      {
        provide: AttendancesApiService,
        useValue: {
          getSubscriptionsFeed: () =>
            args.state === 'loading'
              ? NEVER
              : args.state === 'error'
                ? throwError(() => new Error('Não foi possível carregar suas inscrições.'))
                : of(feed),
          downloadCurrentUserCertificatesArchive: () =>
            of({ blob: new Blob(['storybook']), fileName: 'certificados-storybook.zip' }),
        },
      },
      {
        provide: PublicDataAccessService,
        useValue: {
          replaceAttendanceFeed: async () => undefined,
          getAttendanceFeed: async () => {
            if (failCache) {
              throw new Error('Não foi possível carregar suas inscrições.');
            }
            return feed;
          },
          getLatestUserSnapshot: async () => ({ userId: 'storybook-user' }),
          purgeUserData: async () => undefined,
        },
      },
    ],
  })(story, context);
};

const meta: Meta<AttendancesStoryControls> = {
  component: Attendances,
  title: 'CACiC Eventos/Profile/Attendance/List',
  tags: ['autodocs'],
  args: attendancesStoryDefaultControls,
  argTypes: attendancesStoryControlArgTypes,
  decorators: [withStoryData],
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
    docs: {
      description: {
        component:
          'Participation feed with editable online/offline cache states, mixed participation roles, attendance, and standalone certificates.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<AttendancesStoryControls>;

export const Playground: Story = {
  globals: { theme: 'light', network: 'online' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Participações' })).toBeVisible();
    await expect(await canvas.findByRole('heading', { name: 'Certificados avulsos' })).toBeVisible();
    await expect((await canvas.findAllByRole('link')).length).toBeGreaterThan(10);
  },
};

export const DenseMixedFeed: Story = {
  args: { majorEventCount: 20, eventCount: 40, certificateFolderCount: 12 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findAllByRole('link', {}, { timeout: 5_000 })).length).toBeGreaterThan(40);
    await expect(canvas.getAllByRole('button', { name: /Abrir certificados avulsos/ })).toHaveLength(12);
  },
};

export const Empty: Story = {
  args: { majorEventCount: 0, eventCount: 0, certificateFolderCount: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Nenhuma participação encontrada.')).toBeVisible();
    await expect(canvas.getByText('Nenhum certificado avulso disponível.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByLabelText('Carregando participações')).toBeVisible();
  },
};

export const LoadError: Story = {
  args: { state: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar suas inscrições.')).toBeVisible();
  },
};

export const OfflineCache: Story = {
  args: { state: 'offline', eventCount: 16, majorEventCount: 6 },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByRole('link')).length).toBeGreaterThan(15);
  },
};

export const FilteredPresent: Story = {
  args: { eventCount: 20, majorEventCount: 8, attendanceEvery: 2 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Filtros' }));
    await userEvent.click(await canvas.findByRole('button', { name: 'Presença registrada' }));
    await expect(canvas.getAllByRole('link').length).toBeGreaterThan(5);
  },
};

export const LongContentTablet: Story = {
  args: { longNames: true, eventCount: 18, majorEventCount: 8, certificateFolderCount: 4 },
  parameters: { viewport: { defaultViewport: 'tablet' } },
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect((await within(canvasElement).findAllByText(/interdisciplinar/)).length).toBeGreaterThan(8);
  },
};
