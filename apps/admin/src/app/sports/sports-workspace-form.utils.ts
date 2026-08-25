import { AbstractControl, ValidationErrors } from '@angular/forms';
import {
  DEFAULT_SPORTS_BRACKET_EDITOR_RULES,
  DEFAULT_SPORTS_OVERALL_SCORING_RULES,
  DEFAULT_SPORTS_SCORE_RULES,
  DEFAULT_SPORTS_STANDINGS_RULES,
  getSportsTimerPreset,
  type SportsOverallScoringMode,
} from '@cacic-fct/shared-data-types/sports-metadata';

export interface SportsTimerFormValue {
  timerOverallEnabled?: boolean;
  timerPeriodEnabled?: boolean;
  timerPeriodDurationMinutes?: number;
  timerAllowOvertime?: boolean;
  timerPeriodStartOffsetsMinutes?: string;
}

export interface SportsOverallScoringFormValue {
  overallScoringMode?: SportsOverallScoringMode;
  overallMatchWinPoints?: number;
  overallMatchDrawPoints?: number;
  overallMatchLossPoints?: number;
  overallPlacementPointsJson?: string;
  overallPlacementPoints?: Array<{ position?: number; points?: number }>;
}

export interface SportsCompetitionRulesFormValue {
  format?: string;
  scoreAllowDraw?: boolean;
  scoreHigherWins?: boolean;
  scorePointStep?: number;
  standingsWinPoints?: number;
  standingsDrawPoints?: number;
  standingsLossPoints?: number;
  standingsByePoints?: number;
  doubleRoundRobin?: boolean;
  groupCount?: number;
  qualifiersPerGroup?: number;
  swissMaximumRounds?: number;
}

export function competitionRulesToForm(
  scoreRulesJson: string,
  standingsRulesJson: string,
  bracketRulesJson: string,
  format: string,
): Required<SportsCompetitionRulesFormValue> {
  const score = safeObject(scoreRulesJson);
  const standings = safeObject(standingsRulesJson);
  const bracket = safeObject(bracketRulesJson);
  return {
    scoreAllowDraw: typeof score['allowDraw'] === 'boolean' ? score['allowDraw'] : DEFAULT_SPORTS_SCORE_RULES.allowDraw,
    scoreHigherWins:
      typeof score['higherWins'] === 'boolean' ? score['higherWins'] : DEFAULT_SPORTS_SCORE_RULES.higherWins,
    scorePointStep: positiveNumber(score['pointStep'], DEFAULT_SPORTS_SCORE_RULES.pointStep),
    standingsWinPoints: finiteNumber(standings['winPoints'], DEFAULT_SPORTS_STANDINGS_RULES.winPoints),
    standingsDrawPoints: finiteNumber(standings['drawPoints'], DEFAULT_SPORTS_STANDINGS_RULES.drawPoints),
    standingsLossPoints: finiteNumber(standings['lossPoints'], DEFAULT_SPORTS_STANDINGS_RULES.lossPoints),
    standingsByePoints: finiteNumber(standings['byePoints'], DEFAULT_SPORTS_STANDINGS_RULES.byePoints),
    format,
    doubleRoundRobin:
      format === 'ROUND_ROBIN' ? standings['doubleRoundRobin'] === true : bracket['doubleRoundRobin'] === true,
    groupCount: positiveInteger(bracket['groupCount'], DEFAULT_SPORTS_BRACKET_EDITOR_RULES.groupCount),
    qualifiersPerGroup: positiveInteger(
      bracket['qualifiersPerGroup'],
      DEFAULT_SPORTS_BRACKET_EDITOR_RULES.qualifiersPerGroup,
    ),
    swissMaximumRounds: positiveInteger(
      bracket['maximumRounds'],
      DEFAULT_SPORTS_BRACKET_EDITOR_RULES.swissMaximumRounds,
    ),
  };
}

