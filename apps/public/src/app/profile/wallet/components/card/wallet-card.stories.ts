import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { WalletCard } from './wallet-card';
import { type WalletCardKind, type WalletCardUser } from './wallet-card.types';
import { createWalletStoryTotpSession, createWalletStoryUser } from '../../testing/wallet-story-fixtures';
import { createWalletStoryTicket } from '../../testing/wallet-story-fixtures';
import type { WalletTicket } from '@cacic-fct/shared-ticketing';

type WalletCardStoryArgs = {
  kind: WalletCardKind;
  user: WalletCardUser;
  ticket: WalletTicket | null;
  selectionId: string | null;
};

const meta: Meta<WalletCardStoryArgs> = {
  component: WalletCard,
  title: 'Public/Profile/Wallet/Card',
  tags: ['autodocs', 'ticketing'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: TotpSeedSessionService,
          useValue: {
            ...createWalletStoryTotpSession(),
          },
        },
      ],
    }),
  ],
  args: {
    kind: 'eventos',
    user: createWalletStoryUser(),
    ticket: null,
    selectionId: null,
  },
  argTypes: {
    kind: { control: 'select', options: ['eventos', 'offline-code', 'academic-record'] },
    user: { control: 'object' },
    ticket: { control: 'object' },
    selectionId: { control: 'text' },
  },
};

export default meta;

type Story = StoryObj<WalletCardStoryArgs>;

export const Playground: Story = {
  args: {},
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('CACiC Eventos')).toBeVisible();
    await expect(canvas.getByText('Marina da Silva')).toBeVisible();
  },
};

export const LongName: Story = {
  args: {
    user: createWalletStoryUser({
      userId: 'wallet-story-long-name',
      name: 'Ana Carolina de Almeida e Souza',
      unespRole: 'professor-substituto',
      enrollmentNumber: '',
    }),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Ana Carolina de Almeida e Souza')).toBeVisible();
  },
};

export const OfflineCode: Story = {
  args: { kind: 'offline-code' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/código off-line/i)).toBeVisible();
  },
};

export const AcademicRecord: Story = {
  args: { kind: 'academic-record' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/registro acadêmico/i)).toBeVisible();
  },
};

export const EventTicket: Story = {
  args: {
    ticket: createWalletStoryTicket(),
    selectionId: 'ticket:018f47a1-3d5b-7abc-8def-0123456789ab',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Festa de encerramento')).toBeVisible();
    await expect(canvas.getByText('Marina da Silva')).toBeVisible();
    await expect(canvas.getByRole('img', { name: 'Código do bilhete' })).toBeVisible();
  },
};
