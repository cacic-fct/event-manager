import {
  SportsLossReason,
  SportsMatchPeriodTimer,
  SportsMatchState,
  SportsOfficialRole,
  SportsRosterRole,
  SportsStageType,
} from '@cacic-fct/shared-data-types';
import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class PublicSportsTeam {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String, { nullable: true })
  institution?: string | null;

  @Field(() => String, { nullable: true })
  logoUrl?: string | null;
}

@ObjectType()
export class PublicSportsScorePeriod {
  @Field(() => Int)
  number!: number;

  @Field(() => String)
  label!: string;

  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => Boolean)
  completed!: boolean;
}

@ObjectType()
export class PublicSportsScoreboard {
  @Field(() => Int)
  homeScore!: number;

  @Field(() => Int)
  awayScore!: number;

  @Field(() => [PublicSportsScorePeriod])
  periods!: PublicSportsScorePeriod[];

  @Field(() => Int, { nullable: true })
  activePeriod?: number | null;
}

@ObjectType()
export class PublicSportsMatchSchedule {
  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => String, { nullable: true })
  locationDescription?: string | null;

  @Field(() => Float, { nullable: true })
  latitude?: number | null;

  @Field(() => Float, { nullable: true })
  longitude?: number | null;

  @Field(() => String, { nullable: true })
  venueName?: string | null;

  @Field(() => String, { nullable: true })
  courtLabel?: string | null;
}

@ObjectType()
export class PublicSportsRosterEntry {
  @Field(() => String)
  name!: string;

  @Field(() => SportsRosterRole)
  role!: SportsRosterRole;
}

@ObjectType()
export class PublicSportsRoster {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => [PublicSportsRosterEntry])
  entries!: PublicSportsRosterEntry[];
}

@ObjectType()
export class PublicSportsOfficial {
  @Field(() => String)
  name!: string;

  @Field(() => SportsOfficialRole)
  role!: SportsOfficialRole;
}

@ObjectType()
export class PublicSportsMatch {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  eventId!: string;

  @Field(() => String)
  categoryId!: string;

  @Field(() => String, { nullable: true })
  stageId?: string | null;

  @Field(() => PublicSportsTeam, { nullable: true })
  homeTeam?: PublicSportsTeam | null;

  @Field(() => PublicSportsTeam, { nullable: true })
  awayTeam?: PublicSportsTeam | null;

  @Field(() => SportsMatchState)
  state!: SportsMatchState;

  @Field(() => PublicSportsScoreboard)
  scoreboard!: PublicSportsScoreboard;

  @Field(() => PublicSportsTeam, { nullable: true })
  winner?: PublicSportsTeam | null;

  @Field(() => PublicSportsTeam, { nullable: true })
  loser?: PublicSportsTeam | null;

  @Field(() => SportsLossReason, { nullable: true })
  lossReason?: SportsLossReason | null;

  @Field(() => String, { nullable: true })
  lossReasonDetail?: string | null;

  @Field(() => Boolean, { nullable: true })
  drawWillReschedule?: boolean | null;

  @Field(() => Date, { nullable: true })
  timerStartedAt?: Date | null;

  @Field(() => Float, { nullable: true })
  timerStartedAtUnixMs?: number | null;

  @Field(() => Date, { nullable: true })
  timerPausedAt?: Date | null;

  @Field(() => Float, { nullable: true })
  timerPausedAtUnixMs?: number | null;

  @Field(() => Int)
  elapsedBeforePauseMs!: number;

  @Field(() => [SportsMatchPeriodTimer])
  periodTimers!: SportsMatchPeriodTimer[];

  @Field(() => Boolean)
  overallTimerEnabled!: boolean;

  @Field(() => Boolean)
  periodTimerEnabled!: boolean;

  @Field(() => Float, { nullable: true })
  timerPeriodDurationMs?: number | null;

  @Field(() => [Float])
  timerPeriodStartOffsetsMs!: number[];

  @Field(() => Boolean)
  timerAllowOvertime!: boolean;

  @Field(() => Int, { nullable: true })
  roundNumber?: number | null;

  @Field(() => Int, { nullable: true })
  bracketPosition?: number | null;

  @Field(() => String, { nullable: true })
  groupKey?: string | null;

  @Field(() => PublicSportsMatchSchedule)
  schedule!: PublicSportsMatchSchedule;

  @Field(() => [PublicSportsRoster])
  rosters!: PublicSportsRoster[];

  @Field(() => [PublicSportsOfficial])
  officials!: PublicSportsOfficial[];

  @Field(() => String, { nullable: true })
  livestreamProvider?: string | null;

  @Field(() => String, { nullable: true })
  livestreamUrl?: string | null;
}

@ObjectType()
export class PublicSportsStanding {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => Int)
  played!: number;

  @Field(() => Int)
  wins!: number;

  @Field(() => Int)
  draws!: number;

  @Field(() => Int)
  losses!: number;

  @Field(() => Float)
  scoreFor!: number;

  @Field(() => Float)
  scoreAgainst!: number;

  @Field(() => Float)
  points!: number;

  @Field(() => Int, { nullable: true })
  rank?: number | null;
}

@ObjectType()
export class PublicSportsPlacement {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => Int)
  placement!: number;

  @Field(() => Int, { nullable: true })
  pointsAwarded?: number | null;
}

@ObjectType()
export class PublicSportsBracket {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => SportsStageType)
  type!: SportsStageType;

  @Field(() => Int)
  displayOrder!: number;

  @Field(() => [PublicSportsMatch])
  matches!: PublicSportsMatch[];
}
