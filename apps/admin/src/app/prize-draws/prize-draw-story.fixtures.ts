import {
  PrizeDraw,
  PrizeDrawEligibleEntry,
  PrizeDrawSpinResult,
} from '@cacic-fct/event-manager-admin-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { publicPrizeDrawUrl } from '@cacic-fct/shared-utils';

faker.seed(20260826);

export const PRIZE_DRAW_STORY_ID = '019d2a25-4b40-7b2e-82a4-28f596d0b657';
export const PRIZE_DRAW_STORY_SPIN_ID = '019d2a25-5694-7f19-b954-8a98f7bb9a43';
export const PRIZE_DRAW_STORY_TARGET_ID = 'event-story-1';
export const PRIZE_DRAW_STORY_PUBLIC_URL = publicPrizeDrawUrl(
  {
    drawId: PRIZE_DRAW_STORY_ID,
    targetId: PRIZE_DRAW_STORY_TARGET_ID,
    targetType: 'EVENT',
  },
  'https://eventos.cacic.com.br',
);

const baseNow = Date.now();

function isoMinutesFromNow(minutes: number): string {
  return new Date(baseNow + minutes * 60_000).toISOString();
}

export const prizeDrawStoryFullNames = [
  'Ana Beatriz de Souza',
  'Bruno Henrique Almeida',
  'Carla Vitória Costa',
  'Diego Fernandes Lima',
  'Érica Martins Alves',
  'Fábio Augusto Rocha',
  'Gabriela Nunes Pereira',
  'Henrique Oliveira Santos',
  ...Array.from({ length: 72 }, () => faker.person.fullName()),
];

export const prizeDrawStoryLongFullName = [
  faker.person.firstName('female'),
  ...Array.from({ length: 5 }, () => faker.person.lastName()),
].join(' ');

export const prizeDrawStoryWinnerContact = {
  fullName: prizeDrawStoryFullNames[0],
  email: faker.internet.email(),
  phone: faker.phone.number({ style: 'national' }),
  academicId: faker.string.numeric(9),
};

