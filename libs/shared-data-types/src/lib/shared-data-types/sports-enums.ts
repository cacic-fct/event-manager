import { registerEnumType } from '@nestjs/graphql';

export const SportsTournamentStatus = {
  DRAFT: 'DRAFT',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  LIVE: 'LIVE',
  FINISHED: 'FINISHED',
  CANCELED: 'CANCELED',
} as const;
export type SportsTournamentStatus = (typeof SportsTournamentStatus)[keyof typeof SportsTournamentStatus];
registerEnumType(SportsTournamentStatus, { name: 'SportsTournamentStatus' });

export const SportsScoringMode = {
  PER_SPORT: 'PER_SPORT',
  OVERALL: 'OVERALL',
  BOTH: 'BOTH',
} as const;
export type SportsScoringMode = (typeof SportsScoringMode)[keyof typeof SportsScoringMode];
registerEnumType(SportsScoringMode, { name: 'SportsScoringMode' });

export const SportsCategoryStatus = {
  DRAFT: 'DRAFT',
  REGISTRATION_OPEN: 'REGISTRATION_OPEN',
  REGISTRATION_CLOSED: 'REGISTRATION_CLOSED',
  ACTIVE: 'ACTIVE',
  FINISHED: 'FINISHED',
  CANCELED: 'CANCELED',
} as const;
export type SportsCategoryStatus = (typeof SportsCategoryStatus)[keyof typeof SportsCategoryStatus];
registerEnumType(SportsCategoryStatus, { name: 'SportsCategoryStatus' });

export const SportsFormat = {
  SINGLE_ELIMINATION: 'SINGLE_ELIMINATION',
  ROUND_ROBIN: 'ROUND_ROBIN',
  GROUP_STAGE_ELIMINATION: 'GROUP_STAGE_ELIMINATION',
  DOUBLE_ELIMINATION: 'DOUBLE_ELIMINATION',
  SWISS: 'SWISS',
  CUSTOM: 'CUSTOM',
} as const;
export type SportsFormat = (typeof SportsFormat)[keyof typeof SportsFormat];
registerEnumType(SportsFormat, { name: 'SportsFormat' });

export const SportsPreset = {
  SOCCER: 'SOCCER',
  FUTSAL: 'FUTSAL',
  TENNIS: 'TENNIS',
  BASKETBALL: 'BASKETBALL',
  ESPORTS: 'ESPORTS',
  CHESS: 'CHESS',
  VOLLEYBALL: 'VOLLEYBALL',
  SWIMMING: 'SWIMMING',
  TABLE_TENNIS: 'TABLE_TENNIS',
  HANDBALL: 'HANDBALL',
  OTHER: 'OTHER',
} as const;
export type SportsPreset = (typeof SportsPreset)[keyof typeof SportsPreset];
registerEnumType(SportsPreset, { name: 'SportsPreset' });

export const SportsAthleteIdentifierMode = {
  SHIRT_NUMBER: 'SHIRT_NUMBER',
  GAME_ACCOUNT: 'GAME_ACCOUNT',
} as const;
export type SportsAthleteIdentifierMode =
  (typeof SportsAthleteIdentifierMode)[keyof typeof SportsAthleteIdentifierMode];
registerEnumType(SportsAthleteIdentifierMode, { name: 'SportsAthleteIdentifierMode' });

export const SportsTeamStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type SportsTeamStatus = (typeof SportsTeamStatus)[keyof typeof SportsTeamStatus];
registerEnumType(SportsTeamStatus, { name: 'SportsTeamStatus' });

export const SportsParticipantStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type SportsParticipantStatus = (typeof SportsParticipantStatus)[keyof typeof SportsParticipantStatus];
registerEnumType(SportsParticipantStatus, { name: 'SportsParticipantStatus' });

export const SportsParticipantSource = {
  ADMIN: 'ADMIN',
  TEAM_ASSIGNMENT: 'TEAM_ASSIGNMENT',
  SELF_SUBSCRIPTION: 'SELF_SUBSCRIPTION',
} as const;
export type SportsParticipantSource = (typeof SportsParticipantSource)[keyof typeof SportsParticipantSource];
registerEnumType(SportsParticipantSource, { name: 'SportsParticipantSource' });

export const SportsPaymentStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  UNDER_REVIEW: 'UNDER_REVIEW',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
} as const;
export type SportsPaymentStatus = (typeof SportsPaymentStatus)[keyof typeof SportsPaymentStatus];
registerEnumType(SportsPaymentStatus, { name: 'SportsPaymentStatus' });

