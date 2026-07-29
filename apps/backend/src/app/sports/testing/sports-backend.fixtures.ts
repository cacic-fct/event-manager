import {
  AuditLogActorType,
  PublicationState,
  SportsCategoryStatus,
  SportsMatchActionType,
  SportsMatchState,
  SportsReviewStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import {
  SportsMatchCommandActor,
  SportsMatchCommandInput,
} from '../operations/sports-match-operation.service';
import { SportsProjectionAction } from '../operations/sports-match-projector';

export const SPORTS_TEST_NOW = new Date('2026-07-29T12:00:00.000Z');

export function sportsProjectionAction(
  overrides: Partial<SportsProjectionAction> = {},
): SportsProjectionAction {
  return {
    type: SportsMatchActionType.START,
    payload: {},
    authoredAt: SPORTS_TEST_NOW,
    reviewStatus: SportsReviewStatus.APPROVED,
    ...overrides,
  };
}

export function sportsMatchCommand(
  overrides: Partial<SportsMatchCommandInput> = {},
): SportsMatchCommandInput {
  return {
    clientId: 'offline_action_0001',
    matchId: 'match-1',
    baseRevision: 1,
    type: SportsMatchActionType.START,
    payload: {},
    authoredAt: SPORTS_TEST_NOW,
    offline: true,
    ...overrides,
  };
}

export function sportsOfficialActor(
  overrides: Partial<SportsMatchCommandActor> = {},
): SportsMatchCommandActor {
  return {
    personId: 'official-person-1',
    userId: 'official-user-1',
    role: 'REFEREE',
    kind: 'OFFICIAL',
    auditActor: {
      id: 'official-person-1',
      name: 'Árbitro de Teste',
      type: AuditLogActorType.USER,
    },
    ...overrides,
  };
}

export function sportsMatchRecord(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: 'match-1',
    eventId: 'event-1',
    categoryId: 'category-1',
    revision: 1,
    operationSequence: 0,
    state: SportsMatchState.SCHEDULED,
    canonicalState: SportsMatchState.SCHEDULED,
    reviewStatus: SportsReviewStatus.NOT_REQUIRED,
    homeRegistrationId: 'registration-home',
    awayRegistrationId: 'registration-away',
    scoreboard: {
      home: 0,
      away: 0,
      periods: [],
      activePeriodNumber: null,
    },
    category: {
      deletedAt: null,
      eventGroupId: 'event-group-1',
      status: SportsCategoryStatus.ACTIVE,
      maximumPeriods: 4,
      periodLabel: 'Período',
      tournament: {
        id: 'tournament-1',
        majorEventId: 'major-event-1',
        deletedAt: null,
        status: SportsTournamentStatus.LIVE,
        majorEvent: {
          deletedAt: null,
          publicationState: PublicationState.PUBLISHED,
        },
      },
    },
    event: {
      deletedAt: null,
      publiclyVisible: true,
      publicationState: PublicationState.PUBLISHED,
    },
    actions: [],
    rosters: [],
    ...overrides,
  };
}