export function competitionRulesFromForm(
  raw: SportsCompetitionRulesFormValue,
  current: { scoreRulesJson?: string; standingsRulesJson?: string; bracketRulesJson?: string },
) {
  const format = raw.format ?? '';
  const standingsPatch: Record<string, unknown> = {
    winPoints: finiteNumber(raw.standingsWinPoints, DEFAULT_SPORTS_STANDINGS_RULES.winPoints),
    drawPoints: finiteNumber(raw.standingsDrawPoints, DEFAULT_SPORTS_STANDINGS_RULES.drawPoints),
    lossPoints: finiteNumber(raw.standingsLossPoints, DEFAULT_SPORTS_STANDINGS_RULES.lossPoints),
    byePoints: finiteNumber(raw.standingsByePoints, DEFAULT_SPORTS_STANDINGS_RULES.byePoints),
  };
  const bracketPatch: Record<string, unknown> = {};
  if (format === 'ROUND_ROBIN') {
    standingsPatch['doubleRoundRobin'] = raw.doubleRoundRobin === true;
  }
  if (format === 'GROUP_STAGE_ELIMINATION') {
    bracketPatch['groupCount'] = positiveInteger(raw.groupCount, DEFAULT_SPORTS_BRACKET_EDITOR_RULES.groupCount);
    bracketPatch['qualifiersPerGroup'] = positiveInteger(
      raw.qualifiersPerGroup,
      DEFAULT_SPORTS_BRACKET_EDITOR_RULES.qualifiersPerGroup,
    );
    bracketPatch['doubleRoundRobin'] = raw.doubleRoundRobin === true;
  }
  if (format === 'SWISS') {
    bracketPatch['maximumRounds'] = positiveInteger(
      raw.swissMaximumRounds,
      DEFAULT_SPORTS_BRACKET_EDITOR_RULES.swissMaximumRounds,
    );
  }
  return {
    scoreRulesJson: mergeJsonObject(current.scoreRulesJson, {
      allowDraw: raw.scoreAllowDraw !== false,
      higherWins: raw.scoreHigherWins !== false,
      pointStep: positiveNumber(raw.scorePointStep, DEFAULT_SPORTS_SCORE_RULES.pointStep),
    }),
    standingsRulesJson: mergeJsonObject(current.standingsRulesJson, standingsPatch),
    bracketRulesJson: mergeJsonObject(current.bracketRulesJson, bracketPatch),
  };
}

export function sportsTimerPreset(preset: string): (Required<SportsTimerFormValue> & { timerPreset: string }) | null {
  const values = getSportsTimerPreset(preset);
  if (!values) {
    return null;
  }
  return {
    timerPreset: values.key,
    timerOverallEnabled: values.overallEnabled,
    timerPeriodEnabled: values.periodEnabled,
    timerPeriodDurationMinutes: values.periodDurationMinutes,
    timerAllowOvertime: values.allowOvertime,
    timerPeriodStartOffsetsMinutes: values.periodStartOffsetsMinutes.join(', '),
  };
}

export function jsonObjectValidator(control: AbstractControl<string>): ValidationErrors | null {
  if (control.value.length > 20_000) {
    return { jsonTooLarge: true };
  }
  try {
    const parsed: unknown = JSON.parse(control.value || '{}');
    if (!isPlainObject(parsed)) {
      return { jsonObject: true };
    }
    return isSafeJson(parsed, 0) ? null : { jsonUnsafe: true };
  } catch {
    return { json: true };
  }
}

export function livestreamValidator(control: AbstractControl): ValidationErrors | null {
  const provider = control.get('livestreamProvider')?.value;
  const url = control.get('livestreamUrl')?.value;
  if (Boolean(provider) !== Boolean(url)) {
    return { incompleteLivestream: true };
  }
  if (!provider || !url) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(String(url).trim());
  } catch {
    return { invalidLivestreamUrl: true };
  }
  if (parsed.protocol !== 'https:') {
    return { invalidLivestreamUrl: true };
  }
  const hostname = parsed.hostname.toLocaleLowerCase('en-US');
  if (
    (provider === 'YOUTUBE' &&
      hostname !== 'youtu.be' &&
      hostname !== 'youtube.com' &&
      !hostname.endsWith('.youtube.com')) ||
    (provider === 'TWITCH' && hostname !== 'twitch.tv' && !hostname.endsWith('.twitch.tv'))
  ) {
    return { invalidLivestreamUrl: true };
  }
  return null;
}

export function tournamentRegistrationWindowValidator(control: AbstractControl): ValidationErrors | null {
  if (control.get('registrationScheduleMode')?.value !== 'CUSTOM') {
    return null;
  }
  const start = control.get('registrationStartDate')?.value;
  const end = control.get('registrationEndDate')?.value;
  if (!start || !end) {
    return { incompleteRegistrationWindow: true };
  }
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate
    ? { invalidRegistrationWindow: true }
    : null;
}

export function categoryFormValidator(control: AbstractControl): ValidationErrors | null {
  const sport = control.get('sport')?.value;
  if (sport === 'OTHER' && !String(control.get('customSportName')?.value ?? '').trim()) {
    return { customSportNameRequired: true };
  }
  const registrationWindow = dateRangeError(
    control.get('registrationStartDate')?.value,
    control.get('registrationEndDate')?.value,
  );
  if (registrationWindow) {
    return registrationWindow;
  }
  const minimum = control.get('minimumRosterSize')?.value;
  const maximum = control.get('maximumRosterSize')?.value;
  if (typeof minimum === 'number' && typeof maximum === 'number' && minimum > 0 && maximum > 0 && minimum > maximum) {
    return { invalidRosterRange: true };
  }
  return null;
}