export const SportsTeamMemberStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type SportsTeamMemberStatus = (typeof SportsTeamMemberStatus)[keyof typeof SportsTeamMemberStatus];
registerEnumType(SportsTeamMemberStatus, { name: 'SportsTeamMemberStatus' });

export const SportsRosterRole = {
  PLAYER: 'PLAYER',
  CAPTAIN: 'CAPTAIN',
  COACH: 'COACH',
} as const;
export type SportsRosterRole = (typeof SportsRosterRole)[keyof typeof SportsRosterRole];
registerEnumType(SportsRosterRole, { name: 'SportsRosterRole' });

export const SportsEligibilityStatus = {
  PENDING: 'PENDING',
  ELIGIBLE: 'ELIGIBLE',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  INELIGIBLE: 'INELIGIBLE',
} as const;
export type SportsEligibilityStatus = (typeof SportsEligibilityStatus)[keyof typeof SportsEligibilityStatus];
registerEnumType(SportsEligibilityStatus, { name: 'SportsEligibilityStatus' });

export const SportsRegistrationStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  ACTIVE: 'ACTIVE',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type SportsRegistrationStatus = (typeof SportsRegistrationStatus)[keyof typeof SportsRegistrationStatus];
registerEnumType(SportsRegistrationStatus, { name: 'SportsRegistrationStatus' });

export const SportsTeamChangeRequestStatus = {
  PENDING: 'PENDING',
  CONFLICT: 'CONFLICT',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  SUPERSEDED: 'SUPERSEDED',
} as const;
export type SportsTeamChangeRequestStatus =
  (typeof SportsTeamChangeRequestStatus)[keyof typeof SportsTeamChangeRequestStatus];
registerEnumType(SportsTeamChangeRequestStatus, { name: 'SportsTeamChangeRequestStatus' });

export const SportsTeamChangeRequestType = {
  TEAM_DETAILS: 'TEAM_DETAILS',
  MEMBER_ADD: 'MEMBER_ADD',
  MEMBER_UPDATE: 'MEMBER_UPDATE',
  MEMBER_REMOVE: 'MEMBER_REMOVE',
  LOGO: 'LOGO',
  REPRESENTATIVE: 'REPRESENTATIVE',
  CATEGORY_ROLE: 'CATEGORY_ROLE',
  LINEUP: 'LINEUP',
} as const;
export type SportsTeamChangeRequestType =
  (typeof SportsTeamChangeRequestType)[keyof typeof SportsTeamChangeRequestType];
registerEnumType(SportsTeamChangeRequestType, { name: 'SportsTeamChangeRequestType' });

export const SportsIdentityType = {
  IDENTITY_DOCUMENT: 'IDENTITY_DOCUMENT',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
} as const;
export type SportsIdentityType = (typeof SportsIdentityType)[keyof typeof SportsIdentityType];
registerEnumType(SportsIdentityType, { name: 'SportsIdentityType' });

export const SportsIdentityClaimStatus = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  NOT_FOUND: 'NOT_FOUND',
  AMBIGUOUS: 'AMBIGUOUS',
  REJECTED: 'REJECTED',
} as const;
export type SportsIdentityClaimStatus = (typeof SportsIdentityClaimStatus)[keyof typeof SportsIdentityClaimStatus];
registerEnumType(SportsIdentityClaimStatus, { name: 'SportsIdentityClaimStatus' });

export const SportsOfficialRole = {
  REFEREE: 'REFEREE',
  INTERMEDIATOR: 'INTERMEDIATOR',
  SCOREKEEPER: 'SCOREKEEPER',
} as const;
export type SportsOfficialRole = (typeof SportsOfficialRole)[keyof typeof SportsOfficialRole];
registerEnumType(SportsOfficialRole, { name: 'SportsOfficialRole' });

export const SportsMatchState = {
  SCHEDULED: 'SCHEDULED',
  CHECK_IN: 'CHECK_IN',
  LIVE: 'LIVE',
  PAUSED: 'PAUSED',
  AWAITING_REVIEW: 'AWAITING_REVIEW',
  CANCELED: 'CANCELED',
  DRAW: 'DRAW',
  FINISHED: 'FINISHED',
} as const;
export type SportsMatchState = (typeof SportsMatchState)[keyof typeof SportsMatchState];
registerEnumType(SportsMatchState, { name: 'SportsMatchState' });

