import { OfflineTotpSeedRecord } from '@cacic-fct/public-indexed-db';
import { WalletCardUser } from '../components/card/wallet-card.types';

export const walletStoryUser: WalletCardUser = {
  userId: 'wallet-story-user',
  name: 'Marina da Silva',
  picture: null,
  unespRole: 'aluno-graduacao',
  enrollmentNumber: '00123456',
  identityDocument: '52998224725',
};

export function createWalletStoryUser(overrides: Partial<WalletCardUser> = {}): WalletCardUser {
  return { ...walletStoryUser, ...overrides };
}

export function createWalletStoryTotpSeed(): OfflineTotpSeedRecord {
  return {
    userId: walletStoryUser.userId,
    primaryEmail: 'marina@unesp.br',
    seed: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    algorithm: 'SHA512',
    digits: 6,
    periodSeconds: 30,
    serverTime: new Date('2026-07-25T12:00:00.000Z').toISOString(),
    sessionExpiresAt: Date.now() + 60 * 60 * 1000,
    updatedAt: Date.now(),
  };
}

export function createWalletStoryTotpSession() {
  return {
    getWalletSeed: () => Promise.resolve(createWalletStoryTotpSeed()),
  };
}
