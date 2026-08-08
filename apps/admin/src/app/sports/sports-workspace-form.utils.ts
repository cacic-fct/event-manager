import { AbstractControl, ValidationErrors } from '@angular/forms';

export interface SportsTimerFormValue {
  timerOverallEnabled?: boolean;
  timerPeriodEnabled?: boolean;
  timerPeriodDurationMinutes?: number;
  timerAllowOvertime?: boolean;
  timerPeriodStartOffsetsMinutes?: string;
}

export function sportsTimerPreset(preset: string): (Required<SportsTimerFormValue> & { timerPreset: string }) | null {
  const values = {
    SOCCER: { duration: 45, overtime: true, offsets: '0, 45' },
    FUTSAL: { duration: 20, overtime: true, offsets: '0, 20' },
    BASKETBALL: { duration: 10, overtime: true, offsets: '0, 10, 20, 30' },
    VOLLEYBALL: { duration: 0, overtime: true, offsets: '0' },
    TENNIS: { duration: 0, overtime: true, offsets: '0' },
    CHESS: { duration: 0, overtime: false, offsets: '0' },
    ESPORTS: { duration: 0, overtime: true, offsets: '0' },
  }[preset];
  if (!values) {
    return null;
  }
  return {
    timerPreset: preset,
    timerOverallEnabled: true,
    timerPeriodEnabled: preset !== 'CHESS',
    timerPeriodDurationMinutes: values.duration,
    timerAllowOvertime: values.overtime,
    timerPeriodStartOffsetsMinutes: values.offsets,
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
  return Boolean(provider) === Boolean(url) ? null : { incompleteLivestream: true };
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

export function defaultSportEmoji(sport: string): string {
  return (
    {
      SOCCER: '⚽',
      FUTSAL: '⚽',
      TENNIS: '🎾',
      BASKETBALL: '🏀',
      ESPORTS: '🎮',
      CHESS: '♟️',
      VOLLEYBALL: '🏐',
      SWIMMING: '🏊',
      TABLE_TENNIS: '🏓',
      HANDBALL: '🤾',
    }[sport] ?? '🏅'
  );
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
