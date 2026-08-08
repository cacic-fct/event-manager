import type {
  DashboardSportsMatch,
  DashboardSportsTournament,
} from '@cacic-fct/shared-frontend-types';

export type SportsDashboardMode =
  | 'none'
  | 'registration-open'
  | 'live'
  | 'review'
  | 'live-and-review';

interface SportsStoryArgs {
  showActionQueue: boolean;
  sportsMode: SportsDashboardMode;
}

type DateFromNow = (days: number, hour: number) => Date;

export function buildSportsTournaments(
  args: SportsStoryArgs,
  empty: boolean,
  dateFromNow: DateFromNow,
): DashboardSportsTournament[] {
  if (empty || args.sportsMode === 'none') {
    return [];
  }

  const hasReview =
    args.showActionQueue && ['review', 'live-and-review'].includes(args.sportsMode);
  const isLive = ['live', 'live-and-review'].includes(args.sportsMode);
  return [
    {
      tournamentId: 'sports-tournament-1',
      majorEventId: 'sports-major-event-1',
      name: 'Jogos Universitários 2026',
      emoji: '🏆',
      startDate: dateFromNow(0, 8).toISOString(),
      endDate: dateFromNow(3, 20).toISOString(),
      status:
        args.sportsMode === 'registration-open'
          ? 'REGISTRATION_OPEN'
          : isLive
            ? 'LIVE'
            : 'DRAFT',
      categoryCount: 6,
      teamCount: 18,
      pendingApplicationCount: hasReview ? 3 : 0,
      pendingReviewCount: hasReview ? 2 : 0,
      activeMatchCount: isLive ? 2 : 0,
    },
  ];
}

export function buildSportsMatches(
  args: SportsStoryArgs,
  empty: boolean,
  dateFromNow: DateFromNow,
): DashboardSportsMatch[] {
  if (empty || !['live', 'live-and-review'].includes(args.sportsMode)) {
    return [];
  }

  return [
    {
      matchId: 'sports-match-1',
      tournamentId: 'sports-tournament-1',
      categoryName: 'Futsal aberto',
      eventName: 'Atlética FCT × Engenharia',
      startDate: dateFromNow(0, 14).toISOString(),
      state: 'LIVE',
      homeTeamName: 'Atlética FCT',
      awayTeamName: 'Engenharia',
      homeScore: 2,
      awayScore: 1,
    },
    {
      matchId: 'sports-match-2',
      tournamentId: 'sports-tournament-1',
      categoryName: 'Vôlei misto',
      eventName: 'Computação × Matemática',
      startDate: dateFromNow(0, 16).toISOString(),
      state: 'AWAITING_REVIEW',
      homeTeamName: 'Computação',
      awayTeamName: 'Matemática',
      homeScore: 3,
      awayScore: 2,
    },
  ];
}