export function matchDateRangeValidator(control: AbstractControl): ValidationErrors | null {
  return dateRangeError(control.get('startDate')?.value, control.get('endDate')?.value, true);
}

export function integerValidator(control: AbstractControl): ValidationErrors | null {
  return Number.isSafeInteger(control.value) ? null : { integer: true };
}

export function nonNegativeIntegerValidator(control: AbstractControl): ValidationErrors | null {
  return Number.isSafeInteger(control.value) && control.value >= 0 ? null : { nonNegativeInteger: true };
}

export function scoreRulesValidator(control: AbstractControl<string>): ValidationErrors | null {
  const base = jsonObjectValidator(control);
  if (base) {
    return base;
  }
  const parsed = JSON.parse(control.value || '{}') as Record<string, unknown>;
  const allowedKeys = new Set(['strategy', 'allowDraw', 'higherWins', 'pointStep']);
  if (Object.keys(parsed).some((key) => !allowedKeys.has(key))) {
    return { scoreRuleKey: true };
  }
  if (
    parsed['strategy'] !== undefined &&
    !['TOTAL', 'SETS', 'ROUNDS', 'PLACEMENT', 'CUSTOM'].includes(String(parsed['strategy']))
  ) {
    return { scoreStrategy: true };
  }
  if (parsed['allowDraw'] !== undefined && typeof parsed['allowDraw'] !== 'boolean') {
    return { scoreAllowDraw: true };
  }
  if (parsed['higherWins'] !== undefined && typeof parsed['higherWins'] !== 'boolean') {
    return { scoreHigherWins: true };
  }
  if (
    parsed['pointStep'] !== undefined &&
    (typeof parsed['pointStep'] !== 'number' || !Number.isFinite(parsed['pointStep']) || parsed['pointStep'] <= 0)
  ) {
    return { scorePointStep: true };
  }
  return null;
}

export function overallPlacementPointsValidator(control: AbstractControl<string>): ValidationErrors | null {
  const base = jsonObjectValidator(control);
  if (base) {
    return base;
  }
  const parsed = JSON.parse(control.value || '{}') as Record<string, unknown>;
  for (const [placement, points] of Object.entries(parsed)) {
    if (!/^\d+$/.test(placement) || Number(placement) < 1 || Number(placement) > 100) {
      return { overallPlacementKey: true };
    }
    if (typeof points !== 'number' || !Number.isSafeInteger(points) || points < 0 || points > 1_000_000) {
      return { overallPlacementPoints: true };
    }
  }
  return null;
}

export function placementPointsValidator(control: AbstractControl): ValidationErrors | null {
  const entries = control.value as Array<{ position?: unknown }>;
  const positions = entries
    .map((entry) => entry.position)
    .filter((position): position is number => typeof position === 'number' && Number.isSafeInteger(position));
  return new Set(positions).size === positions.length ? null : { duplicatePlacement: true };
}

export function overallScoringRulesToForm(value: string, legacyBracketRulesJson = '{}'): SportsOverallScoringFormValue {
  const fallback = {
    overallScoringMode: DEFAULT_SPORTS_OVERALL_SCORING_RULES.mode,
    overallMatchWinPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.win,
    overallMatchDrawPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.draw,
    overallMatchLossPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.loss,
    overallPlacementPointsJson: '{}',
    overallPlacementPoints: [],
  };
  try {
    const rules = JSON.parse(value || '{}') as Record<string, unknown>;
    const match = (rules['match'] ?? {}) as Record<string, unknown>;
    let legacyPlacement: unknown = undefined;
    if (rules['placement'] === undefined) {
      try {
        const legacyBracketRules = JSON.parse(legacyBracketRulesJson || '{}') as Record<string, unknown>;
        legacyPlacement = legacyBracketRules['placementPoints'];
      } catch {
        legacyPlacement = undefined;
      }
    }
    const placement = rules['placement'] ?? legacyPlacement;
    const placementEnabled = placement && typeof placement === 'object' && !Array.isArray(placement);
    const hasLegacyPlacement = placementEnabled && Object.keys(placement as Record<string, unknown>).length > 0;
    const mode = String(rules['mode'] ?? (hasLegacyPlacement ? 'FINAL_PLACEMENT' : 'NONE'));
    const normalizedMode: SportsOverallScoringMode = [
      'NONE',
      'MATCH_RESULT',
      'FINAL_PLACEMENT',
      'MATCH_RESULT_AND_FINAL_PLACEMENT',
    ].includes(mode)
      ? (mode as SportsOverallScoringMode)
      : fallback.overallScoringMode;
    return {
      overallScoringMode: normalizedMode,
      overallMatchWinPoints: typeof match['win'] === 'number' ? match['win'] : fallback.overallMatchWinPoints,
      overallMatchDrawPoints: typeof match['draw'] === 'number' ? match['draw'] : fallback.overallMatchDrawPoints,
      overallMatchLossPoints: typeof match['loss'] === 'number' ? match['loss'] : fallback.overallMatchLossPoints,
      overallPlacementPointsJson: placementEnabled ? JSON.stringify(placement) : fallback.overallPlacementPointsJson,
      overallPlacementPoints: placementEntries(placementEnabled ? (placement as Record<string, unknown>) : {}),
    };
  } catch {
    return fallback;
  }
}

