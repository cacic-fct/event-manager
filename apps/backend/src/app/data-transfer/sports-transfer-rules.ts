import { BadRequestException } from '@nestjs/common';

type PlainRecord = Record<string, unknown>;

function record(value: unknown, name: string): PlainRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${name} deve ser um objeto JSON.`);
  }
  return value as PlainRecord;
}

function assertOnlyKeys(value: PlainRecord, allowed: readonly string[], name: string): void {
  const allowedKeys = new Set(allowed);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new BadRequestException(`${name} contém campos desconhecidos.`);
  }
}

export function assertSportsTimerRules(value: unknown): void {
  const rules = record(value, 'timerRules');
  assertOnlyKeys(
    rules,
    ['overallEnabled', 'periodEnabled', 'periodDurationMs', 'allowOvertime', 'periodStartOffsetsMs'],
    'timerRules',
  );
  for (const key of ['overallEnabled', 'periodEnabled', 'allowOvertime']) {
    if (rules[key] !== undefined && typeof rules[key] !== 'boolean') {
      throw new BadRequestException(`${key} deve ser booleano.`);
    }
  }
  if (
    rules['periodDurationMs'] !== undefined &&
    (!Number.isSafeInteger(rules['periodDurationMs']) ||
      (rules['periodDurationMs'] as number) < 0 ||
      (rules['periodDurationMs'] as number) > 24 * 60 * 60 * 1000)
  ) {
    throw new BadRequestException('periodDurationMs deve ser um inteiro entre 0 e 86400000.');
  }
  if (rules['periodStartOffsetsMs'] !== undefined) {
    const offsets = rules['periodStartOffsetsMs'];
    if (
      !Array.isArray(offsets) ||
      offsets.length > 128 ||
      offsets.some(
        (offset) =>
          !Number.isSafeInteger(offset) || (offset as number) < 0 || (offset as number) > 7 * 24 * 60 * 60 * 1000,
      )
    ) {
      throw new BadRequestException('periodStartOffsetsMs deve conter deslocamentos inteiros válidos.');
    }
  }
}

export function assertSportsScoreRules(value: unknown): void {
  const rules = record(value, 'scoreRules');
  assertOnlyKeys(rules, ['strategy', 'allowDraw', 'higherWins', 'pointStep'], 'scoreRules');
  if (
    rules['strategy'] !== undefined &&
    !['TOTAL', 'SETS', 'ROUNDS', 'PLACEMENT', 'CUSTOM'].includes(String(rules['strategy']))
  ) {
    throw new BadRequestException('strategy em scoreRules não é válido.');
  }
  for (const key of ['allowDraw', 'higherWins']) {
    if (rules[key] !== undefined && typeof rules[key] !== 'boolean') {
      throw new BadRequestException(`${key} em scoreRules deve ser booleano.`);
    }
  }
  if (
    rules['pointStep'] !== undefined &&
    (typeof rules['pointStep'] !== 'number' || !Number.isFinite(rules['pointStep']) || rules['pointStep'] <= 0)
  ) {
    throw new BadRequestException('pointStep deve ser um número positivo finito.');
  }
}
