import { FormControl, FormGroup } from '@angular/forms';
import {
  categoryFormValidator,
  competitionRulesFromForm,
  competitionRulesToForm,
  integerValidator,
  jsonObjectValidator,
  livestreamValidator,
  matchDateRangeValidator,
  nonNegativeIntegerValidator,
  overallPlacementPointsValidator,
  overallScoringRulesFromForm,
  overallScoringRulesToForm,
  scoreRulesValidator,
  sportsTimerPreset,
  timerRulesFromForm,
  timerRulesToForm,
} from './sports-workspace-form.utils';

describe('sports workspace form utilities', () => {
  it('maps competition rules to controls without discarding compatibility keys', () => {
    const formValue = competitionRulesToForm(
      '{"strategy":"SETS","allowDraw":false,"higherWins":true,"pointStep":0.5}',
      '{"winPoints":2,"drawPoints":1,"lossPoints":-1,"byePoints":2}',
      '{"groupCount":4,"qualifiersPerGroup":2,"maximumRounds":7,"legacyFlag":true}',
      'GROUP_STAGE_ELIMINATION',
    );

    expect(formValue).toMatchObject({
      scoreAllowDraw: false,
      scorePointStep: 0.5,
      standingsWinPoints: 2,
      standingsLossPoints: -1,
      groupCount: 4,
      swissMaximumRounds: 7,
    });

    const persisted = competitionRulesFromForm(
      { ...formValue, groupCount: 8 },
      {
        scoreRulesJson: '{"strategy":"SETS"}',
        standingsRulesJson: '{}',
        bracketRulesJson: '{"legacyFlag":true}',
      },
    );
    expect(JSON.parse(persisted.scoreRulesJson)).toMatchObject({ strategy: 'SETS', allowDraw: false });
    expect(JSON.parse(persisted.bracketRulesJson)).toMatchObject({ legacyFlag: true, groupCount: 8 });
  });

  it('rejects unsafe and unsupported JSON configuration', () => {
    expect(jsonObjectValidator(new FormControl('[]', { nonNullable: true }))).toEqual({ jsonObject: true });
    expect(jsonObjectValidator(new FormControl('{"constructor":{}}', { nonNullable: true }))).toEqual({
      jsonUnsafe: true,
    });
    expect(scoreRulesValidator(new FormControl('{"pointStep":0}', { nonNullable: true }))).toEqual({
      scorePointStep: true,
    });
  });

  it('keeps livestream provider and URL paired', () => {
    const form = new FormGroup({
      livestreamProvider: new FormControl('GENERAL', { nonNullable: true }),
      livestreamUrl: new FormControl('', { nonNullable: true }),
    });
    expect(livestreamValidator(form)).toEqual({ incompleteLivestream: true });
    form.controls.livestreamUrl.setValue('https://example.com/live');
    expect(livestreamValidator(form)).toBeNull();
    form.controls.livestreamProvider.setValue('YOUTUBE');
    expect(livestreamValidator(form)).toEqual({ invalidLivestreamUrl: true });
    form.controls.livestreamUrl.setValue('https://www.youtube.com/watch?v=abc');
    expect(livestreamValidator(form)).toBeNull();
  });

  it('rejects invalid category, match, and numeric form values before submission', () => {
    const startDate = new Date(Date.now() + 60 * 60 * 1_000).toISOString();
    const endDate = new Date(Date.now() + 2 * 60 * 60 * 1_000).toISOString();
    const category = new FormGroup({
      sport: new FormControl('OTHER', { nonNullable: true }),
      customSportName: new FormControl('', { nonNullable: true }),
      registrationStartDate: new FormControl(endDate, { nonNullable: true }),
      registrationEndDate: new FormControl(startDate, { nonNullable: true }),
      minimumRosterSize: new FormControl(8, { nonNullable: true }),
      maximumRosterSize: new FormControl(4, { nonNullable: true }),
    });
    expect(categoryFormValidator(category)).toEqual({ customSportNameRequired: true });
    category.controls.customSportName.setValue('Queimada');
    expect(categoryFormValidator(category)).toEqual({ invalidDateRange: true });
    category.controls.registrationStartDate.setValue(startDate);
    category.controls.registrationEndDate.setValue(endDate);
    expect(categoryFormValidator(category)).toEqual({ invalidRosterRange: true });

    const match = new FormGroup({
      startDate: new FormControl(endDate, { nonNullable: true }),
      endDate: new FormControl(startDate, { nonNullable: true }),
    });
    expect(matchDateRangeValidator(match)).toEqual({ invalidDateRange: true });
    expect(integerValidator(new FormControl(1.5))).toEqual({ integer: true });
    expect(nonNegativeIntegerValidator(new FormControl(-1))).toEqual({ nonNegativeInteger: true });
  });

  it('converts flexible overall scoring rules and validates placement points', () => {
    const formValue = overallScoringRulesToForm(
      '{"mode":"MATCH_RESULT_AND_FINAL_PLACEMENT","match":{"win":3,"draw":1,"loss":0},"placement":{"1":10,"2":6,"12":1}}',
    );
    expect(formValue).toMatchObject({
      overallScoringMode: 'MATCH_RESULT_AND_FINAL_PLACEMENT',
      overallMatchWinPoints: 3,
      overallPlacementPointsJson: '{"1":10,"2":6,"12":1}',
      overallPlacementPoints: [
        { position: 1, points: 10 },
        { position: 2, points: 6 },
        { position: 12, points: 1 },
      ],
    });
    expect(JSON.parse(overallScoringRulesFromForm(formValue))).toEqual({
      mode: 'MATCH_RESULT_AND_FINAL_PLACEMENT',
      match: { win: 3, draw: 1, loss: 0 },
      placement: { '1': 10, '2': 6, '12': 1 },
    });
    expect(overallPlacementPointsValidator(new FormControl('{"101":1}', { nonNullable: true }))).toEqual({
      overallPlacementKey: true,
    });
  });

  it('converts timer rules between persisted milliseconds and form minutes', () => {
    const formValue = timerRulesToForm(
      '{"overallEnabled":true,"periodEnabled":true,"periodDurationMs":600000,"allowOvertime":false,"periodStartOffsetsMs":[0,600000]}',
    );
    expect(formValue.timerPeriodDurationMinutes).toBe(10);
    expect(formValue.timerPeriodStartOffsetsMinutes).toBe('0, 10');
    expect(JSON.parse(timerRulesFromForm(formValue))).toEqual({
      overallEnabled: true,
      periodEnabled: true,
      periodDurationMs: 600000,
      allowOvertime: false,
      periodStartOffsetsMs: [0, 600000],
    });
  });

  it('keeps timer presets grouped with timer form transformations', () => {
    expect(sportsTimerPreset('BASKETBALL')).toMatchObject({
      timerPeriodDurationMinutes: 10,
      timerPeriodStartOffsetsMinutes: '0, 10, 20, 30',
      timerPeriodEnabled: true,
    });
    expect(sportsTimerPreset('UNKNOWN')).toBeNull();
  });
});
