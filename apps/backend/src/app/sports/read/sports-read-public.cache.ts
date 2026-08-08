import { Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PublicSportsMatch, PublicSportsTournamentDetail } from './sports-read.models';
import {
  SPORTS_PUBLIC_TOURNAMENT_CACHE_TTL_SECONDS,
  sportsPublicTournamentCacheKey,
  sportsPublicTournamentCacheVersionKey,
} from '../realtime/sports-realtime.service';

const CACHE_PUBLIC_TOURNAMENT_IF_CURRENT_SCRIPT = `
local currentVersion = redis.call('GET', KEYS[2]) or '0'
if currentVersion ~= ARGV[1] then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 1
`;

interface CachedPublicSportsTournament {
  version: string;
  tournament: PublicSportsTournamentDetail;
}

export class SportsReadPublicCache {
  private readonly logger = new Logger(SportsReadPublicCache.name);

  constructor(private readonly redis?: Redis) {}

  async getCachedPublicTournament(
    tournamentId: string,
  ): Promise<PublicSportsTournamentDetail | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const [serialized, currentVersion] = await this.redis.mget(
        sportsPublicTournamentCacheKey(tournamentId),
        sportsPublicTournamentCacheVersionKey(tournamentId),
      );
      if (!serialized) {
        return null;
      }
      const cached = JSON.parse(serialized) as Partial<CachedPublicSportsTournament>;
      if (
        typeof cached.version !== 'string' ||
        cached.version !== (currentVersion ?? '0')
      ) {
        return null;
      }
      return this.rehydratePublicTournament(cached.tournament, tournamentId);
    } catch (error) {
      this.logger.warn(
        `Sports public tournament cache read failed for tournament ${tournamentId}; loading from the database.`,
        error,
      );
      return null;
    }
  }

  async readPublicTournamentCacheVersion(
    tournamentId: string,
  ): Promise<string | null> {
    if (!this.redis) {
      return null;
    }
    try {
      return (
        (await this.redis.get(
          sportsPublicTournamentCacheVersionKey(tournamentId),
        )) ?? '0'
      );
    } catch (error) {
      this.logger.warn(
        `Sports public tournament cache version read failed for tournament ${tournamentId}; skipping cache storage.`,
        error,
      );
      return null;
    }
  }

  async cachePublicTournamentIfCurrent(
    tournamentId: string,
    cacheVersion: string | null,
    tournament: PublicSportsTournamentDetail,
  ): Promise<void> {
    if (!this.redis || cacheVersion === null) {
      return;
    }
    const cached: CachedPublicSportsTournament = {
      version: cacheVersion,
      tournament,
    };
    try {
      await this.redis.eval(
        CACHE_PUBLIC_TOURNAMENT_IF_CURRENT_SCRIPT,
        2,
        sportsPublicTournamentCacheKey(tournamentId),
        sportsPublicTournamentCacheVersionKey(tournamentId),
        cacheVersion,
        JSON.stringify(cached),
        SPORTS_PUBLIC_TOURNAMENT_CACHE_TTL_SECONDS.toString(),
      );
    } catch (error) {
      this.logger.warn(
        `Sports public tournament cache write failed for tournament ${tournamentId}.`,
        error,
      );
    }
  }

  rehydratePublicTournament(
    value: unknown,
    expectedTournamentId: string,
  ): PublicSportsTournamentDetail | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    const tournament = value as PublicSportsTournamentDetail;
    if (
      tournament.id !== expectedTournamentId ||
      !Array.isArray(tournament.matches) ||
      !Array.isArray(tournament.categories)
    ) {
      return null;
    }

    const startDate = this.parseCachedDate(tournament.startDate);
    const endDate = this.parseCachedDate(tournament.endDate);
    if (!startDate || !endDate) {
      return null;
    }
    tournament.startDate = startDate;
    tournament.endDate = endDate;
    if (!this.rehydratePublicMatches(tournament.matches)) {
      return null;
    }
    for (const category of tournament.categories) {
      if (
        !category ||
        !Array.isArray(category.matches) ||
        !Array.isArray(category.brackets) ||
        !this.rehydratePublicMatches(category.matches)
      ) {
        return null;
      }
      for (const bracket of category.brackets) {
        if (
          !bracket ||
          !Array.isArray(bracket.matches) ||
          !this.rehydratePublicMatches(bracket.matches)
        ) {
          return null;
        }
      }
    }
    return tournament;
  }

  rehydratePublicMatches(matches: PublicSportsMatch[]): boolean {
    for (const match of matches) {
      if (!match?.schedule) {
        return false;
      }
      const startDate = this.parseCachedDate(match.schedule.startDate);
      const endDate = this.parseCachedDate(match.schedule.endDate);
      if (!startDate || !endDate) {
        return false;
      }
      match.schedule.startDate = startDate;
      match.schedule.endDate = endDate;
      if (match.timerStartedAt) {
        const timerStartedAt = this.parseCachedDate(match.timerStartedAt);
        if (!timerStartedAt) {
          return false;
        }
        match.timerStartedAt = timerStartedAt;
      }
      if (match.timerPausedAt) {
        const timerPausedAt = this.parseCachedDate(match.timerPausedAt);
        if (!timerPausedAt) {
          return false;
        }
        match.timerPausedAt = timerPausedAt;
      }
    }
    return true;
  }

  parseCachedDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

}
