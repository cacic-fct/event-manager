// These identifiers must match the workflows published in each Novu environment.
export const NOVU_WORKFLOW_IDENTIFIERS = {
  majorEventSubscriptionStatusChanged: 'major-event-subscription-status-changed',
  offlineAttendanceReviewQueued: 'offline-attendance-review-queued',
  certificateAvailable: 'certificate-available',
  eventFormAvailable: 'event-form-available',
  audienceInvitation: 'audience-invitation',
  ticketTransfer: 'ticket-transfer',
  eventSubscriberInformation: 'event-subscriber-information',
  onlineAttendanceAvailable: 'online-attendance-available',
  prizeDrawWinner: 'prize-draw-winner',
  prizeDrawUndone: 'prize-draw-undone',
} as const;