export function overallScoringRulesFromForm(raw: SportsOverallScoringFormValue): string {
  const placement = Object.fromEntries(
    (raw.overallPlacementPoints ?? []).flatMap(({ position, points }) =>
      typeof position === 'number' &&
      Number.isSafeInteger(position) &&
      position >= 1 &&
      position <= 100 &&
      typeof points === 'number' &&
      points > 0
        ? [[String(position), points] as const]
        : [],
    ),
  );
  return JSON.stringify({
    mode: raw.overallScoringMode || 'NONE',
    match: {
      win: Number(raw.overallMatchWinPoints ?? 0),
      draw: Number(raw.overallMatchDrawPoints ?? 0),
      loss: Number(raw.overallMatchLossPoints ?? 0),
    },
    placement,
  });
}

function placementEntries(placement: Record<string, unknown>) {
  return Object.entries(placement)
    .map(([position, points]) => ({ position: Number(position), points: finiteNumber(points, 0) }))
    .filter(({ position, points }) => Number.isSafeInteger(position) && position >= 1 && position <= 100 && points >= 0)
    .sort((left, right) => left.position - right.position);
}

export function timerRulesToForm(value: string): Required<SportsTimerFormValue> & { timerPreset: string } {
  try {
    const rules = JSON.parse(value || '{}') as Record<string, unknown>;
    const offsets = Array.isArray(rules['periodStartOffsetsMs'])
      ? rules['periodStartOffsetsMs'].filter((item): item is number => Number.isSafeInteger(item))
      : [0];
    return {
      timerPreset: 'CUSTOM',
      timerOverallEnabled: rules['overallEnabled'] !== false,
      timerPeriodEnabled: rules['periodEnabled'] !== false,
      timerPeriodDurationMinutes:
        typeof rules['periodDurationMs'] === 'number' ? rules['periodDurationMs'] / 60_000 : 0,
      timerAllowOvertime: rules['allowOvertime'] !== false,
      timerPeriodStartOffsetsMinutes: offsets.map((item) => item / 60_000).join(', '),
    };
  } catch {
    return {
      timerPreset: 'CUSTOM',
      timerOverallEnabled: true,
      timerPeriodEnabled: true,
      timerPeriodDurationMinutes: 0,
      timerAllowOvertime: true,
      timerPeriodStartOffsetsMinutes: '0',
    };
  }
}

export function timerRulesFromForm(raw: SportsTimerFormValue): string {
  const offsets = String(raw.timerPeriodStartOffsetsMinutes ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .map((value) => Math.round(value * 60_000));
  const periodDurationMs = Math.round((raw.timerPeriodDurationMinutes ?? 0) * 60_000);
  return JSON.stringify({
    overallEnabled: raw.timerOverallEnabled,
    periodEnabled: raw.timerPeriodEnabled,
    ...(periodDurationMs > 0 ? { periodDurationMs } : {}),
    allowOvertime: raw.timerAllowOvertime,
    periodStartOffsetsMs: offsets.length ? offsets : [0],
  });
}

export function toIsoDateOrNull(value?: string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function toIsoDateOrUndefined(value?: string | null): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

export function toLocalDate(value?: string | null): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeObject(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeJsonObject(value: string | null | undefined, patch: Record<string, unknown>): string {
  return JSON.stringify({ ...safeObject(value), ...patch });
}

function dateRangeError(start: unknown, end: unknown, required = false): ValidationErrors | null {
  if (!start || !end) {
    return required || Boolean(start) !== Boolean(end) ? { incompleteDateRange: true } : null;
  }
  const startDate = new Date(String(start));
  const endDate = new Date(String(end));
  return Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate
    ? { invalidDateRange: true }
    : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return number > 0 ? number : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  const number = positiveNumber(value, fallback);
  return Number.isSafeInteger(number) ? number : fallback;
}

function isSafeJson(value: unknown, depth: number): boolean {
  if (depth > 6) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every((item) => isSafeJson(item, depth + 1));
  }
  if (!isPlainObject(value)) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  const entries = Object.entries(value);
  return (
    entries.length <= 100 &&
    entries.every(
      ([key, item]) => !['__proto__', 'constructor', 'prototype'].includes(key) && isSafeJson(item, depth + 1),
    )
  );
}
