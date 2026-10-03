import { OfflineTotpSeedRecord } from '@cacic-fct/public-indexed-db';
import {
  createTicketEventSummary,
  createTicketPersonSummary,
  createWalletTicket,
  TICKET_FIXTURE_HOLDER_USER_ID,
} from '@cacic-fct/shared-ticketing/testing';
import type { WalletTicket } from '@cacic-fct/shared-ticketing';
import { WalletCardUser } from '../components/card/wallet-card.types';

export const walletStoryUser: WalletCardUser = {
  userId: TICKET_FIXTURE_HOLDER_USER_ID,
  name: 'Marina da Silva',
  picture: null,
  unespRole: 'aluno-graduacao',
  enrollmentNumber: '00123456',
  identityDocument: '52998224725',
};

export function createWalletStoryUser(overrides: Partial<WalletCardUser> = {}): WalletCardUser {
  return { ...walletStoryUser, ...overrides };
}

export function createWalletStoryTicket(overrides: Partial<WalletTicket> = {}): WalletTicket {
  const event = createTicketEventSummary({
    id: 'party-event',
    name: 'Festa de encerramento',
    emoji: '🎉',
    type: 'PARTY',
    ...overrides.event,
  });
  const ticket = createWalletTicket({ ...overrides, event });
  return {
    ...ticket,
    holder: overrides.holder === undefined
      ? createTicketPersonSummary({ personId: 'person-wallet-story' })
      : overrides.holder,
    aztecPayload: overrides.aztecPayload === undefined
      ? `ticket:${ticket.id}:${walletStoryUser.userId}`
      : overrides.aztecPayload,
  };
}

export function createWalletStoryTotpSeed(): OfflineTotpSeedRecord {
  return {
    userId: walletStoryUser.userId,
    primaryEmail: 'marina@unesp.br',
    seed: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    algorithm: 'SHA512',
    digits: 6,
    periodSeconds: 30,
    serverTime: new Date().toISOString(),
    sessionExpiresAt: Date.now() + 60 * 60 * 1000,
    updatedAt: Date.now(),
  };
}

export function createWalletStoryTotpSession() {
  return {
    getWalletSeed: () => Promise.resolve(createWalletStoryTotpSeed()),
  };
}
