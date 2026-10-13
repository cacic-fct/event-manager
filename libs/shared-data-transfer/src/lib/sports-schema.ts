import { Type } from '@sinclair/typebox';
import { Count, DateTime, Id, JsonObject, Name, Text, enumeration, nullable } from './schema-helpers';
import {
  type BoundaryMap,
  checkedResource,
  type SportsCategoryTransferOwner,
  type SportsMatchTransferOwner,
  type SportsStageTransferOwner,
  type SportsTournamentTransferOwner,
  type SportsVenueTransferOwner,
} from './schema-contracts';

export const TournamentResourceSchema = checkedResource<SportsTournamentTransferOwner>()('sports-tournament', {
  majorEventId: Id,
  registrationStartDate: nullable(DateTime),
  registrationEndDate: nullable(DateTime),
  scoringMode: enumeration('PER_SPORT', 'OVERALL', 'BOTH'),
  selfSubscriptionEnabled: Type.Boolean(),
  selfSubscriptionAllowNoTeam: Type.Boolean(),
  selfSubscriptionAllowNoCategory: Type.Boolean(),
  allowPlayerMultipleTeams: Type.Boolean(),
  shouldIssueCertificate: Type.Boolean(),
});

export const CategoryResourceSchema = checkedResource<SportsCategoryTransferOwner, BoundaryMap<'sports-category'>>()(
  'sports-category',
  {
    tournamentId: Id,
    eventGroupId: Id,
    name: Name,
    emoji: Type.String({ maxLength: 64 }),
    sport: enumeration(
      'SOCCER',
      'FUTSAL',
      'TENNIS',
      'BASKETBALL',
      'ESPORTS',
      'CHESS',
      'VOLLEYBALL',
      'SWIMMING',
      'TABLE_TENNIS',
      'HANDBALL',
      'OTHER',
    ),
    customSportName: nullable(Name),
    division: nullable(Name),
    format: enumeration(
      'SINGLE_ELIMINATION',
      'ROUND_ROBIN',
      'GROUP_STAGE_ELIMINATION',
      'DOUBLE_ELIMINATION',
      'SWISS',
      'CUSTOM',
    ),
    registrationStartDate: nullable(DateTime),
    registrationEndDate: nullable(DateTime),
    minimumRosterSize: nullable(Count),
    maximumRosterSize: nullable(Count),
    maximumCaptains: nullable(Count),
    maximumCoaches: nullable(Count),
    allowPlayerMultipleTeams: nullable(Type.Boolean()),
    shouldIssueCertificate: nullable(Type.Boolean()),
    athleteIdentifierMode: enumeration('SHIRT_NUMBER', 'GAME_ACCOUNT'),
    joiningInstructions: nullable(Text),
    periodsEnabled: Type.Boolean(),
    maximumPeriods: nullable(Count),
    periodLabel: nullable(Name),
    timerRules: JsonObject,
    scoreRules: JsonObject,
    overallScoringRules: JsonObject,
    rosterRules: JsonObject,
    bracketRules: JsonObject,
    standingsRules: JsonObject,
    rulesText: nullable(Text),
    registrationFormId: nullable(Id),
  },
);

export const VenueResourceSchema = checkedResource<SportsVenueTransferOwner>()('sports-venue', {
  tournamentId: Id,
  placePresetId: Id,
  parentVenueId: nullable(Id),
  name: Name,
  courtLabel: nullable(Name),
  capacity: nullable(Count),
  notes: nullable(Text),
});

export const StageResourceSchema = checkedResource<SportsStageTransferOwner, BoundaryMap<'sports-stage'>>()(
  'sports-stage',
  {
    categoryId: Id,
    name: Name,
    type: enumeration('GROUP', 'ELIMINATION', 'WINNERS_BRACKET', 'LOSERS_BRACKET', 'SWISS', 'FINAL'),
    displayOrder: Count,
    settings: JsonObject,
  },
);

export const MatchResourceSchema = checkedResource<SportsMatchTransferOwner>()('sports-match', {
  eventId: Id,
  categoryId: Id,
  name: Name,
  emoji: Type.String({ maxLength: 64 }),
  startDate: DateTime,
  endDate: DateTime,
  stageId: nullable(Id),
  venueId: nullable(Id),
  notes: nullable(Text),
  livestreamProvider: nullable(enumeration('YOUTUBE', 'TWITCH', 'GENERAL')),
  livestreamUrl: nullable(Type.String({ maxLength: 2048 })),
  roundNumber: nullable(Count),
  bracketPosition: nullable(Count),
  groupKey: nullable(Name),
});
