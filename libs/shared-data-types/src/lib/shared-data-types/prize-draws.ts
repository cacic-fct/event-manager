import { Field, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const PrizeDrawTargetType = {
  EVENT: 'EVENT',
  MAJOR_EVENT: 'MAJOR_EVENT',
} as const;
export type PrizeDrawTargetType = (typeof PrizeDrawTargetType)[keyof typeof PrizeDrawTargetType];
registerEnumType(PrizeDrawTargetType, { name: 'PrizeDrawTargetType' });

export const PrizeDrawChanceMode = {
  EQUAL: 'EQUAL',
  WEIGHTED: 'WEIGHTED',
} as const;
export type PrizeDrawChanceMode = (typeof PrizeDrawChanceMode)[keyof typeof PrizeDrawChanceMode];
registerEnumType(PrizeDrawChanceMode, { name: 'PrizeDrawChanceMode' });

export const PrizeDrawSpeed = {
  INSTANT: 'INSTANT',
  QUICK: 'QUICK',
  DRAMATIC: 'DRAMATIC',
} as const;
export type PrizeDrawSpeed = (typeof PrizeDrawSpeed)[keyof typeof PrizeDrawSpeed];
registerEnumType(PrizeDrawSpeed, { name: 'PrizeDrawSpeed' });

export const PrizeDrawNotificationStatus = {
  NOT_REQUESTED: 'NOT_REQUESTED',
  PENDING: 'PENDING',
  SENT: 'SENT',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
  DELETED: 'DELETED',
} as const;
export type PrizeDrawNotificationStatus =
  (typeof PrizeDrawNotificationStatus)[keyof typeof PrizeDrawNotificationStatus];
registerEnumType(PrizeDrawNotificationStatus, { name: 'PrizeDrawNotificationStatus' });

@ObjectType()
export class PrizeDrawTargetSummary {
  @Field(() => PrizeDrawTargetType)
  type!: PrizeDrawTargetType;

  @Field(() => String)
  id!: string;

  @Field(() => String)
  name!: string;
}

@ObjectType()
export class PrizeDrawPlannedSpin {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  position!: number;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => PrizeDrawSpeed)
  speed!: PrizeDrawSpeed;

  @Field(() => Int, { nullable: true })
  countdownSeconds?: number | null;
}

@ObjectType()
export class PrizeDrawManualEntry {
  @Field(() => String)
  id!: string;

  @Field(() => String, { nullable: true })
  personId?: string | null;

  @Field(() => String)
  name!: string;

  @Field(() => Int)
  weight!: number;
}

@ObjectType()
export class PrizeDrawWeightOverride {
  @Field(() => String)
  personId!: string;

  @Field(() => Int)
  weight!: number;
}

@ObjectType()
export class PrizeDrawExcludedPerson {
  @Field(() => String)
  personId!: string;

  @Field(() => String)
  displayName!: string;
}

@ObjectType()
export class PrizeDrawEligibleEntry {
  @Field(() => String)
  identityKey!: string;

  @Field(() => String, { nullable: true })
  personId?: string | null;

  @Field(() => String)
  displayName!: string;

  @Field(() => Int)
  weight!: number;

  @Field(() => [String])
  sources!: string[];
}

@ObjectType()
export class PrizeDrawWeightBreakdown {
  @Field(() => Int)
  weight!: number;

  @Field(() => Int)
  peopleCount!: number;
}

@ObjectType()
export class PrizeDrawSpin {
  @Field(() => String)
  id!: string;

  @Field(() => Int)
  sequence!: number;

