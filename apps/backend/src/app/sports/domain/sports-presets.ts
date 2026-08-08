export const SPORTS_PRESET_KEYS = [
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
] as const;

export type SportsPresetKey = (typeof SPORTS_PRESET_KEYS)[number];

export const SPORTS_FORMAT_KEYS = [
  'SINGLE_ELIMINATION',
  'ROUND_ROBIN',
  'GROUP_STAGE_ELIMINATION',
  'DOUBLE_ELIMINATION',
  'SWISS',
  'CUSTOM',
] as const;

export type SportsFormatKey = (typeof SPORTS_FORMAT_KEYS)[number];

export type SportsScoreStrategy = 'TOTAL' | 'SETS' | 'ROUNDS' | 'PLACEMENT' | 'CUSTOM';

export interface SportsRosterPreset {
  readonly minimumPlayers: number;
  readonly maximumPlayers: number | null;
  readonly maximumCaptains: number | null;
  readonly maximumCoaches: number | null;
}

export interface SportsPeriodPreset {
  readonly enabled: boolean;
  readonly maximum: number | null;
  readonly label: string;
}

export interface SportsScorePreset {
  readonly strategy: SportsScoreStrategy;
  readonly allowDraw: boolean;
  readonly higherWins: boolean;
  readonly pointStep: number;
}

export interface SportsPresetDefinition {
  readonly key: SportsPresetKey;
  readonly label: string;
  readonly description: string;
  readonly roster: SportsRosterPreset;
  readonly periods: SportsPeriodPreset;
  readonly score: SportsScorePreset;
  readonly suggestedFormats: readonly SportsFormatKey[];
}

const TEAM_KNOCKOUT_FORMATS = [
  'SINGLE_ELIMINATION',
  'ROUND_ROBIN',
  'GROUP_STAGE_ELIMINATION',
] as const satisfies readonly SportsFormatKey[];

const HEAD_TO_HEAD_FORMATS = [
  'SINGLE_ELIMINATION',
  'ROUND_ROBIN',
  'GROUP_STAGE_ELIMINATION',
  'DOUBLE_ELIMINATION',
] as const satisfies readonly SportsFormatKey[];

