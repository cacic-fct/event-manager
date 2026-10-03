import {
  createTicketPersonSummary,
  createTicketTransfer,
  createTicketTransferLists,
} from '@cacic-fct/shared-ticketing/testing';
import type { TicketPersonSummary, TicketTransfer } from '@cacic-fct/shared-ticketing';
import { createWalletStoryTicket } from '../wallet/testing/wallet-story-fixtures';

export const ticketStorySender: TicketPersonSummary = {
  ...createTicketPersonSummary({ personId: 'person-ticket-sender' }),
};

export const ticketStoryReceiver: TicketPersonSummary = {
  ...createTicketPersonSummary({
    personId: 'person-ticket-receiver',
    fullName: 'João Pedro Oliveira',
    firstName: 'João',
    redactedIdentityDocument: 'XK1234567',
  }),
};

export function createTicketStoryTransfer(overrides: Partial<TicketTransfer> = {}): TicketTransfer {
  const ticket = overrides.ticket ?? createWalletStoryTicket();
  return createTicketTransfer({
    ...overrides,
    ticket,
    sender: overrides.sender === undefined ? ticketStorySender : overrides.sender,
    recipient: overrides.recipient === undefined ? ticketStoryReceiver : overrides.recipient,
  });
}

export const createTicketStoryTransferLists = createTicketTransferLists;
