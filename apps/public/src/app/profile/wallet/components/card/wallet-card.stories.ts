import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { TotpSeedSessionService } from '../../../../shared/totp/totp-seed-session.service';
import { WalletCard } from './wallet-card';
import { type WalletCardKind, type WalletCardUser } from './wallet-card.types';
import { createWalletStoryTotpSession, createWalletStoryUser } from '../../testing/wallet-story-fixtures';

type WalletCardStoryArgs = {
  kind: WalletCardKind;
  restaurantNumber: string;
  user: WalletCardUser;
};

const meta: Meta<WalletCardStoryArgs> = {
  component: WalletCard,
  title: 'Public/Profile/Wallet/Card',
  tags: ['autodocs'],
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
    restaurantNumber: '000123456',
    user: createWalletStoryUser(),
  },
  argTypes: {
    kind: { control: 'select', options: ['eventos', 'offline-code', 'academic-record', 'restaurant'] },
    restaurantNumber: { control: 'text' },
    user: { control: 'object' },
  },
};

export default meta;

type Story = StoryObj<WalletCardStoryArgs>;

export const Student: Story = {
  args: {},
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
};

export const OfflineCode: Story = {
  args: { kind: 'offline-code' },
};

export const AcademicRecord: Story = {
  args: { kind: 'academic-record' },
};

export const Restaurant: Story = {
  args: { kind: 'restaurant' },
};
