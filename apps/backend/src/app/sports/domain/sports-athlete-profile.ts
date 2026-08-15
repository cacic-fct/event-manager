import { BadRequestException } from '@nestjs/common';

export interface SportsAthleteProfilePatch {
  shirtNumber?: string | null;
  gameNickname?: string | null;
  gameAccountName?: string | null;
  gameAccountUrl?: string | null;
}

const CONTROL_CHARACTER_PATTERN = /[\p{Cc}\p{Cf}]/u;

export function normalizeSportsAthleteProfilePatch(input: SportsAthleteProfilePatch): SportsAthleteProfilePatch {
  if (
    input.shirtNumber === undefined &&
    input.gameNickname === undefined &&
    input.gameAccountName === undefined &&
    input.gameAccountUrl === undefined
  ) {
    throw new BadRequestException('Informe ao menos um dado de identificação do atleta.');
  }

  return {
    ...(input.shirtNumber !== undefined
      ? { shirtNumber: normalizeShirtNumber(input.shirtNumber) }
      : {}),
    ...(input.gameNickname !== undefined
      ? { gameNickname: normalizeProfileText(input.gameNickname, 'apelido no jogo', 80) }
      : {}),
    ...(input.gameAccountName !== undefined
      ? { gameAccountName: normalizeProfileText(input.gameAccountName, 'nome da conta', 160) }
      : {}),
    ...(input.gameAccountUrl !== undefined ? { gameAccountUrl: normalizeAccountUrl(input.gameAccountUrl) } : {}),
  };
}

function normalizeShirtNumber(value: string | null): string | null {
  const normalized = value?.trim() || null;
  if (!normalized) {
    return null;
  }
  if (normalized.length > 12 || !/^[\p{L}\p{N}._-]+$/u.test(normalized)) {
    throw new BadRequestException('O número de camisa deve ter até 12 letras ou números.');
  }
  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new BadRequestException('O número de camisa contém caracteres inválidos.');
  }
  return normalized;
}

function normalizeProfileText(value: string | null, label: string, maximumLength: number): string | null {
  const normalized = value?.trim() || null;
  if (!normalized) {
    return null;
  }
  if (normalized.length > maximumLength) {
    throw new BadRequestException(`${capitalize(label)} deve ter no máximo ${maximumLength} caracteres.`);
  }
  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new BadRequestException(`${capitalize(label)} contém caracteres inválidos.`);
  }
  return normalized;
}

function normalizeAccountUrl(value: string | null): string | null {
  const normalized = value?.trim() || null;
  if (!normalized) {
    return null;
  }
  if (normalized.length > 2_048) {
    throw new BadRequestException('O link da conta deve ter no máximo 2.048 caracteres.');
  }
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error('unsupported URL');
    }
  } catch {
    throw new BadRequestException('Informe um link HTTPS válido para a conta de jogo.');
  }
  return normalized;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase('pt-BR')}${value.slice(1)}`;
}