export function toPrizeDrawReelName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0]} ${parts.at(-1)?.charAt(0).toLocaleUpperCase('pt-BR')}.`
    : (parts[0] ?? 'Participante');
}

export function createPrizeDrawStoryEntries(size = 18): PrizeDrawEligibleEntry[] {
  return prizeDrawStoryFullNames.slice(0, Math.max(1, size)).map((displayName, index) => ({
    identityKey: `person:story-${index + 1}`,
    personId: `story-${index + 1}`,
    displayName,
    weight: index % 7 === 0 ? 2 : 1,
    sources: index % 3 === 0 ? ['ATTENDANCE', 'SUBSCRIPTION'] : index % 2 === 0 ? ['ATTENDANCE'] : ['SUBSCRIPTION'],
  }));
}

export function createPrizeDrawStory(
  overrides: Partial<PrizeDraw> & {
    resultsCount?: number;
    eligibleCount?: number;
  } = {},
): PrizeDraw {
  const { resultsCount: resultsOverride, eligibleCount: eligibleOverride, ...drawOverrides } = overrides;
  const resultsCount = resultsOverride ?? 2;
  const eligibleCount = eligibleOverride ?? 18;
  const chanceMode = drawOverrides.chanceMode ?? 'EQUAL';
  const spins = Array.from({ length: resultsCount }, (_, index) => ({
    id: index === 0 ? PRIZE_DRAW_STORY_SPIN_ID : `019d2a25-5694-7f19-b954-8a98f7bb9a${44 + index}`,
    sequence: index + 1,
    plannedSpinId: `planned-${index + 1}`,
    description: index === 0 ? 'Kit institucional' : 'Vale-livros',
    speed: index === 0 ? 'DRAMATIC' as const : 'QUICK' as const,
    countdownSeconds: index === 0 ? 3 : null,
    chanceMode,
    removeWinnerAfterDraw: true,
    winnerDisplayName: prizeDrawStoryFullNames[index],
    winnerPersonId: `story-${index + 1}`,
    winnerWeight: chanceMode === 'WEIGHTED' && index === 0 ? 2 : 1,
    entrantCount: eligibleCount - index,
    totalWeight: eligibleCount + (chanceMode === 'WEIGHTED' ? 3 : 0) - index,
    duplicateEntryCount: chanceMode === 'WEIGHTED' ? 3 : 0,
    weightBreakdown: chanceMode === 'WEIGHTED'
      ? [{ weight: 1, peopleCount: Math.max(0, eligibleCount - 3 - index) }, { weight: 2, peopleCount: 3 }]
      : [{ weight: 1, peopleCount: eligibleCount - index }],
    eligibilityFrozenAt: drawOverrides.frozenAt ?? null,
    drawnAt: isoMinutesFromNow(-30 + index * 12),
    undoneAt: null,
    notificationStatus: 'SENT' as const,
  }));

  return {
    id: PRIZE_DRAW_STORY_ID,
    title: 'Sorteio de boas-vindas',
    description: 'Brindes acadêmicos para participantes presentes na abertura.',
    target: { type: 'EVENT', id: PRIZE_DRAW_STORY_TARGET_ID, name: 'Abertura da SECOMPP' },
    includePresent: true,
    includeSubscribers: true,
    includeManualEntries: false,
    chanceMode,
    spinLimit: 3,
    removeWinnerAfterDraw: true,
    defaultSpeed: 'DRAMATIC',
    dramaticCountdownSeconds: 3,
    notifyWinner: true,
    frozenAt: null,
    unfrozenAt: null,
    revision: 4,
    plannedSpins: [
      { id: 'planned-1', position: 1, description: 'Kit institucional', speed: 'DRAMATIC', countdownSeconds: 3 },
      { id: 'planned-2', position: 2, description: 'Vale-livros', speed: 'QUICK', countdownSeconds: null },
      { id: 'planned-3', position: 3, description: 'Camiseta do evento', speed: 'DRAMATIC', countdownSeconds: 5 },
    ],
    manualEntries: [],
    weightOverrides: chanceMode === 'WEIGHTED'
      ? [{ personId: 'story-1', weight: 2 }, { personId: 'story-8', weight: 2 }]
      : [],
    excludedPeople: [],
    spins,
    eligibleEntrantCount: eligibleCount,
    eligibleTotalWeight: eligibleCount + (chanceMode === 'WEIGHTED' ? 3 : 0),
    eligibleDuplicateEntryCount: chanceMode === 'WEIGHTED' ? 3 : 0,
    createdAt: isoMinutesFromNow(-180),
    updatedAt: isoMinutesFromNow(-2),
    ...drawOverrides,
  };
}

export function createPrizeDrawSpinResultStory(
  input: {
    speed?: PrizeDrawSpinResult['speed'];
    rosterSize?: number;
    winnerFullName?: string;
    countdownSeconds?: 3 | 5;
    durationScale?: number;
    demo?: boolean;
  } = {},
): PrizeDrawSpinResult {
  const speed = input.speed ?? 'QUICK';
  const rosterSize = Math.min(Math.max(input.rosterSize ?? 18, 1), prizeDrawStoryFullNames.length);
  const winnerFullName = input.winnerFullName ?? prizeDrawStoryFullNames[2];
  const roster = prizeDrawStoryFullNames.slice(0, rosterSize).filter((name) => name !== winnerFullName);
  const winnerIndex = Math.min(Math.max(Math.floor(rosterSize * 0.58), 0), rosterSize - 1);
  roster.splice(winnerIndex, 0, winnerFullName);
  const fullNames = roster.slice(0, rosterSize);
  const scale = Math.min(Math.max(input.durationScale ?? 1, 0.2), 2);
  const baseDuration = speed === 'DRAMATIC' ? 6000 : speed === 'QUICK' ? 2500 : 0;
  const basePause = speed === 'DRAMATIC' ? 650 : speed === 'QUICK' ? 180 : 0;

  return {
    demo: input.demo ?? false,
    drawId: PRIZE_DRAW_STORY_ID,
    spinId: input.demo ? null : PRIZE_DRAW_STORY_SPIN_ID,
    sequence: input.demo ? null : 3,
    drawTitle: 'Sorteio de boas-vindas',
    spinDescription: 'Camiseta do evento',
    winnerFullName,
    winnerReelName: toPrizeDrawReelName(winnerFullName),
    winnerReelIndex: winnerIndex,
    reelNames: fullNames.map(toPrizeDrawReelName),
    speed,
    countdownMs: speed === 'DRAMATIC' ? (input.countdownSeconds ?? 3) * 1000 : 0,
    reelDurationMs: Math.round(baseDuration * scale),
    preRevealPauseMs: Math.round(basePause * scale),
    hasMoreSpins: true,
  };
}

export const prizeDrawStoryEvents = [
  { id: PRIZE_DRAW_STORY_TARGET_ID, name: 'Abertura da SECOMPP' },
  { id: 'event-story-2', name: 'Arquitetura Angular com Signals' },
  { id: 'event-story-3', name: 'Acessibilidade em produtos digitais' },
];

export const prizeDrawStoryMajorEvents = [
  { id: 'major-story-1', name: 'SECOMPP' },
  { id: 'major-story-2', name: 'Semana de Integração Acadêmica' },
];
