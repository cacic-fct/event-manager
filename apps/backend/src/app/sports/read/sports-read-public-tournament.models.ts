import { SportsFormat, SportsPreset } from '@cacic-fct/shared-data-types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import {
  PublicSportsBracket,
  PublicSportsMatch,
  PublicSportsPlacement,
  PublicSportsStanding,
  PublicSportsTeam,
} from './sports-read-public-match.models';

@ObjectType()
export class PublicSportsCategory {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => SportsPreset)
  sport!: SportsPreset;

  @Field(() => String, { nullable: true })
  customSportName?: string | null;

  @Field(() => String, { nullable: true })
  division?: string | null;

  @Field(() => SportsFormat)
  format!: SportsFormat;

  @Field(() => String, { nullable: true })
  rulesText?: string | null;

  @Field(() => [PublicSportsStanding])
  standings!: PublicSportsStanding[];

  @Field(() => [PublicSportsPlacement])
  placements!: PublicSportsPlacement[];

  @Field(() => [PublicSportsBracket])
  brackets!: PublicSportsBracket[];

  @Field(() => [PublicSportsMatch])
  matches!: PublicSportsMatch[];
}

@ObjectType()
export class PublicSportsOverallScore {
  @Field(() => PublicSportsTeam)
  team!: PublicSportsTeam;

  @Field(() => Int)
  points!: number;
}

@ObjectType()
export class PublicSportsPaymentTier {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;

  @Field(() => Int)
  value!: number;
}

@ObjectType()
export class PublicSportsTournamentDetail {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  majorEventId!: string;

  @Field(() => String)
  name!: string;

  @Field(() => String)
  emoji!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => Date)
  startDate!: Date;

  @Field(() => Date)
  endDate!: Date;

  @Field(() => Boolean)
  selfSubscriptionEnabled!: boolean;

  @Field(() => Boolean)
  selfSubscriptionAllowNoTeam!: boolean;

  @Field(() => Boolean)
  selfSubscriptionAllowNoCategory!: boolean;

  @Field(() => Boolean)
  isPaymentRequired!: boolean;

  @Field(() => [PublicSportsPaymentTier])
  paymentTiers!: PublicSportsPaymentTier[];

  @Field(() => [PublicSportsTeam])
  teams!: PublicSportsTeam[];

  @Field(() => [PublicSportsCategory])
  categories!: PublicSportsCategory[];

  @Field(() => [PublicSportsMatch])
  matches!: PublicSportsMatch[];

  @Field(() => [PublicSportsOverallScore])
  overallScores!: PublicSportsOverallScore[];
}
