import { PublicPrizeDraw } from '@cacic-fct/event-manager-public-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';

faker.seed(20260826);

const baseNow = Date.now();

export function publicPrizeDrawStoryId(index = 0): string {
  return `019d2a25-4b40-7b2e-82a4-28f596d0b65${(7 + index).toString(16)}`;
}

function isoMinutesFromNow(minutes: number): string {
  return new Date(baseNow + minutes * 60_000).toISOString();
}

export function createPublicPrizeDrawStory(
  overrides: Partial<PublicPrizeDraw> & { spinCount?: number } = {},
): PublicPrizeDraw {
  const spinCount = overrides.spinCount ?? 3;
  const chanceMode = overrides.chanceMode ?? 'EQUAL';
  const frozenAt = overrides.frozenAt ?? null;
  const spins = Array.from({ length: spinCount }, (_, index) => {
    const entrantCount = 42 - index;
    const weighted = chanceMode === 'WEIGHTED';
    return {
      id: `019d2a25-5694-7f19-b954-8a98f7bb9a${43 + index}`,
      sequence: index + 1,
      description: ['Kit institucional', 'Vale-livros', 'Camiseta do evento'][index] ?? `Prêmio ${index + 1}`,
      speed: index === 0 ? ('DRAMATIC' as const) : ('QUICK' as const),
      countdownSeconds: index === 0 ? 3 : null,
      chanceMode,
      removeWinnerAfterDraw: true,
      winnerDisplayName:
        ['Ana S.', 'Bruno A.', 'Carla C.'][index] ??
        `${faker.person.firstName()} ${faker.person.lastName().charAt(0)}.`,
      winnerWeight: weighted && index === 0 ? 2 : 1,
      entrantCount,
      totalWeight: entrantCount + (weighted ? 5 : 0),
      duplicateEntryCount: weighted ? 5 : 0,
      weightBreakdown: weighted
        ? [
            { weight: 1, peopleCount: entrantCount - 5 },
            { weight: 2, peopleCount: 5 },
          ]
        : [{ weight: 1, peopleCount: entrantCount }],
      eligibilityFrozenAt: frozenAt,
      drawnAt: isoMinutesFromNow(-45 + index * 14),
    };
  });

  return {
    id: publicPrizeDrawStoryId(),
    title: 'Sorteio de boas-vindas',
    description: 'Brindes acadêmicos sorteados durante a abertura.',
    target: { type: 'EVENT', id: 'event-story-1', name: 'Abertura da SECOMPP' },
    includePresent: true,
    includeSubscribers: true,
    includeManualEntries: false,
    chanceMode,
    spinLimit: 3,
    removeWinnerAfterDraw: true,
    frozenAt,
    revision: 6,
    spins,
    createdAt: isoMinutesFromNow(-180),
    updatedAt: isoMinutesFromNow(-3),
    ...overrides,
  };
}
