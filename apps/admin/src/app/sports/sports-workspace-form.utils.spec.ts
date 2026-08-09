import { FormControl, FormGroup } from '@angular/forms';
import {
  jsonObjectValidator,
  livestreamValidator,
  overallPlacementPointsValidator,
  overallScoringRulesFromForm,
  overallScoringRulesToForm,
  scoreRulesValidator,
  sportsTimerPreset,
  timerRulesFromForm,
  timerRulesToForm,
} from './sports-workspace-form.utils';

describe('sports workspace form utilities', () => {
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
      livestreamProvider: new FormControl('YouTube', { nonNullable: true }),
      livestreamUrl: new FormControl('', { nonNullable: true }),
    });
    expect(livestreamValidator(form)).toEqual({ incompleteLivestream: true });
    form.controls.livestreamUrl.setValue('https://example.com/live');
    expect(livestreamValidator(form)).toBeNull();
  });

  it('converts flexible overall scoring rules and validates placement points', () => {
    const formValue = overallScoringRulesToForm(
      '{"mode":"MATCH_RESULT_AND_FINAL_PLACEMENT","match":{"win":3,"draw":1,"loss":0},"placement":{"1":10,"2":6}}',
    );
    expect(formValue).toMatchObject({
      overallScoringMode: 'MATCH_RESULT_AND_FINAL_PLACEMENT',
      overallMatchWinPoints: 3,
      overallPlacementPointsJson: '{"1":10,"2":6}',
    });
    expect(JSON.parse(overallScoringRulesFromForm(formValue))).toEqual({
      mode: 'MATCH_RESULT_AND_FINAL_PLACEMENT',
      match: { win: 3, draw: 1, loss: 0 },
      placement: { '1': 10, '2': 6 },
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
