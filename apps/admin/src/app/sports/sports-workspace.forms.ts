import { FormBuilder, Validators } from '@angular/forms';
import {
  DEFAULT_SPORTS_BRACKET_EDITOR_RULES,
  DEFAULT_SPORTS_CATEGORY_EMOJI,
  DEFAULT_SPORTS_OVERALL_SCORING_RULES,
  DEFAULT_SPORTS_SCORE_RULES,
  DEFAULT_SPORTS_STANDINGS_RULES,
} from '@cacic-fct/shared-data-types/sports-metadata';
import {
  livestreamValidator,
  placementPointsValidator,
  tournamentRegistrationWindowValidator,
} from './sports-workspace-form.utils';

export function createSportsWorkspaceForms(fb: FormBuilder) {
  const overallPlacementPoints = fb.array([createPlacementPointForm(fb, 1)], placementPointsValidator);
  overallPlacementPoints.clear();
  return {
    tournament: fb.nonNullable.group(
      {
        status: ['DRAFT'],
        registrationScheduleMode: ['INHERIT'],
        registrationStartDate: [''],
        registrationEndDate: [''],
        scoringMode: ['PER_SPORT'],
        selfSubscriptionEnabled: [false],
        selfSubscriptionAllowNoTeam: [false],
        selfSubscriptionAllowNoCategory: [false],
        allowPlayerMultipleTeams: [false],
      },
      { validators: tournamentRegistrationWindowValidator },
    ),
    category: fb.nonNullable.group({
      id: [''],
      name: ['', Validators.required],
      emoji: [DEFAULT_SPORTS_CATEGORY_EMOJI, Validators.required],
      sport: ['', Validators.required],
      customSportName: [''],
      division: [''],
      format: ['CUSTOM'],
      status: ['DRAFT'],
      registrationStartDate: [''],
      registrationEndDate: [''],
      minimumRosterSize: [0],
      maximumRosterSize: [0],
      maximumCaptains: [0],
      maximumCoaches: [0],
      allowPlayerMultipleTeams: [false],
      athleteIdentifierMode: ['SHIRT_NUMBER'],
      joiningInstructions: ['', Validators.maxLength(4_000)],
      periodsEnabled: [false],
      maximumPeriods: [0],
      periodLabel: ['Período'],
      timerPreset: ['CUSTOM'],
      timerOverallEnabled: [true],
      timerPeriodEnabled: [false],
      timerPeriodDurationMinutes: [0, [Validators.min(0), Validators.max(1440)]],
      timerAllowOvertime: [false],
      timerPeriodStartOffsetsMinutes: [
        '0',
        Validators.pattern(/^\s*\d+(?:\.\d+)?(?:\s*,\s*\d+(?:\.\d+)?)*\s*$/),
      ],
      rulesText: [''],
      scoreRulesJson: ['{}'],
      scoreAllowDraw: [DEFAULT_SPORTS_SCORE_RULES.allowDraw],
      scoreHigherWins: [DEFAULT_SPORTS_SCORE_RULES.higherWins],
      scorePointStep: [DEFAULT_SPORTS_SCORE_RULES.pointStep, [Validators.required, Validators.min(0.000001)]],
      overallScoringMode: [DEFAULT_SPORTS_OVERALL_SCORING_RULES.mode],
      overallMatchWinPoints: [
        DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.win,
        [Validators.min(0), Validators.max(1_000_000)],
      ],
      overallMatchDrawPoints: [
        DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.draw,
        [Validators.min(0), Validators.max(1_000_000)],
      ],
      overallMatchLossPoints: [
        DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.loss,
        [Validators.min(0), Validators.max(1_000_000)],
      ],
      overallPlacementPointsJson: ['{}'],
      overallPlacementPoints,
      rosterRulesJson: ['{}'],
      bracketRulesJson: ['{}'],
      standingsRulesJson: ['{}'],
      standingsWinPoints: [DEFAULT_SPORTS_STANDINGS_RULES.winPoints, Validators.required],
      standingsDrawPoints: [DEFAULT_SPORTS_STANDINGS_RULES.drawPoints, Validators.required],
      standingsLossPoints: [DEFAULT_SPORTS_STANDINGS_RULES.lossPoints, Validators.required],
      standingsByePoints: [DEFAULT_SPORTS_STANDINGS_RULES.byePoints, Validators.required],
      doubleRoundRobin: [false],
      groupCount: [
        DEFAULT_SPORTS_BRACKET_EDITOR_RULES.groupCount,
        [Validators.required, Validators.min(2), Validators.max(128)],
      ],
      qualifiersPerGroup: [
        DEFAULT_SPORTS_BRACKET_EDITOR_RULES.qualifiersPerGroup,
        [Validators.required, Validators.min(1), Validators.max(128)],
      ],
      swissMaximumRounds: [
        DEFAULT_SPORTS_BRACKET_EDITOR_RULES.swissMaximumRounds,
        [Validators.required, Validators.min(1), Validators.max(128)],
      ],
      registrationFormId: [''],
    }),
    team: fb.nonNullable.group({
      id: [''],
      name: ['', Validators.required],
      institution: [''],
      status: ['DRAFT'],
    }),
    registration: fb.nonNullable.group({
      teamId: ['', Validators.required],
      categoryId: ['', Validators.required],
      seed: [0],
      formAnswersJson: ['[]'],
    }),
    match: fb.nonNullable.group(
      {
        id: [''],
        categoryId: ['', Validators.required],
        name: ['Partida'],
        startDate: ['', Validators.required],
        endDate: ['', Validators.required],
        stageId: [''],
        venueId: [''],
        homeRegistrationId: [''],
        awayRegistrationId: [''],
        roundNumber: [1],
        bracketPosition: [1],
        groupKey: [''],
        state: ['SCHEDULED'],
        notes: ['', Validators.maxLength(2_000)],
        livestreamProvider: [''],
        livestreamUrl: ['', Validators.pattern(/^https:\/\/.+/i)],
      },
      { validators: livestreamValidator },
    ),
    representative: fb.nonNullable.group({
      personQuery: ['', Validators.required],
      personId: ['', Validators.required],
    }),
    member: fb.nonNullable.group({
      personQuery: ['', Validators.required],
      personId: ['', Validators.required],
    }),
    official: fb.nonNullable.group({
      personQuery: ['', Validators.required],
      personId: ['', Validators.required],
      role: ['REFEREE'],
      scope: ['MATCH'],
    }),
    scoreEntry: fb.nonNullable.group({
      teamId: ['', Validators.required],
      source: ['MANUAL'],
      points: [0],
      reason: ['', Validators.required],
    }),
    venue: fb.nonNullable.group({
      id: [''],
      placePresetId: ['', Validators.required],
      name: ['', Validators.required],
      courtLabel: [''],
      capacity: [0],
      notes: [''],
      parentVenueId: [''],
    }),
    bracket: fb.nonNullable.group({
      randomizeUnseeded: [true],
      randomSeed: [''],
      replaceExistingDraft: [false],
    }),
  };
}

export function createPlacementPointForm(fb: FormBuilder, position: number, points = 0) {
  return fb.group({
    position: fb.nonNullable.control(position, [Validators.required, Validators.min(1), Validators.max(100)]),
    points: fb.nonNullable.control(points, [Validators.required, Validators.min(0), Validators.max(1_000_000)]),
  });
}