export const SportsReviewStatus = {
  NOT_REQUIRED: 'NOT_REQUIRED',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
} as const;
export type SportsReviewStatus = (typeof SportsReviewStatus)[keyof typeof SportsReviewStatus];
registerEnumType(SportsReviewStatus, { name: 'SportsReviewStatus' });

export const SportsMatchActionType = {
  CHECK_IN: 'CHECK_IN',
  START: 'START',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  SCORE_DELTA: 'SCORE_DELTA',
  SCORE_CORRECTION: 'SCORE_CORRECTION',
  PERIOD_ROLL: 'PERIOD_ROLL',
  TIMER_RECONCILE: 'TIMER_RECONCILE',
  OCCURRENCE: 'OCCURRENCE',
  FINALIZE: 'FINALIZE',
  CANCEL: 'CANCEL',
  RESCHEDULE: 'RESCHEDULE',
  FORFEIT: 'FORFEIT',
  RESET: 'RESET',
} as const;
export type SportsMatchActionType = (typeof SportsMatchActionType)[keyof typeof SportsMatchActionType];
registerEnumType(SportsMatchActionType, { name: 'SportsMatchActionType' });

export const SportsLivestreamProvider = {
  YOUTUBE: 'YOUTUBE',
  TWITCH: 'TWITCH',
  GENERAL: 'GENERAL',
} as const;
export type SportsLivestreamProvider = (typeof SportsLivestreamProvider)[keyof typeof SportsLivestreamProvider];
registerEnumType(SportsLivestreamProvider, {
  name: 'SportsLivestreamProvider',
});

export const SportsLossReason = {
  SCORE: 'SCORE',
  WALKOVER: 'WALKOVER',
  FORFEIT: 'FORFEIT',
  DISQUALIFICATION: 'DISQUALIFICATION',
  INJURY: 'INJURY',
  NO_SHOW: 'NO_SHOW',
  OTHER: 'OTHER',
} as const;
export type SportsLossReason = (typeof SportsLossReason)[keyof typeof SportsLossReason];
registerEnumType(SportsLossReason, { name: 'SportsLossReason' });

export const SportsRosterStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CONFLICT: 'CONFLICT',
} as const;
export type SportsRosterStatus = (typeof SportsRosterStatus)[keyof typeof SportsRosterStatus];
registerEnumType(SportsRosterStatus, { name: 'SportsRosterStatus' });

export const SportsRosterEntryStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type SportsRosterEntryStatus = (typeof SportsRosterEntryStatus)[keyof typeof SportsRosterEntryStatus];
registerEnumType(SportsRosterEntryStatus, { name: 'SportsRosterEntryStatus' });

export const SportsStageType = {
  GROUP: 'GROUP',
  ELIMINATION: 'ELIMINATION',
  WINNERS_BRACKET: 'WINNERS_BRACKET',
  LOSERS_BRACKET: 'LOSERS_BRACKET',
  SWISS: 'SWISS',
  FINAL: 'FINAL',
} as const;
export type SportsStageType = (typeof SportsStageType)[keyof typeof SportsStageType];
registerEnumType(SportsStageType, { name: 'SportsStageType' });

export const SportsBracketSide = {
  HOME: 'HOME',
  AWAY: 'AWAY',
} as const;
export type SportsBracketSide = (typeof SportsBracketSide)[keyof typeof SportsBracketSide];
registerEnumType(SportsBracketSide, { name: 'SportsBracketSide' });

export const SportsScoreEntrySource = {
  PLACEMENT: 'PLACEMENT',
  MATCH: 'MATCH',
  MANUAL: 'MANUAL',
  PENALTY: 'PENALTY',
} as const;
export type SportsScoreEntrySource = (typeof SportsScoreEntrySource)[keyof typeof SportsScoreEntrySource];
registerEnumType(SportsScoreEntrySource, { name: 'SportsScoreEntrySource' });

export const SportsApplicationStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  REJECTED: 'REJECTED',
  WAITING_PAYMENT: 'WAITING_PAYMENT',
  ACTIVE: 'ACTIVE',
  WITHDRAWN: 'WITHDRAWN',
} as const;
export type SportsApplicationStatus = (typeof SportsApplicationStatus)[keyof typeof SportsApplicationStatus];
registerEnumType(SportsApplicationStatus, { name: 'SportsApplicationStatus' });
