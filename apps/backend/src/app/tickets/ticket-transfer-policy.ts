import { TicketTransferIgnoreReason, TicketTransferRecipientStatus } from '@prisma/client';

export type RecipientResolutionFacts = {
  personFound: boolean;
  hasUserAccount: boolean;
  alreadyHoldsTicket: boolean;
  eligible: boolean;
};

export type RecipientResolution = {
  status: TicketTransferRecipientStatus;
  ignoreReason: TicketTransferIgnoreReason | null;
  notifyRecipient: boolean;
};

export const INITIAL_IMMEDIATE_START_ATTEMPTS = 2;
export const INITIAL_START_DELAY_MS = 5_000;
export const MAX_START_DELAY_MS = 24 * 60 * 60 * 1_000;

/** Recipient results are internal; callers must never return them to the sending user. */
export function classifyRecipientResolution(facts: RecipientResolutionFacts): RecipientResolution {
  if (!facts.personFound || !facts.hasUserAccount) {
    return {
      status: TicketTransferRecipientStatus.SYSTEM_INELIGIBLE,
      ignoreReason: TicketTransferIgnoreReason.INELIGIBLE,
      notifyRecipient: false,
    };
  }

  if (facts.alreadyHoldsTicket) {
    return {
      status: TicketTransferRecipientStatus.SYSTEM_DUPLICATE,
      ignoreReason: TicketTransferIgnoreReason.ALREADY_HELD,
      notifyRecipient: false,
    };
  }

  if (!facts.eligible) {
    return {
      status: TicketTransferRecipientStatus.SYSTEM_INELIGIBLE,
      ignoreReason: TicketTransferIgnoreReason.INELIGIBLE,
      notifyRecipient: true,
    };
  }

  return {
    status: TicketTransferRecipientStatus.PENDING,
    ignoreReason: null,
    notifyRecipient: true,
  };
}

/** Delay is based on the author's previous submissions, across every ticket. */
export function transferStartDelayMs(previousSubmissionCount: number): number {
  const count = Math.max(0, Math.trunc(previousSubmissionCount));
  if (count < INITIAL_IMMEDIATE_START_ATTEMPTS) return 0;
  return Math.min(
    MAX_START_DELAY_MS,
    INITIAL_START_DELAY_MS * 2 ** Math.min(count - INITIAL_IMMEDIATE_START_ATTEMPTS, 15),
  );
}

export function transferStartAvailableAt(submittedAt: Date, previousSubmissionCount: number): Date {
  return new Date(submittedAt.getTime() + transferStartDelayMs(previousSubmissionCount));
}