  @Field(() => String, { nullable: true })
  plannedSpinId?: string | null;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => PrizeDrawSpeed)
  speed!: PrizeDrawSpeed;

  @Field(() => Int, { nullable: true })
  countdownSeconds?: number | null;

  @Field(() => PrizeDrawChanceMode)
  chanceMode!: PrizeDrawChanceMode;

  @Field(() => Boolean)
  removeWinnerAfterDraw!: boolean;

  @Field(() => String)
  winnerDisplayName!: string;

  @Field(() => String, { nullable: true })
  winnerPersonId?: string | null;

  @Field(() => Int)
  winnerWeight!: number;

  @Field(() => Int)
  entrantCount!: number;

  @Field(() => Int)
  totalWeight!: number;

  @Field(() => Int)
  duplicateEntryCount!: number;

  @Field(() => [PrizeDrawWeightBreakdown])
  weightBreakdown!: PrizeDrawWeightBreakdown[];

  @Field(() => Date, { nullable: true })
  eligibilityFrozenAt?: Date | null;

  @Field(() => Date)
  drawnAt!: Date;

  @Field(() => Date, { nullable: true })
  undoneAt?: Date | null;

  @Field(() => PrizeDrawNotificationStatus)
  notificationStatus!: PrizeDrawNotificationStatus;
}

@ObjectType()
export class PrizeDraw {
  @Field(() => String)
  id!: string;

  @Field(() => String)
  title!: string;

  @Field(() => String, { nullable: true })
  description?: string | null;

  @Field(() => PrizeDrawTargetSummary)
  target!: PrizeDrawTargetSummary;

  @Field(() => Boolean)
  includePresent!: boolean;

  @Field(() => Boolean)
  includeSubscribers!: boolean;

  @Field(() => Boolean)
  includeManualEntries!: boolean;

  @Field(() => PrizeDrawChanceMode)
  chanceMode!: PrizeDrawChanceMode;

  @Field(() => Int, { nullable: true })
  spinLimit?: number | null;

  @Field(() => Boolean)
  removeWinnerAfterDraw!: boolean;

  @Field(() => PrizeDrawSpeed)
  defaultSpeed!: PrizeDrawSpeed;

  @Field(() => Int)
  dramaticCountdownSeconds!: number;

  @Field(() => Boolean)
  notifyWinner!: boolean;

  @Field(() => Date, { nullable: true })
  frozenAt?: Date | null;

  @Field(() => Date, { nullable: true })
  unfrozenAt?: Date | null;

  @Field(() => Int)
  revision!: number;

  @Field(() => [PrizeDrawPlannedSpin])
  plannedSpins!: PrizeDrawPlannedSpin[];

  @Field(() => [PrizeDrawManualEntry])
  manualEntries!: PrizeDrawManualEntry[];

  @Field(() => [PrizeDrawWeightOverride])
  weightOverrides!: PrizeDrawWeightOverride[];

  @Field(() => [PrizeDrawExcludedPerson])
  excludedPeople!: PrizeDrawExcludedPerson[];

  @Field(() => [PrizeDrawSpin])
  spins!: PrizeDrawSpin[];

  @Field(() => Int)
  eligibleEntrantCount!: number;

  @Field(() => Int)
  eligibleTotalWeight!: number;

  @Field(() => Int)
  eligibleDuplicateEntryCount!: number;

  @Field(() => Date)
  createdAt!: Date;

  @Field(() => Date)
  updatedAt!: Date;
}

@ObjectType()
export class PrizeDrawSpinResult {
  @Field(() => Boolean)
  demo!: boolean;

  @Field(() => String)
  drawId!: string;

  @Field(() => String, { nullable: true })
  spinId?: string | null;

  @Field(() => Int, { nullable: true })
  sequence?: number | null;

  @Field(() => String)
  drawTitle!: string;

  @Field(() => String, { nullable: true })
  spinDescription?: string | null;

  @Field(() => String)
  winnerFullName!: string;

  @Field(() => String)
  winnerReelName!: string;

  @Field(() => Int)
  winnerReelIndex!: number;

  @Field(() => [String])
  reelNames!: string[];

  @Field(() => PrizeDrawSpeed)
  speed!: PrizeDrawSpeed;

  @Field(() => Int)
  countdownMs!: number;

  @Field(() => Int)
  reelDurationMs!: number;