const PRESET_CATALOG: Record<SportsPresetKey, SportsPresetDefinition> = {
  SOCCER: {
    key: 'SOCCER',
    label: 'Futebol',
    description: 'Placar total com tempos configuráveis e possibilidade de empate.',
    roster: {
      minimumPlayers: 7,
      maximumPlayers: 26,
      maximumCaptains: 1,
      maximumCoaches: 1,
    },
    periods: {
      enabled: true,
      maximum: 2,
      label: 'Tempo',
    },
    score: {
      strategy: 'TOTAL',
      allowDraw: true,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: TEAM_KNOCKOUT_FORMATS,
  },
  FUTSAL: {
    key: 'FUTSAL',
    label: 'Futsal',
    description: 'Placar total com dois tempos e possibilidade de empate.',
    roster: {
      minimumPlayers: 5,
      maximumPlayers: 18,
      maximumCaptains: 1,
      maximumCoaches: 1,
    },
    periods: {
      enabled: true,
      maximum: 2,
      label: 'Tempo',
    },
    score: {
      strategy: 'TOTAL',
      allowDraw: true,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: TEAM_KNOCKOUT_FORMATS,
  },
  TENNIS: {
    key: 'TENNIS',
    label: 'Tênis',
    description: 'Disputa por sets; a quantidade e as regras podem ser ajustadas pela organização.',
    roster: {
      minimumPlayers: 1,
      maximumPlayers: 6,
      maximumCaptains: 1,
      maximumCoaches: null,
    },
    periods: {
      enabled: true,
      maximum: 5,
      label: 'Set',
    },
    score: {
      strategy: 'SETS',
      allowDraw: false,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: HEAD_TO_HEAD_FORMATS,
  },
  BASKETBALL: {
    key: 'BASKETBALL',
    label: 'Basquete',
    description: 'Placar total dividido em quartos configuráveis.',
    roster: {
      minimumPlayers: 5,
      maximumPlayers: 15,
      maximumCaptains: 1,
      maximumCoaches: 2,
    },
    periods: {
      enabled: true,
      maximum: 4,
      label: 'Quarto',
    },
    score: {
      strategy: 'TOTAL',
      allowDraw: false,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: TEAM_KNOCKOUT_FORMATS,
  },
  ESPORTS: {
    key: 'ESPORTS',
    label: 'E-sports',
    description: 'Rodadas ou mapas genéricos para acomodar diferentes jogos.',
    roster: {
      minimumPlayers: 1,
      maximumPlayers: 10,
      maximumCaptains: 1,
      maximumCoaches: null,
    },
    periods: {
      enabled: true,
      maximum: null,
      label: 'Mapa',
    },
    score: {
      strategy: 'ROUNDS',
      allowDraw: false,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: HEAD_TO_HEAD_FORMATS,
  },
  CHESS: {
    key: 'CHESS',
    label: 'Xadrez',
    description: 'Pontuação por partida, incluindo meios pontos quando configurado.',
    roster: {
      minimumPlayers: 1,
      maximumPlayers: null,
      maximumCaptains: 1,
      maximumCoaches: null,
    },
    periods: {
      enabled: false,
      maximum: null,
      label: 'Rodada',
    },
    score: {
      strategy: 'TOTAL',
      allowDraw: true,
      higherWins: true,
      pointStep: 0.5,
    },
    suggestedFormats: ['SWISS', 'ROUND_ROBIN', 'SINGLE_ELIMINATION'],
  },
  VOLLEYBALL: {
    key: 'VOLLEYBALL',
    label: 'Voleibol',
    description: 'Disputa por sets, com placar de pontos detalhado em cada set.',
    roster: {
      minimumPlayers: 6,
      maximumPlayers: 18,
      maximumCaptains: 1,
      maximumCoaches: 2,
    },
    periods: {
      enabled: true,
      maximum: 5,
      label: 'Set',
    },
    score: {
      strategy: 'SETS',
      allowDraw: false,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: TEAM_KNOCKOUT_FORMATS,
  },
  SWIMMING: {
    key: 'SWIMMING',
    label: 'Natação',
    description: 'Classificação por tempo ou colocação; o menor resultado pode vencer.',
    roster: {
      minimumPlayers: 1,
      maximumPlayers: null,
      maximumCaptains: null,
      maximumCoaches: null,
    },
    periods: {
      enabled: false,
      maximum: null,
      label: 'Bateria',
    },
    score: {
      strategy: 'PLACEMENT',
      allowDraw: true,
      higherWins: false,
      pointStep: 0.001,
    },
    suggestedFormats: ['CUSTOM'],
  },
  TABLE_TENNIS: {
    key: 'TABLE_TENNIS',
    label: 'Tênis de mesa',
    description: 'Disputa por sets com quantidade configurável.',
    roster: {
      minimumPlayers: 1,
      maximumPlayers: 6,
      maximumCaptains: 1,
      maximumCoaches: null,
    },
    periods: {
      enabled: true,
      maximum: 7,
      label: 'Set',
    },
    score: {
      strategy: 'SETS',
      allowDraw: false,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: HEAD_TO_HEAD_FORMATS,
  },
  HANDBALL: {
    key: 'HANDBALL',
    label: 'Handebol',
    description: 'Placar total dividido em dois tempos configuráveis.',
    roster: {
      minimumPlayers: 7,
      maximumPlayers: 18,
      maximumCaptains: 1,
      maximumCoaches: 2,
    },
    periods: {
      enabled: true,
      maximum: 2,
      label: 'Tempo',
    },
    score: {
      strategy: 'TOTAL',
      allowDraw: true,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: TEAM_KNOCKOUT_FORMATS,
  },
  OTHER: {
    key: 'OTHER',
    label: 'Outro esporte',
    description: 'Configuração neutra para regras, placares e formatos personalizados.',
    roster: {
      minimumPlayers: 1,
      maximumPlayers: null,
      maximumCaptains: null,
      maximumCoaches: null,
    },
    periods: {
      enabled: false,
      maximum: null,
      label: 'Período',
    },
    score: {
      strategy: 'CUSTOM',
      allowDraw: true,
      higherWins: true,
      pointStep: 1,
    },
    suggestedFormats: ['CUSTOM'],
  },
};

export function validateSportsPresetCatalog(
  catalog: Readonly<Record<SportsPresetKey, SportsPresetDefinition>>,
): void {
  const formatKeys = new Set<string>(SPORTS_FORMAT_KEYS);

  for (const key of SPORTS_PRESET_KEYS) {
    const preset = catalog[key];
    if (!preset || preset.key !== key) {
      throw new Error(`Invalid sports preset key: ${key}.`);
    }
    if (!preset.label.trim() || !preset.description.trim()) {
      throw new Error(`Sports preset ${key} must have a label and description.`);
    }
    if (!Number.isInteger(preset.roster.minimumPlayers) || preset.roster.minimumPlayers < 1) {
      throw new Error(`Sports preset ${key} must require at least one player.`);
    }
    validateOptionalLimit(preset.roster.maximumPlayers, `${key}.roster.maximumPlayers`);
    validateOptionalLimit(preset.roster.maximumCaptains, `${key}.roster.maximumCaptains`, true);
    validateOptionalLimit(preset.roster.maximumCoaches, `${key}.roster.maximumCoaches`, true);
    if (
      preset.roster.maximumPlayers !== null &&
      preset.roster.maximumPlayers < preset.roster.minimumPlayers
    ) {
      throw new Error(`Sports preset ${key} has a maximum roster below its minimum.`);
    }
    if (!preset.periods.label.trim()) {
      throw new Error(`Sports preset ${key} must have a period label.`);
    }
    if (preset.periods.enabled) {
      validateOptionalLimit(preset.periods.maximum, `${key}.periods.maximum`);
    } else if (preset.periods.maximum !== null) {
      throw new Error(`Sports preset ${key} cannot limit disabled periods.`);
    }
    if (!Number.isFinite(preset.score.pointStep) || preset.score.pointStep <= 0) {
      throw new Error(`Sports preset ${key} must use a positive score step.`);
    }
    if (preset.suggestedFormats.length === 0) {
      throw new Error(`Sports preset ${key} must suggest at least one format.`);
    }
    if (preset.suggestedFormats.some((format) => !formatKeys.has(format))) {
      throw new Error(`Sports preset ${key} suggests an unsupported format.`);
    }
  }
}

function validateOptionalLimit(value: number | null, path: string, allowZero = false): void {
  if (value === null) {
    return;
  }

  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${path} must be null or an integer greater than or equal to ${minimum}.`);
  }
}

validateSportsPresetCatalog(PRESET_CATALOG);

export const SPORTS_PRESETS: Readonly<Record<SportsPresetKey, SportsPresetDefinition>> = PRESET_CATALOG;

export function getSportsPreset(key: SportsPresetKey): SportsPresetDefinition {
  return SPORTS_PRESETS[key];
}
