import { SportsMatchState } from '@prisma/client';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';
import { projectSportsMatch } from '../operations/sports-match-projector';
import {
  
  
  PublicSportsMatch,
  PublicSportsOfficial,
  PublicSportsRoster,
  PublicSportsScoreboard,
  PublicSportsTeam,
} from './sports-read.models';

import {
  
  
  PublicMatchRecord,
  PublicTeamRecord,
} from './sports-read.records';

export class SportsReadPublicMapper {
  projectPublicMatch(match: PublicMatchRecord) {
    return projectSportsMatch(match.actions, {
      approvedOnly: false,
      hasCheckedInPlayers: match.rosters.some((roster) => roster.entries.length > 0),
      maximumPeriods: match.category.maximumPeriods,
      periodLabel: match.category.periodLabel,
      periodsEnabled: match.category.periodsEnabled,
      timerRules: match.category.timerRules,
    });
  }

  mapPublicMatch(
    match: PublicMatchRecord,
    projection: ReturnType<typeof projectSportsMatch>,
    rosters: PublicSportsRoster[],
    officials: PublicSportsOfficial[],
  ): PublicSportsMatch {
    const teamByRegistrationId = new Map(
      [
        match.homeRegistrationId && match.homeRegistration
          ? [match.homeRegistrationId, this.mapPublicTeam(match.homeRegistration.team)]
          : null,
        match.awayRegistrationId && match.awayRegistration
          ? [match.awayRegistrationId, this.mapPublicTeam(match.awayRegistration.team)]
          : null,
      ].filter((entry): entry is [string, PublicSportsTeam] => entry !== null),
    );
    return {
      id: match.id,
      eventId: match.eventId,
      categoryId: match.categoryId,
      stageId: match.stageId,
      homeTeam: match.homeRegistration ? this.mapPublicTeam(match.homeRegistration.team) : null,
      awayTeam: match.awayRegistration ? this.mapPublicTeam(match.awayRegistration.team) : null,
      state: projection.state,
      scoreboard: this.mapPublicScoreboard(projection.scoreboard),
      winner: projection.winnerRegistrationId
        ? (teamByRegistrationId.get(projection.winnerRegistrationId) ?? null)
        : null,
      loser: projection.loserRegistrationId
        ? (teamByRegistrationId.get(projection.loserRegistrationId) ?? null)
        : null,
      lossReason: projection.lossReason,
      lossReasonDetail: projection.lossReasonDetail,
      drawWillReschedule: projection.drawWillReschedule,
      timerStartedAt: projection.timerStartedAt,
      timerStartedAtUnixMs: projection.timerStartedAt?.getTime() ?? null,
      timerPausedAt: projection.timerPausedAt,
      timerPausedAtUnixMs: projection.timerPausedAt?.getTime() ?? null,
      elapsedBeforePauseMs: projection.elapsedBeforePauseMs,
      periodTimers: projection.periodTimers,
      overallTimerEnabled: projection.overallTimerEnabled,
      periodTimerEnabled: projection.periodTimerEnabled,
      timerPeriodDurationMs: projection.timerPeriodDurationMs,
      timerPeriodStartOffsetsMs: projection.timerPeriodStartOffsetsMs,
      timerAllowOvertime: projection.timerAllowOvertime,
      roundNumber: match.roundNumber,
      bracketPosition: match.bracketPosition,
      groupKey: match.groupKey,
      livestreamProvider: match.livestreamProvider,
      livestreamUrl: match.livestreamUrl,
      schedule: {
        startDate: match.event.startDate,
        endDate: match.event.endDate,
        locationDescription: match.event.locationDescription,
        latitude: match.event.latitude,
        longitude: match.event.longitude,
        venueName: match.venue?.name ?? null,
        courtLabel: match.venue?.courtLabel ?? null,
      },
      rosters,
      officials,
    };
  }

  mapPublicScoreboard(
    scoreboard: ReturnType<typeof normalizeSportsScoreboard>,
  ): PublicSportsScoreboard {
    return {
      homeScore: scoreboard.home,
      awayScore: scoreboard.away,
      activePeriod: scoreboard.activePeriodNumber,
      periods: scoreboard.periods.map((period) => ({
        number: period.number,
        label: period.label,
        homeScore: period.home,
        awayScore: period.away,
        completed: period.closed,
      })),
    };
  }

  mapPublicTeam(team: PublicTeamRecord): PublicSportsTeam {
    return {
      id: team.id,
      name: team.name,
      institution: team.institution,
      logoUrl: team.logoSha256
        ? `/api/sports/public/teams/${team.id}/logo/${team.logoSha256}`
        : null,
    };
  }

  canRevealRoster(state: SportsMatchState | undefined): boolean {
    return state === SportsMatchState.FINISHED || state === SportsMatchState.DRAW;
  }

}
