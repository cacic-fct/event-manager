import { PrizeDrawChanceMode, PrizeDrawSpeed } from '@cacic-fct/event-manager-admin-contracts';
import { delay, graphql, HttpResponse } from 'msw';
import {
  createPrizeDrawSpinResultStory,
  createPrizeDrawStory,
  createPrizeDrawStoryEntries,
  prizeDrawStoryEvents,
  prizeDrawStoryMajorEvents,
  prizeDrawStoryWinnerContact,
} from './prize-draw-story.fixtures';

export type AdminPrizeDrawStoryState = {
  chanceMode: PrizeDrawChanceMode;
  frozen: boolean;
  resultsCount: number;
  eligibleCount: number;
  empty: boolean;
  requestDelay: number;
  speed: PrizeDrawSpeed;
  winnerName: string;
  countdownSeconds: 3 | 5;
};

export function createAdminPrizeDrawStoryHandlers(readState: () => AdminPrizeDrawStoryState) {
  const respond = async <T extends Record<string, unknown>>(data: T) => {
    const wait = readState().requestDelay;
    if (wait > 0) await delay(wait);
    return HttpResponse.json<{ data: T }>({ data });
  };
  const draw = () => {
    const state = readState();
    return createPrizeDrawStory({
      chanceMode: state.chanceMode,
      frozenAt: state.frozen ? new Date(Date.now() - 20 * 60_000).toISOString() : null,
      resultsCount: state.resultsCount,
      eligibleCount: state.eligibleCount,
    });
  };

  return [
    graphql.query('PrizeDraws', () => respond({ prizeDraws: readState().empty ? [] : [draw()] })),
    graphql.query('PrizeDraw', () => respond({ prizeDraw: draw() })),
    graphql.query('PrizeDrawEligibleEntries', () =>
      respond({
        prizeDrawEligibleEntries:
          readState().eligibleCount > 0
            ? createPrizeDrawStoryEntries(readState().eligibleCount)
            : [],
      }),
    ),
    graphql.query('ListEvents', () => respond({ events: prizeDrawStoryEvents })),
    graphql.query('ListMajorEvents', () => respond({ majorEvents: prizeDrawStoryMajorEvents })),
    graphql.query('ListPeopleSummaries', () =>
      respond({
        people: createPrizeDrawStoryEntries(8).map((entry, index) => ({
          id: entry.personId,
          name: entry.displayName,
          email: `participante.${index + 1}@example.com`,
          identityDocument: null,
          academicId: String(202600000 + index),
          createdAt: new Date(Date.now() - (index + 2) * 86_400_000).toISOString(),
          updatedAt: new Date().toISOString(),
        })),
      }),
    ),
    graphql.query('PrizeDrawWinnerContact', () =>
      respond({
        prizeDrawWinnerContact: {
          spinId: draw().spins[0]?.id,
          ...prizeDrawStoryWinnerContact,
        },
      }),
    ),
    graphql.mutation('SavePrizeDraw', () => respond({ savePrizeDraw: draw() })),
    graphql.mutation('PrizeDrawAction', () =>
      respond({
        freezePrizeDrawEligibility: draw(),
        unfreezePrizeDrawEligibility: draw(),
        undoLastPrizeDrawSpin: draw(),
      }),
    ),
    graphql.mutation('SpinPrizeDraw', ({ variables }) => {
      const state = readState();
      const demo = Boolean((variables['input'] as { demo?: boolean } | undefined)?.demo);
      return respond({
        spinPrizeDraw: createPrizeDrawSpinResultStory({
          speed: state.speed,
          rosterSize: state.eligibleCount,
          winnerFullName: state.winnerName,
          countdownSeconds: state.countdownSeconds,
          demo,
        }),
      });
    }),
    graphql.mutation('AcknowledgePrizeDrawPresentation', () =>
      respond({ acknowledgePrizeDrawPresentation: true }),
    ),
  ];
}
