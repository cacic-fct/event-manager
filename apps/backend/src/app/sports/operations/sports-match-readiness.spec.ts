import {
  SportsMatchState,
  SportsPaymentStatus,
  SportsReviewStatus,
  SportsRosterRole,
} from '@prisma/client';
import { sportsTestDate } from '../testing/sports-backend.fixtures';
import { evaluateSportsMatchReadiness } from './sports-match-readiness';

describe('evaluateSportsMatchReadiness', () => {
  it('reports roster, attendance, officials, bracket, and payment blockers with actionable counts', () => {
    const result = evaluateSportsMatchReadiness({
      minimumRosterSize: 3,
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      rosters: [
        {
          registrationId: 'registration-home',
          entries: [
            rosterEntry('home-1', 'home-person-1', true, SportsPaymentStatus.PAID),
          ],
        },
        {
          registrationId: 'registration-away',
          entries: [
            rosterEntry('away-1', 'away-person-1', true, SportsPaymentStatus.PAID),
            rosterEntry('away-2', 'away-person-2', true, SportsPaymentStatus.WAITING_PAYMENT),
            rosterEntry('away-3', 'away-person-3', false, SportsPaymentStatus.PAID),
          ],
        },
      ],
      assignments: [
        official('official-1', 'official-person-1', true),
        official('official-2', 'official-person-2', false),
      ],
      actions: [],
      winnerSources: [
        {
          id: 'prior-match-1',
          canonicalState: SportsMatchState.LIVE,
          reviewStatus: SportsReviewStatus.PENDING,
          winnerRegistrationId: null,
        },
      ],
      loserSources: [],
      attendances: [],
    });

    expect(result.ready).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MINIMUM_ROSTER', registrationId: 'registration-home', missing: 2 }),
        expect.objectContaining({
          code: 'ATHLETE_ATTENDANCE',
          registrationId: 'registration-home',
          message: 'Faltam 2 atletas presentes',
        }),
        expect.objectContaining({ code: 'PAYMENT', registrationId: 'registration-away', missing: 1 }),
        expect.objectContaining({ code: 'OFFICIAL_ATTENDANCE', missing: 1, actual: 1 }),
        expect.objectContaining({ code: 'PRIOR_BRACKET_RESULT', message: 'Aguardando resultado aprovado da partida anterior.' }),
      ]),
    );
  });

  it('accepts approved, paid, present lineups and prior bracket results', () => {
    const result = evaluateSportsMatchReadiness({
      minimumRosterSize: 2,
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      rosters: [
        {
          registrationId: 'registration-home',
          entries: [
            rosterEntry('home-1', 'home-person-1', true, SportsPaymentStatus.PAID),
            rosterEntry('home-2', 'home-person-2', true, SportsPaymentStatus.NOT_REQUIRED),
          ],
        },
        {
          registrationId: 'registration-away',
          entries: [
            rosterEntry('away-1', 'away-person-1', true, SportsPaymentStatus.PAID),
            rosterEntry('away-2', 'away-person-2', true, SportsPaymentStatus.PAID),
          ],
        },
      ],
      assignments: [official('official-1', 'official-person-1', true)],
      actions: [],
      winnerSources: [
        {
          id: 'prior-match-1',
          canonicalState: SportsMatchState.FINISHED,
          reviewStatus: SportsReviewStatus.APPROVED,
          winnerRegistrationId: 'registration-home',
        },
      ],
      loserSources: [],
      attendances: [],
    });

    expect(result).toEqual({ ready: true, issues: [] });
  });

  it('uses latest check-in actions to synchronize athlete and official presence', () => {
    const result = evaluateSportsMatchReadiness({
      minimumRosterSize: 1,
      homeRegistrationId: 'registration-home',
      awayRegistrationId: 'registration-away',
      rosters: [
        {
          registrationId: 'registration-home',
          entries: [rosterEntry('shared-entry', 'shared-person', true, SportsPaymentStatus.PAID)],
        },
        {
          registrationId: 'registration-away',
          entries: [rosterEntry('away-entry', 'away-person', true, SportsPaymentStatus.PAID)],
        },
      ],
      assignments: [official('official-1', 'shared-person', true)],
      actions: [
        {
          payload: {
            kind: 'OFFICIAL_CHECK_IN',
            personId: 'shared-person',
            present: false,
          },
        },
      ],
      winnerSources: [],
      loserSources: [],
      attendances: [],
    });

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'ATHLETE_ATTENDANCE', registrationId: 'registration-home' }),
        expect.objectContaining({ code: 'OFFICIAL_ATTENDANCE', missing: 1 }),
      ]),
    );
  });
});

function rosterEntry(
  id: string,
  personId: string,
  checkedIn: boolean,
  paymentStatus: SportsPaymentStatus,
) {
  return {
    id,
    role: SportsRosterRole.PLAYER,
    checkedInAt: checkedIn ? sportsTestDate(-60_000) : null,
    registrationMember: {
      teamMember: {
        participant: { personId, paymentStatus },
      },
    },
  };
}

function official(id: string, personId: string, checkedIn: boolean) {
  return {
    id,
    personId,
    role: 'REFEREE',
    person: {
      attendances: checkedIn
        ? [{ status: 'PRESENT', attendedAt: sportsTestDate(-60_000) }]
        : [],
    },
  };
}