  @Field(() => Int)
  preRevealPauseMs!: number;

  @Field(() => Boolean)
  hasMoreSpins!: boolean;
}

@ObjectType()
export class PrizeDrawWinnerContact {
  @Field(() => String)
  spinId!: string;

  @Field(() => String)
  fullName!: string;

  @Field(() => String, { nullable: true })
  email?: string | null;

  @Field(() => String, { nullable: true })
  phone?: string | null;

  @Field(() => String, { nullable: true })
  academicId?: string | null;
}

@ObjectType()
export class PrizeDrawAvailability {
  @Field(() => String)
  targetType!: 'EVENT' | 'EVENT_GROUP' | 'MAJOR_EVENT';

  @Field(() => String)
  targetId!: string;

  @Field(() => Int)
  drawCount!: number;
}

@InputType()
export class PrizeDrawPlannedSpinInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  id?: string | null;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(1000)
  position!: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @Field(() => PrizeDrawSpeed)
  @IsEnum(PrizeDrawSpeed)
  speed!: PrizeDrawSpeed;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  countdownSeconds?: number | null;
}

@InputType()
export class PrizeDrawManualEntryInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  id?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  personId?: string | null;

  @Field(() => String)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(10000)
  weight!: number;
}

@InputType()
export class PrizeDrawWeightOverrideInput {
  @Field(() => String)
  @IsString()
  personId!: string;

  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(10000)
  weight!: number;
}

@InputType()
export class SavePrizeDrawInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  id?: string | null;

  @Field(() => String)
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @Field(() => PrizeDrawTargetType)
  @IsEnum(PrizeDrawTargetType)
  targetType!: PrizeDrawTargetType;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  eventId?: string | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  majorEventId?: string | null;

  @Field(() => Boolean)
  @IsBoolean()
  includePresent!: boolean;

  @Field(() => Boolean)
  @IsBoolean()
  includeSubscribers!: boolean;

  @Field(() => Boolean)
  @IsBoolean()
  includeManualEntries!: boolean;

  @Field(() => PrizeDrawChanceMode)
  @IsEnum(PrizeDrawChanceMode)
  chanceMode!: PrizeDrawChanceMode;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  spinLimit?: number | null;

  @Field(() => Boolean)
  @IsBoolean()
  removeWinnerAfterDraw!: boolean;

  @Field(() => PrizeDrawSpeed)
  @IsEnum(PrizeDrawSpeed)
  defaultSpeed!: PrizeDrawSpeed;

  @Field(() => Int)
  @IsInt()
  dramaticCountdownSeconds!: number;

  @Field(() => Boolean)
  @IsBoolean()
  notifyWinner!: boolean;

  @Field(() => [PrizeDrawPlannedSpinInput])
  @ValidateNested({ each: true })
  @Type(() => PrizeDrawPlannedSpinInput)
  @ArrayMaxSize(1000)
  plannedSpins!: PrizeDrawPlannedSpinInput[];

  @Field(() => [PrizeDrawManualEntryInput])
  @ValidateNested({ each: true })
  @Type(() => PrizeDrawManualEntryInput)
  @ArrayMaxSize(10000)
  manualEntries!: PrizeDrawManualEntryInput[];

  @Field(() => [PrizeDrawWeightOverrideInput])
  @ValidateNested({ each: true })
  @Type(() => PrizeDrawWeightOverrideInput)
  @ArrayMaxSize(10000)
  weightOverrides!: PrizeDrawWeightOverrideInput[];

  @Field(() => [String])
  @IsString({ each: true })
  @ArrayUnique()
  @ArrayMaxSize(10000)
  excludedPersonIds!: string[];
}

@InputType()
export class SpinPrizeDrawInput {
  @Field(() => String)
  @IsString()
  drawId!: string;

  @Field(() => Boolean)
  @IsBoolean()
  demo!: boolean;

  @Field(() => Boolean)
  @IsBoolean()
  reducedMotion!: boolean;
}
